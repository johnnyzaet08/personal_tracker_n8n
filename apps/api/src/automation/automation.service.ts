import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ActionRequest,
  FinancialTransactionCandidate,
  ReviewQueueItem,
  SourceEvent,
} from '@tracker/contracts';
import { Prisma } from '@tracker/database';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { ListQueryDto } from '../finance/list-query.dto';
import { findRecurringObligationMatches, jsonObject } from '../finance/recurring-reconciliation';

type Database = Prisma.TransactionClient;

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestSourceEvent(event: SourceEvent): Promise<object> {
    // Legacy connectors retain only an allowlist; email bodies are transient input.
    const payload = {
      schemaVersion: event.schemaVersion,
      sender: event.sender.address.trim().toLowerCase(),
      receivedAt: event.receivedAt,
    };
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          sender: payload.sender,
          occurredAt: event.occurredAt,
          textBody: event.textBody ?? '',
          htmlBody: event.htmlBody ?? '',
        }),
      )
      .digest('hex');
    const existing = await this.prisma.client.sourceEvent.findUnique({
      where: {
        tenantId_source_externalId: {
          tenantId: event.tenantId,
          source: event.source,
          externalId: event.externalId,
        },
      },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'The source event key already exists with a different payload',
        });
      }
      return { id: existing.id, eventId: event.eventId, status: existing.status, duplicate: true };
    }
    const created = await this.prisma.client.sourceEvent.create({
      data: {
        id: event.eventId,
        tenantId: event.tenantId,
        source: event.source,
        externalId: event.externalId,
        eventType: 'email.received',
        schemaVersion: event.schemaVersion,
        occurredAt: new Date(event.occurredAt),
        receivedAt: new Date(event.receivedAt),
        status: 'received',
        payload,
        payloadHash,
      },
    });
    return { id: created.id, eventId: event.eventId, status: created.status, duplicate: false };
  }

  async createTransaction(candidate: FinancialTransactionCandidate): Promise<object> {
    return this.prisma.client.$transaction(async (database) => {
      await this.lockTenant(database, candidate.tenantId);
      return this.createTransactionLocked(database, candidate);
    });
  }

  private async createTransactionLocked(
    database: Database,
    candidate: FinancialTransactionCandidate,
  ): Promise<object> {
    const event = await database.sourceEvent.findFirst({
      where: { id: candidate.sourceEventId, tenantId: candidate.tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Source event not found for this tenant');
    if (
      candidate.accountId &&
      !(await database.account.findFirst({
        where: { id: candidate.accountId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Account not found for this tenant');
    if (
      candidate.merchantId &&
      !(await database.merchant.findFirst({
        where: { id: candidate.merchantId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Merchant not found for this tenant');
    if (
      candidate.categoryId &&
      !(await database.category.findFirst({
        where: { id: candidate.categoryId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Category not found for this tenant');
    const existing = await database.transaction.findFirst({
      where: {
        tenantId: candidate.tenantId,
        sourceEventId: candidate.sourceEventId,
        externalReference: candidate.externalReference ?? null,
      },
    });
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const matches = await findRecurringObligationMatches(database, candidate);
    const match = matches[0];
    if (matches.length === 1 && match?.transactionId) {
      await database.recurringObligation.update({
        where: { id: match.id },
        data: { reconciliationStatus: 'reconciled' },
      });
      await database.transaction.update({
        where: { id: match.transactionId },
        data: {
          rawMetadata: {
            ...jsonObject(match.transaction?.rawMetadata ?? null),
            reconciledSourceEventId: candidate.sourceEventId,
          },
        },
      });
      await database.sourceEvent.update({
        where: { id: event.id },
        data: { status: 'processed' },
      });
      return { id: match.transactionId, status: 'posted', duplicate: true, reconciled: true };
    }
    const needsReview = candidate.requiresReview || matches.length > 1;
    const recurringMatch = matches.length === 1 && !needsReview ? match : undefined;
    const transactionRecord = await database.transaction.create({
      data: {
        tenantId: candidate.tenantId,
        sourceEventId: candidate.sourceEventId,
        accountId: candidate.accountId,
        merchantId: candidate.merchantId,
        categoryId: recurringMatch?.categoryId ?? candidate.categoryId,
        externalReference: candidate.externalReference,
        direction: candidate.direction,
        transactionType: recurringMatch ? 'recurring_payment' : candidate.transactionType,
        amount: new Prisma.Decimal(candidate.amount),
        currency: candidate.currency,
        description: candidate.description,
        occurredAt: new Date(candidate.occurredAt),
        postedAt: candidate.postedAt ? new Date(candidate.postedAt) : undefined,
        confidence:
          candidate.confidence === undefined ? undefined : new Prisma.Decimal(candidate.confidence),
        requiresReview: needsReview,
        status: needsReview ? 'pending_review' : 'posted',
        rawMetadata: {
          ...candidate.rawMetadata,
          adapter: candidate.adapter,
          candidateId: candidate.candidateId,
          ...(recurringMatch
            ? {
                recurringObligationId: recurringMatch.id,
                originalTransactionType: candidate.transactionType,
              }
            : {}),
        } as Prisma.InputJsonValue,
      },
    });

    if (recurringMatch) {
      const linked = await database.recurringObligation.updateMany({
        where: { id: recurringMatch.id, transactionId: null },
        data: {
          transactionId: transactionRecord.id,
          actualAmount: transactionRecord.amount,
          paidAt: transactionRecord.occurredAt,
          paymentStatus: 'paid',
          reconciliationStatus: 'reconciled',
        },
      });
      if (linked.count !== 1) {
        throw new ConflictException({
          code: 'RECURRING_RECONCILIATION_CONFLICT',
          message: 'The recurring obligation was reconciled concurrently',
        });
      }
    }

    if (needsReview) {
      await database.reviewQueue.upsert({
        where: {
          tenantId_sourceEventId: {
            tenantId: candidate.tenantId,
            sourceEventId: candidate.sourceEventId,
          },
        },
        create: {
          tenantId: candidate.tenantId,
          sourceEventId: candidate.sourceEventId,
          reason:
            matches.length > 1
              ? 'Multiple recurring obligations match this transaction'
              : 'Transaction candidate requires review before recurring reconciliation',
          priority: 'normal',
        },
        update: {},
      });
    }

    await database.sourceEvent.update({
      where: { id: event.id },
      data: { status: needsReview ? 'needs_review' : 'processed' },
    });
    return { id: transactionRecord.id, status: transactionRecord.status, duplicate: false };
  }

  async enqueueReview(item: ReviewQueueItem): Promise<object> {
    const sourceEvent = await this.prisma.client.sourceEvent.findFirst({
      where: { id: item.sourceEventId, tenantId: item.tenantId },
      select: { id: true },
    });
    if (!sourceEvent) throw new NotFoundException('Source event not found for this tenant');
    const existing = await this.prisma.client.reviewQueue.findUnique({
      where: {
        tenantId_sourceEventId: { tenantId: item.tenantId, sourceEventId: item.sourceEventId },
      },
      select: { id: true },
    });
    const record = await this.prisma.client.reviewQueue.upsert({
      where: {
        tenantId_sourceEventId: { tenantId: item.tenantId, sourceEventId: item.sourceEventId },
      },
      create: {
        tenantId: item.tenantId,
        sourceEventId: item.sourceEventId,
        reason: item.reason,
        priority: item.priority,
      },
      update: {},
    });
    await this.prisma.client.sourceEvent.update({
      where: { id: sourceEvent.id },
      data: { status: 'needs_review' },
    });
    return { id: record.id, status: record.status, duplicate: existing !== null };
  }

  async recordAction(request: ActionRequest): Promise<object> {
    if (
      request.sourceEventId &&
      !(await this.prisma.client.sourceEvent.findFirst({
        where: { id: request.sourceEventId, tenantId: request.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Source event not found for this tenant');
    const record = await this.prisma.client.actionRun.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId: request.tenantId,
          idempotencyKey: request.idempotencyKey,
        },
      },
      create: {
        tenantId: request.tenantId,
        sourceEventId: request.sourceEventId,
        actionType: request.actionType,
        idempotencyKey: request.idempotencyKey,
        status: request.status,
        input: {},
        errorCode:
          request.actionType === 'n8n.workflow.error' ? 'WORKFLOW_EXECUTION_FAILED' : undefined,
        attemptCount: request.status === 'running' ? 1 : 0,
        startedAt: request.status === 'running' ? new Date() : undefined,
      },
      update: {},
    });
    return { id: record.id, status: record.status, idempotencyKey: record.idempotencyKey };
  }

  async reviewQueue(tenantId: string, query: ListQueryDto): Promise<object> {
    const where = { tenantId };
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.reviewQueue.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.reviewQueue.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  private async lockTenant(database: Database, tenantId: string): Promise<void> {
    await database.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
  }
}
