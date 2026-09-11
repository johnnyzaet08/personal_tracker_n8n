import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  emailProcessingResultSchema,
  emailSourceConfigurationSchema,
  emailSyncRunSchema,
  financialTransactionCandidateSchema,
  type EmailProcessingResult,
  type EmailSourceConfigurationInput,
  type EmailSourceConfigurationPatch,
  type EmailSyncPreviewRequest,
  type EmailSyncRun,
  type EmailSyncRunResult,
  type FinancialTransactionCandidate,
} from '@tracker/contracts';
import { Prisma } from '@tracker/database';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { extractGmailSender, parseGmailMessage } from '../email-ingestion/bank-purchase-adapter';
import {
  findRecurringObligationMatches,
  jsonObject,
  type RecurringObligationMatch,
} from '../finance/recurring-reconciliation';
import {
  ACTIVE_RUN_STATES,
  EMAIL_ADAPTERS,
  EMAIL_TIMEZONE,
  canonicalAmount,
  canonicalText,
  currentPeriod,
  digest,
  emptyRunResult,
  financialIdentity,
  gmailQuery,
  inFinancialPeriod,
  localDate,
} from './email-sync.policy';

type Source = Prisma.EmailSourceGetPayload<Record<string, never>>;
type Run = Prisma.EmailSyncRunGetPayload<Record<string, never>>;
type CandidateRow = Prisma.EmailSyncCandidateGetPayload<Record<string, never>>;
type ParsedMessage = ReturnType<typeof parseGmailMessage>;
type Database = Prisma.TransactionClient;
type Page = { page: number; pageSize: number };

function problem(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function pagination(query: Page, total: number) {
  return { ...query, total, totalPages: Math.ceil(total / query.pageSize) };
}
function safeCandidate(candidate: FinancialTransactionCandidate): FinancialTransactionCandidate {
  // The fixed allowlist prevents future adapter additions from retaining email or transport data.
  return financialTransactionCandidateSchema.parse({
    schemaVersion: 1,
    candidateId: candidate.candidateId,
    tenantId: candidate.tenantId,
    sourceEventId: candidate.sourceEventId,
    externalReference: candidate.externalReference,
    accountId: candidate.accountId,
    direction: candidate.direction,
    transactionType: candidate.transactionType,
    amount: canonicalAmount(candidate.amount),
    currency: candidate.currency,
    description: candidate.description,
    merchant: candidate.merchant,
    maskedIdentifier: candidate.maskedIdentifier,
    occurredAt: candidate.occurredAt,
    confidence: candidate.confidence,
    requiresReview: candidate.requiresReview,
    adapter: candidate.adapter,
    rawMetadata: {},
  });
}

@Injectable()
export class EmailSyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private recovering = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.recoverPending();
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async options(tenantId: string) {
    const [integrations, accounts] = await Promise.all([
      this.prisma.client.integration.findMany({
        where: { tenantId, provider: 'gmail', type: 'email' },
        select: { id: true, provider: true, status: true },
      }),
      this.prisma.client.account.findMany({
        where: { tenantId, status: 'active' },
        select: { id: true, alias: true, currency: true },
        orderBy: { alias: 'asc' },
        take: 100,
      }),
    ]);
    return {
      integrations,
      accounts,
      adapters: EMAIL_ADAPTERS,
      currentMonth: localDate().slice(0, 7),
      today: localDate(),
      timezone: EMAIL_TIMEZONE,
    };
  }

  async listSources(tenantId: string, query: Page) {
    const where = { tenantId };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.emailSource.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.emailSource.count({ where }),
    ]);
    return { data: rows.map((row) => this.sourceView(row)), pagination: pagination(query, total) };
  }

  async createSource(tenantId: string, input: EmailSourceConfigurationInput) {
    await this.validateConfiguration(tenantId, input);
    const { schemaVersion: _version, ...data } = input;
    void _version;
    try {
      return this.sourceView(
        await this.prisma.client.emailSource.create({ data: { ...data, tenantId } }),
      );
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException({
          code: 'SOURCE_ALREADY_EXISTS',
          message: 'This sender is already configured for the connection',
        });
      throw error;
    }
  }

  async patchSource(tenantId: string, id: string, input: EmailSourceConfigurationPatch) {
    const source = await this.getSource(tenantId, id);
    await this.validateConfiguration(tenantId, {
      ...this.sourceView(source),
      ...input,
      schemaVersion: 1,
    });
    const { schemaVersion: _version, ...data } = input;
    void _version;
    try {
      return this.sourceView(
        await this.prisma.client.$transaction(async (tx) => {
          await this.lockTenant(tx, tenantId);
          const active = await tx.emailSyncRun.count({
            where: { tenantId, sourceId: id, status: { in: ACTIVE_RUN_STATES } },
          });
          const changesParsing = [
            'integrationId',
            'senderAddress',
            'institutionName',
            'adapterKey',
            'accountId',
            'defaultCurrency',
          ].some((key) => key in data);
          if (active && changesParsing)
            throw new ConflictException({
              code: 'SOURCE_SYNC_ACTIVE',
              message:
                'Complete or discard the active preview before changing source parsing configuration',
            });
          return tx.emailSource.update({ where: { tenantId_id: { tenantId, id } }, data });
        }),
      );
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException({
          code: 'SOURCE_ALREADY_EXISTS',
          message: 'This sender is already configured for the connection',
        });
      throw error;
    }
  }

  async match(tenantId: string, sender: string, mode: 'automatic' | 'manual' = 'automatic') {
    const source = await this.prisma.client.emailSource.findFirst({
      where: {
        tenantId,
        senderAddress: sender.trim().toLowerCase(),
        status: 'active',
        ...(mode === 'automatic' ? { autoIngestionEnabled: true } : { manualSyncEnabled: true }),
      },
    });
    return { source: source ? this.sourceView(source) : null };
  }

  async preview(
    tenantId: string,
    sourceId: string,
    input: EmailSyncPreviewRequest,
    correlationId: string,
  ): Promise<EmailSyncRun> {
    const source = await this.getSource(tenantId, sourceId);
    this.ensureEnabled(source, 'manual');
    let period;
    try {
      period = currentPeriod(input.period, input.exactDate);
    } catch {
      throw problem('DATE_OUTSIDE_CURRENT_MONTH', 'Only the current calendar month is allowed');
    }
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const previous = await this.prisma.client.emailSyncRun.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (previous) {
      if (
        previous.sourceId !== sourceId ||
        previous.periodMode !== input.period ||
        previous.exactDate !== period.exactDate
      )
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Request key was already used for a different preview',
        });
      return this.run(tenantId, previous.id);
    }
    await this.expireRuns(tenantId, sourceId);
    let run: Run;
    try {
      run = await this.prisma.client.emailSyncRun.create({
        data: {
          tenantId,
          sourceId,
          idempotencyKey,
          correlationId,
          periodMode: input.period,
          periodMonth: period.month,
          exactDate: period.exactDate,
          status: 'pending',
          result: json(emptyRunResult()),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException({
          code: 'SOURCE_SYNC_ACTIVE',
          message: 'This source already has an active synchronization',
        });
      throw error;
    }
    void this.dispatch(run, 'preview');
    return this.run(tenantId, run.id);
  }

  async listRuns(tenantId: string, query: Page, sourceId?: string) {
    await this.expireRuns(tenantId, sourceId);
    const where = { tenantId, ...(sourceId ? { sourceId } : {}) };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.emailSyncRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.emailSyncRun.count({ where }),
    ]);
    return {
      data: await Promise.all(rows.map((row) => this.run(tenantId, row.id))),
      pagination: pagination(query, total),
    };
  }

  async run(tenantId: string, id: string): Promise<EmailSyncRun> {
    await this.expireRuns(tenantId);
    const run = await this.getRun(tenantId, id);
    const candidates = await this.prisma.client.emailSyncCandidate.findMany({
      where: { tenantId, runId: id },
      orderBy: { receivedAt: 'desc' },
      take: 10,
    });
    return emailSyncRunSchema.parse({
      schemaVersion: 1,
      id: run.id,
      tenantId,
      sourceId: run.sourceId,
      status: run.status,
      period: run.periodMode,
      periodMonth: run.periodMonth,
      exactDate: run.exactDate,
      result: run.result,
      candidates: candidates.map((row) => ({
        id: row.id,
        messageId: row.messageId,
        receivedAt: row.receivedAt.toISOString(),
        eligible: row.eligible,
        selected: row.selected,
        classification: row.classification,
        financial: row.candidate ?? undefined,
        reasonCodes: row.reasonCodes,
        processingResult: row.processingResult ?? undefined,
      })),
      lastErrorCode: run.lastErrorCode,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      expiresAt: run.expiresAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    });
  }

  async select(tenantId: string, id: string, candidateIds: string[]) {
    const run = await this.getRun(tenantId, id);
    this.ensureCurrentRun(run);
    const source = await this.getSource(tenantId, run.sourceId);
    this.ensureEnabled(source, 'manual');
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const current = await tx.emailSyncRun.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id } },
      });
      this.ensureCurrentRun(current);
      if (
        current.status === 'processing' ||
        current.status === 'completed' ||
        current.status === 'partially_completed'
      ) {
        const selected = await tx.emailSyncCandidate.findMany({
          where: { tenantId, runId: id, selected: true },
          select: { id: true },
        });
        if (
          selected.length === candidateIds.length &&
          selected.every((row) => candidateIds.includes(row.id))
        )
          return;
        throw new ConflictException({
          code: 'SELECTION_ALREADY_SUBMITTED',
          message: 'This preview already has a different selection',
        });
      }
      if (current.status !== 'awaiting_selection')
        throw problem('PREVIEW_NOT_READY', 'The preview is not awaiting selection');
      const candidates = await tx.emailSyncCandidate.findMany({
        where: { tenantId, runId: id, id: { in: candidateIds }, eligible: true },
      });
      if (candidates.length !== candidateIds.length)
        throw problem('INVALID_SELECTION', 'Select only eligible candidates from this preview');
      await tx.emailSyncCandidate.updateMany({
        where: { tenantId, runId: id, id: { in: candidateIds } },
        data: { selected: true },
      });
      const result = {
        ...(current.result as unknown as EmailSyncRunResult),
        selected: candidates.length,
      };
      await tx.emailSyncRun.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          status: 'processing',
          result: json(result),
          lastErrorCode: null,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
    });
    const latest = await this.getRun(tenantId, id);
    if (latest.status === 'processing') void this.dispatch(latest, 'process');
    return this.run(tenantId, id);
  }

  async cancel(tenantId: string, id: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const changed = await tx.emailSyncRun.updateMany({
        where: { tenantId, id, status: 'awaiting_selection' },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      if (!changed.count)
        throw problem('RUN_NOT_CANCELLABLE', 'Only a preview awaiting selection can be cancelled');
    });
    return this.run(tenantId, id);
  }

  async context(tenantId: string, id: string) {
    const run = await this.getRun(tenantId, id);
    this.ensureCurrentRun(run);
    if (!['pending', 'fetching', 'processing'].includes(run.status))
      throw problem('RUN_NOT_ACTIVE', 'The synchronization is not active');
    const source = await this.getSource(tenantId, run.sourceId);
    this.ensureEnabled(source, 'manual');
    const selected = await this.prisma.client.emailSyncCandidate.findMany({
      where: { tenantId, runId: id, selected: true, processingResult: { equals: Prisma.DbNull } },
      select: { messageId: true },
      take: 10,
    });
    return {
      run: await this.run(tenantId, id),
      source: this.sourceView(source),
      query: gmailQuery(source.senderAddress, run.periodMonth, run.exactDate),
      messageIds: selected.map((row) => row.messageId),
      limit: 10,
    };
  }

  async progress(tenantId: string, id: string, status: 'fetching' | 'processing') {
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const run = await tx.emailSyncRun.findUnique({ where: { tenantId_id: { tenantId, id } } });
      if (!run) throw new NotFoundException('Synchronization not found for this tenant');
      this.ensureCurrentRun(run);
      const allowed = status === 'fetching' ? ['pending', 'fetching'] : ['processing'];
      if (!allowed.includes(run.status))
        throw problem(
          'INVALID_RUN_TRANSITION',
          'The synchronization state does not allow this progress update',
        );
      await tx.emailSyncRun.update({
        where: { tenantId_id: { tenantId, id } },
        data: { status, lastErrorCode: null },
      });
    });
    return { accepted: true };
  }

  async candidates(tenantId: string, id: string, messages: unknown[]) {
    await this.prisma.client.$transaction(
      async (tx) => {
        await this.lockTenant(tx, tenantId);
        const run = await tx.emailSyncRun.findUnique({ where: { tenantId_id: { tenantId, id } } });
        if (!run) throw new NotFoundException('Synchronization not found for this tenant');
        this.ensureCurrentRun(run);
        const source = await tx.emailSource.findUniqueOrThrow({
          where: { tenantId_id: { tenantId, id: run.sourceId } },
        });
        this.ensureEnabled(source, 'manual');
        if (run.status === 'awaiting_selection') return;
        if (!['pending', 'fetching'].includes(run.status))
          throw problem('INVALID_RUN_TRANSITION', 'This run cannot receive a preview');
        // Preview extraction stores only a fixed financial projection, never source events or ledger rows.
        for (const message of messages.slice(0, 10)) {
          let sender: string;
          try {
            sender = extractGmailSender(message);
          } catch {
            continue;
          }
          if (sender !== source.senderAddress) continue;
          if ((await tx.emailSyncCandidate.count({ where: { tenantId, runId: id } })) >= 10) break;
          let parsed: ParsedMessage;
          try {
            parsed = this.parse(message, source);
          } catch {
            const item = message as Record<string, unknown>;
            const messageId =
              typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(item.id)
                ? item.id
                : null;
            if (!messageId) continue;
            await tx.emailSyncCandidate.upsert({
              where: { tenantId_runId_messageId: { tenantId, runId: id, messageId } },
              create: {
                tenantId,
                runId: id,
                sourceId: source.id,
                messageId,
                receivedAt: new Date(),
                contentHash: digest({ messageId, invalid: true }),
                classification: 'invalid',
                eligible: false,
                reasonCodes: json(['INVALID_EMAIL_MESSAGE']),
              },
              update: {},
            });
            continue;
          }
          if (!parsed.event.labels?.includes('UNREAD')) continue;
          const classification = await this.classify(tx, source, parsed, run);
          const candidate = parsed.adapterResult.candidate
            ? safeCandidate(parsed.adapterResult.candidate)
            : undefined;
          await tx.emailSyncCandidate.upsert({
            where: {
              tenantId_runId_messageId: { tenantId, runId: id, messageId: parsed.event.externalId },
            },
            create: {
              tenantId,
              runId: id,
              sourceId: source.id,
              messageId: parsed.event.externalId,
              threadId: this.threadId(parsed),
              receivedAt: new Date(parsed.event.receivedAt),
              contentHash: parsed.contentHash,
              classification: classification.classification,
              eligible: !['ignored_outside_period', 'invalid'].includes(
                classification.classification,
              ),
              candidate: candidate ? json(candidate) : Prisma.DbNull,
              reasonCodes: json(classification.reasonCodes),
            },
            update: {},
          });
        }
        const rows = await tx.emailSyncCandidate.findMany({ where: { tenantId, runId: id } });
        await tx.integration.updateMany({
          where: { tenantId, id: source.integrationId },
          data: { status: 'connected', lastSyncAt: new Date() },
        });
        await tx.emailSource.update({
          where: { tenantId_id: { tenantId, id: source.id } },
          data: { lastSyncAt: new Date(), lastResult: 'awaiting_selection', lastErrorCode: null },
        });
        await tx.emailSyncRun.update({
          where: { tenantId_id: { tenantId, id } },
          data: {
            status: 'awaiting_selection',
            result: json(this.resultFor(rows)),
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
      },
      { timeout: 15_000 },
    );
    return this.run(tenantId, id);
  }

  async processMessage(
    tenantId: string,
    id: string,
    message: unknown,
  ): Promise<EmailProcessingResult> {
    const run = await this.getRun(tenantId, id);
    this.ensureCurrentRun(run);
    const source = await this.getSource(tenantId, run.sourceId);
    this.ensureEnabled(source, 'manual');
    if (run.status !== 'processing')
      throw problem('RUN_NOT_PROCESSING', 'The run is not processing a selection');
    if (extractGmailSender(message) !== source.senderAddress)
      throw problem('SENDER_MISMATCH', 'The fetched message is not from the selected source');
    const parsed = this.parse(message, source);
    const row = await this.prisma.client.emailSyncCandidate.findUnique({
      where: {
        tenantId_runId_messageId: { tenantId, runId: id, messageId: parsed.event.externalId },
      },
    });
    if (!row?.selected)
      throw problem('MESSAGE_NOT_SELECTED', 'This message was not explicitly selected');
    if (row.processingResult) return emailProcessingResultSchema.parse(row.processingResult);
    const result = await this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const fresh = await tx.emailSyncCandidate.findUniqueOrThrow({ where: { id: row.id } });
      if (fresh.processingResult) return emailProcessingResultSchema.parse(fresh.processingResult);
      const freshRun = await tx.emailSyncRun.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id } },
      });
      const freshSource = await tx.emailSource.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id: source.id } },
      });
      this.ensureCurrentRun(freshRun);
      this.ensureEnabled(freshSource, 'manual');
      if (freshRun.status !== 'processing')
        throw problem('RUN_NOT_PROCESSING', 'The run is not processing a selection');
      let processed: EmailProcessingResult;
      if (!parsed.event.labels?.includes('UNREAD'))
        processed = {
          schemaVersion: 1,
          messageId: parsed.event.externalId,
          classification: 'invalid',
          reasonCodes: ['MESSAGE_ALREADY_READ'],
        };
      else if (parsed.contentHash !== row.contentHash)
        processed = await this.persist(
          tx,
          freshSource,
          parsed,
          freshRun,
          'PREVIEW_CONTENT_CHANGED',
        );
      else processed = await this.persist(tx, freshSource, parsed, freshRun);
      await tx.emailSyncCandidate.update({
        where: { id: row.id },
        data: { processingResult: json(processed) },
      });
      await this.refreshResult(tx, freshRun);
      return processed;
    });
    return result;
  }

  async automatic(tenantId: string, message: unknown): Promise<object> {
    const sender = extractGmailSender(message);
    const source = await this.prisma.client.emailSource.findFirst({
      where: { tenantId, senderAddress: sender, status: 'active', autoIngestionEnabled: true },
    });
    if (!source) return { accepted: false, reasonCode: 'SOURCE_NOT_ENABLED' };
    return this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const current = await tx.emailSource.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id: source.id } },
      });
      this.ensureEnabled(current, 'automatic');
      if (sender !== current.senderAddress)
        return { accepted: false, reasonCode: 'SOURCE_CONFIGURATION_CHANGED' };
      const parsed = this.parse(message, current);
      if (!parsed.event.labels?.includes('UNREAD'))
        return { accepted: false, reasonCode: 'MESSAGE_ALREADY_READ' };
      const result = await this.persist(tx, current, parsed);
      await tx.integration.updateMany({
        where: { tenantId, id: current.integrationId },
        data: { status: 'connected', lastSyncAt: new Date() },
      });
      await tx.emailSource.update({
        where: { tenantId_id: { tenantId, id: source.id } },
        data: { lastSyncAt: new Date(), lastResult: result.classification, lastErrorCode: null },
      });
      return result;
    });
  }

  async complete(tenantId: string, id: string, errorCode?: string) {
    const run = await this.getRun(tenantId, id);
    if (
      ['completed', 'partially_completed', 'failed', 'cancelled', 'awaiting_selection'].includes(
        run.status,
      )
    )
      return this.run(tenantId, id);
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const current = await tx.emailSyncRun.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id } },
      });
      if (
        ['completed', 'partially_completed', 'failed', 'cancelled', 'awaiting_selection'].includes(
          current.status,
        )
      )
        return;
      const result = await this.refreshResult(tx, current);
      const processed = await tx.emailSyncCandidate.count({
        where: { tenantId, runId: id, selected: true, processingResult: { not: Prisma.DbNull } },
      });
      if (errorCode)
        result.errors = [
          {
            code: 'GMAIL_EXECUTION_FAILED',
            message: 'Gmail could not finish the requested operation',
          },
        ];
      const unfinished = result.selected > processed;
      if (unfinished && !errorCode)
        result.errors = [
          {
            code: 'INCOMPLETE_SELECTION',
            message: 'Some selected messages could not be processed',
          },
        ];
      const status = result.errors.length
        ? processed > 0
          ? 'partially_completed'
          : 'failed'
        : 'completed';
      await tx.emailSyncRun.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          status,
          result: json(result),
          lastErrorCode: result.errors[0]?.code ?? null,
          completedAt: new Date(),
        },
      });
      await tx.emailSource.update({
        where: { tenantId_id: { tenantId, id: run.sourceId } },
        data: {
          lastSyncAt: new Date(),
          lastResult: status,
          lastErrorCode: result.errors[0]?.code ?? null,
        },
      });
    });
    return this.run(tenantId, id);
  }

  private async classify(
    db: Database,
    source: Source,
    parsed: ParsedMessage,
    run?: Run,
  ): Promise<EmailProcessingResult> {
    const result: EmailProcessingResult = {
      schemaVersion: 1,
      messageId: parsed.event.externalId,
      classification: 'new',
      reasonCodes: [],
    };
    const candidate = parsed.adapterResult.candidate;
    if (
      candidate &&
      !inFinancialPeriod(
        candidate.occurredAt,
        run?.periodMonth ?? localDate().slice(0, 7),
        run?.exactDate,
      )
    )
      return {
        ...result,
        classification: 'ignored_outside_period',
        reasonCodes: ['OUTSIDE_CURRENT_PERIOD'],
      };
    const existing = await db.sourceEvent.findUnique({
      where: {
        tenantId_source_externalId: {
          tenantId: source.tenantId,
          source: 'gmail',
          externalId: parsed.event.externalId,
        },
      },
    });
    if (existing) {
      if (existing.payloadHash !== parsed.contentHash)
        return {
          ...result,
          classification: 'conflict',
          sourceEventId: existing.id,
          reasonCodes: ['MESSAGE_CONTENT_CHANGED'],
        };
      return { ...result, classification: 'already_processed', sourceEventId: existing.id };
    }
    if (!candidate || parsed.adapterResult.requiresReview || candidate.requiresReview)
      return {
        ...result,
        classification: 'requires_review',
        reasonCodes: parsed.adapterResult.reasonCodes.length
          ? parsed.adapterResult.reasonCodes
          : ['MISSING_FINANCIAL_FIELDS'],
      };
    const identity = financialIdentity(source, candidate);
    const transaction =
      (await db.transaction.findUnique({
        where: {
          tenantId_reconciliationKey: {
            tenantId: source.tenantId,
            reconciliationKey: identity.reconciliationKey,
          },
        },
        include: { merchant: true },
      })) ??
      (await db.transaction.findFirst({
        where: {
          tenantId: source.tenantId,
          reconciliationKey: null,
          ...(candidate.externalReference
            ? { externalReference: candidate.externalReference }
            : {
                externalReference: null,
                occurredAt: new Date(candidate.occurredAt),
                amount: new Prisma.Decimal(candidate.amount),
                currency: candidate.currency,
                merchant: { canonicalName: canonicalText(candidate.merchant) },
              }),
          OR: [
            ...(source.accountId ? [{ accountId: source.accountId }] : []),
            { account: { institutionName: source.institutionName } },
            { sourceEvent: { payload: { path: ['sender'], equals: source.senderAddress } } },
            {
              sourceEvent: {
                payload: { path: ['sender', 'address'], equals: source.senderAddress },
              },
            },
          ],
        },
        include: { merchant: true },
      }));
    if (transaction) {
      const identical =
        transaction.manuallyModifiedAt === null &&
        transaction.amount.toFixed(4) === canonicalAmount(candidate.amount) &&
        transaction.currency === candidate.currency &&
        transaction.direction === candidate.direction &&
        (transaction.transactionType === candidate.transactionType ||
          (transaction.transactionType === 'recurring_payment' &&
            jsonObject(transaction.rawMetadata).originalTransactionType ===
              candidate.transactionType)) &&
        transaction.occurredAt.toISOString() === new Date(candidate.occurredAt).toISOString() &&
        canonicalText(transaction.description) === canonicalText(candidate.description) &&
        canonicalText(transaction.merchant?.canonicalName) === canonicalText(candidate.merchant) &&
        transaction.accountId === (source.accountId ?? null) &&
        transaction.status !== 'void';
      return {
        ...result,
        classification: identical ? 'exact_duplicate' : 'conflict',
        transactionId: transaction.id,
        reasonCodes: identical ? [] : ['FINANCIAL_DIFFERENCE'],
      };
    }
    return result;
  }

  private async persist(
    db: Database,
    source: Source,
    parsed: ParsedMessage,
    run?: Run,
    forceReview?: string,
  ): Promise<EmailProcessingResult> {
    let result = await this.classify(db, source, parsed, run);
    if (result.classification === 'already_processed') return result;
    if (forceReview && result.classification !== 'ignored_outside_period')
      result = { ...result, classification: 'conflict', reasonCodes: [forceReview] };
    let recurringMatch: RecurringObligationMatch | undefined;
    if (result.classification === 'new' && parsed.adapterResult.candidate) {
      const matches = await findRecurringObligationMatches(
        db,
        safeCandidate(parsed.adapterResult.candidate),
      );
      if (matches.length > 1) {
        result = {
          ...result,
          classification: 'conflict',
          reasonCodes: ['MULTIPLE_RECURRING_MATCHES'],
        };
      } else {
        recurringMatch = matches[0];
        if (recurringMatch?.transactionId) {
          result = {
            ...result,
            classification: 'exact_duplicate',
            transactionId: recurringMatch.transactionId,
          };
        }
      }
    }
    const existing = await db.sourceEvent.findUnique({
      where: {
        tenantId_source_externalId: {
          tenantId: source.tenantId,
          source: 'gmail',
          externalId: parsed.event.externalId,
        },
      },
    });
    const event =
      existing ??
      (await db.sourceEvent.create({
        data: {
          id: parsed.event.eventId,
          tenantId: source.tenantId,
          source: 'gmail',
          externalId: parsed.event.externalId,
          eventType: 'email.financial_observed',
          schemaVersion: 1,
          occurredAt: new Date(parsed.event.occurredAt),
          receivedAt: new Date(parsed.event.receivedAt),
          status: 'received',
          payloadHash: parsed.contentHash,
          payload: json({
            schemaVersion: 1,
            sender: source.senderAddress,
            threadId: this.threadId(parsed),
            adapter: parsed.adapterResult.adapter,
            sourceId: source.id,
            authentication: parsed.authentication,
            result: result.classification,
          }),
        },
      }));
    result = { ...result, sourceEventId: event.id };
    if (result.classification === 'exact_duplicate' && recurringMatch?.transactionId) {
      await db.recurringObligation.update({
        where: { id: recurringMatch.id },
        data: { reconciliationStatus: 'reconciled' },
      });
      await db.transaction.update({
        where: { id: recurringMatch.transactionId },
        data: {
          rawMetadata: json({
            ...jsonObject(recurringMatch.transaction?.rawMetadata ?? null),
            reconciledSourceEventId: event.id,
          }),
        },
      });
    }
    if (result.classification === 'new' && parsed.adapterResult.candidate) {
      const candidate = safeCandidate(parsed.adapterResult.candidate);
      const identity = financialIdentity(source, candidate);
      const merchant = candidate.merchant
        ? await db.merchant.upsert({
            where: {
              tenantId_canonicalName: {
                tenantId: source.tenantId,
                canonicalName: canonicalText(candidate.merchant),
              },
            },
            create: {
              tenantId: source.tenantId,
              canonicalName: canonicalText(candidate.merchant),
              displayName: candidate.merchant,
            },
            update: {},
          })
        : null;
      const transaction = await db.transaction.create({
        data: {
          tenantId: source.tenantId,
          sourceEventId: event.id,
          accountId: source.accountId,
          merchantId: merchant?.id,
          categoryId: recurringMatch?.categoryId,
          externalReference: candidate.externalReference,
          direction: candidate.direction,
          transactionType: recurringMatch ? 'recurring_payment' : candidate.transactionType,
          amount: new Prisma.Decimal(candidate.amount),
          currency: candidate.currency,
          description: candidate.description,
          occurredAt: new Date(candidate.occurredAt),
          confidence:
            candidate.confidence === undefined
              ? undefined
              : new Prisma.Decimal(candidate.confidence),
          requiresReview: false,
          status: 'posted',
          ...identity,
          rawMetadata: json({
            adapter: candidate.adapter,
            maskedIdentifier: candidate.maskedIdentifier,
            ...(recurringMatch
              ? {
                  recurringObligationId: recurringMatch.id,
                  originalTransactionType: candidate.transactionType,
                }
              : {}),
          }),
        },
      });
      if (recurringMatch) {
        const linked = await db.recurringObligation.updateMany({
          where: { id: recurringMatch.id, transactionId: null },
          data: {
            transactionId: transaction.id,
            actualAmount: transaction.amount,
            paidAt: transaction.occurredAt,
            paymentStatus: 'paid',
            reconciliationStatus: 'reconciled',
          },
        });
        if (linked.count !== 1)
          throw new ConflictException({
            code: 'RECURRING_RECONCILIATION_CONFLICT',
            message: 'The recurring obligation was reconciled concurrently',
          });
      }
      result = { ...result, transactionId: transaction.id };
    }
    if (['conflict', 'requires_review'].includes(result.classification)) {
      const review = await db.reviewQueue.upsert({
        where: { tenantId_sourceEventId: { tenantId: source.tenantId, sourceEventId: event.id } },
        create: {
          tenantId: source.tenantId,
          sourceEventId: event.id,
          reason: result.reasonCodes.join(',') || 'FINANCIAL_REVIEW_REQUIRED',
          priority: 'normal',
          proposedFinancialCandidate: parsed.adapterResult.candidate
            ? json(safeCandidate({ ...parsed.adapterResult.candidate, sourceEventId: event.id }))
            : Prisma.DbNull,
          proposedContentHash: parsed.contentHash,
        },
        update: {},
      });
      result = { ...result, reviewId: review.id };
    }
    await db.sourceEvent.update({
      where: { id: event.id },
      data: {
        status: ['conflict', 'requires_review'].includes(result.classification)
          ? 'needs_review'
          : result.classification === 'exact_duplicate'
            ? 'duplicate'
            : 'processed',
      },
    });
    return result;
  }

  private parse(message: unknown, source: Source): ParsedMessage {
    try {
      return parseGmailMessage(message, {
        tenantId: source.tenantId,
        adapterKey: source.adapterKey,
        defaultCurrency: source.defaultCurrency ?? undefined,
      });
    } catch {
      throw problem('INVALID_EMAIL_MESSAGE', 'The email message could not be parsed safely');
    }
  }
  private threadId(parsed: ParsedMessage): string | null {
    const id = parsed.event.metadata?.gmailThreadId;
    return typeof id === 'string' ? id.slice(0, 512) : null;
  }
  private sourceView(source: Source) {
    return emailSourceConfigurationSchema.parse({
      ...source,
      schemaVersion: 1,
      lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    });
  }
  private async getSource(tenantId: string, id: string): Promise<Source> {
    const source = await this.prisma.client.emailSource.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!source) throw new NotFoundException('Email source not found for this tenant');
    return source;
  }
  private async getRun(tenantId: string, id: string): Promise<Run> {
    const run = await this.prisma.client.emailSyncRun.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!run) throw new NotFoundException('Synchronization not found for this tenant');
    return run;
  }
  private ensureEnabled(source: Source, mode: 'manual' | 'automatic') {
    if (
      source.status !== 'active' ||
      !(mode === 'manual' ? source.manualSyncEnabled : source.autoIngestionEnabled)
    )
      throw problem(
        'SOURCE_NOT_ENABLED',
        'The selected email source is disabled for this operation',
      );
  }
  private ensureCurrentRun(run: Run) {
    if (run.periodMonth !== localDate().slice(0, 7) || run.expiresAt.getTime() <= Date.now())
      throw problem('RUN_EXPIRED', 'Start a new preview for the current month');
  }
  private async validateConfiguration(tenantId: string, input: EmailSourceConfigurationInput) {
    if (!EMAIL_ADAPTERS.some((adapter) => adapter.key === input.adapterKey))
      throw problem('UNKNOWN_ADAPTER', 'The email adapter is not supported');
    if (!/^[^\s"<>:]+@[^\s"<>:]+$/u.test(input.senderAddress))
      throw problem('INVALID_SENDER', 'A single sender mailbox is required');
    const integration = await this.prisma.client.integration.findFirst({
      where: { id: input.integrationId, tenantId, provider: 'gmail', type: 'email' },
    });
    if (!integration)
      throw problem('INVALID_INTEGRATION', 'Select a Gmail connection belonging to this tenant');
    if (
      input.accountId &&
      !(await this.prisma.client.account.findFirst({
        where: { id: input.accountId, tenantId, status: 'active' },
      }))
    )
      throw problem('INVALID_ACCOUNT', 'Select an active account belonging to this tenant');
  }
  private async lockTenant(db: Database, tenantId: string) {
    await db.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
  }
  private isUnique(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
  private resultFor(rows: CandidateRow[]): EmailSyncRunResult {
    const result = emptyRunResult();
    result.found = rows.length;
    result.eligible = rows.filter((row) => row.eligible).length;
    result.selected = rows.filter((row) => row.selected).length;
    for (const row of rows) {
      if (!row.processingResult) continue;
      const item = emailProcessingResultSchema.parse(row.processingResult);
      switch (item.classification) {
        case 'new':
          result.new++;
          break;
        case 'already_processed':
        case 'exact_duplicate':
          result.duplicates++;
          break;
        case 'conflict':
        case 'requires_review':
          result.inReview++;
          break;
        case 'ignored_outside_period':
          result.ignoredOutsidePeriod++;
          break;
        case 'invalid':
          result.invalid++;
          break;
      }
    }
    // Preview exclusions are visible even though they cannot be selected for persistence.
    result.ignoredOutsidePeriod += rows.filter(
      (row) => !row.selected && row.classification === 'ignored_outside_period',
    ).length;
    result.invalid += rows.filter(
      (row) => !row.selected && row.classification === 'invalid',
    ).length;
    return result;
  }
  private async refreshResult(db: Database, run: Run) {
    const rows = await db.emailSyncCandidate.findMany({
      where: { tenantId: run.tenantId, runId: run.id },
    });
    const result = this.resultFor(rows);
    await db.emailSyncRun.update({
      where: { tenantId_id: { tenantId: run.tenantId, id: run.id } },
      data: { result: json(result) },
    });
    return result;
  }
  private async expireRuns(tenantId?: string, sourceId?: string) {
    const where = {
      ...(tenantId ? { tenantId } : {}),
      ...(sourceId ? { sourceId } : {}),
      status: { in: ACTIVE_RUN_STATES },
      OR: [{ expiresAt: { lte: new Date() } }, { periodMonth: { not: localDate().slice(0, 7) } }],
    };
    const tenants = await this.prisma.client.emailSyncRun.findMany({
      where,
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 100,
    });
    for (const tenant of tenants)
      await this.prisma.client.$transaction(async (tx) => {
        await this.lockTenant(tx, tenant.tenantId);
        await tx.emailSyncRun.updateMany({
          where: { ...where, tenantId: tenant.tenantId },
          data: { status: 'failed', lastErrorCode: 'RUN_EXPIRED', completedAt: new Date() },
        });
      });
  }
  private async dispatch(run: Run, phase: 'preview' | 'process') {
    try {
      const base = this.config.getOrThrow<string>('N8N_INTERNAL_URL');
      const response = await fetch(
        `${base.replace(/\/$/u, '')}/webhook/${phase === 'preview' ? 'gmail-reconciliation-preview' : 'gmail-process-selected'}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-api-key': this.config.getOrThrow<string>('INTERNAL_API_KEY'),
            'x-correlation-id': run.correlationId,
          },
          body: JSON.stringify({
            tenantId: run.tenantId,
            runId: run.id,
            correlationId: run.correlationId,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('DISPATCH_FAILED');
      await response.body?.cancel();
      await this.prisma.client.emailSyncRun.updateMany({
        where: {
          tenantId: run.tenantId,
          id: run.id,
          status: { in: ['pending', 'fetching', 'processing'] },
        },
        data: { lastErrorCode: null },
      });
    } catch {
      await this.prisma.client.emailSyncRun
        .updateMany({
          where: { tenantId: run.tenantId, id: run.id, status: { in: ['pending', 'processing'] } },
          data: { lastErrorCode: 'N8N_DISPATCH_PENDING' },
        })
        .catch(() => undefined);
    }
  }
  private async recoverPending() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      await this.expireRuns();
      const rows = await this.prisma.client.emailSyncRun.findMany({
        where: {
          OR: [
            { status: 'pending' },
            {
              status: { in: ['fetching', 'processing'] },
              updatedAt: { lte: new Date(Date.now() - 60_000) },
            },
          ],
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });
      for (const run of rows)
        await this.dispatch(run, run.status === 'processing' ? 'process' : 'preview');
    } catch {
      /* A durable run survives temporary database failure; no sensitive error is logged. */
    } finally {
      this.recovering = false;
    }
  }
}
