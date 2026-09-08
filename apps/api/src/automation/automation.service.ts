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

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestSourceEvent(event: SourceEvent): Promise<object> {
    const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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
    const event = await this.prisma.client.sourceEvent.findFirst({
      where: { id: candidate.sourceEventId, tenantId: candidate.tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Source event not found for this tenant');
    if (
      candidate.accountId &&
      !(await this.prisma.client.account.findFirst({
        where: { id: candidate.accountId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Account not found for this tenant');
    if (
      candidate.merchantId &&
      !(await this.prisma.client.merchant.findFirst({
        where: { id: candidate.merchantId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Merchant not found for this tenant');
    if (
      candidate.categoryId &&
      !(await this.prisma.client.category.findFirst({
        where: { id: candidate.categoryId, tenantId: candidate.tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Category not found for this tenant');
    const existing = await this.prisma.client.transaction.findFirst({
      where: {
        tenantId: candidate.tenantId,
        sourceEventId: candidate.sourceEventId,
        externalReference: candidate.externalReference ?? null,
      },
    });
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const eligible =
      candidate.direction === 'debit'
        ? await this.prisma.client.recurringObligation.findMany({
            where: {
              tenantId: candidate.tenantId,
              currency: candidate.currency,
              expectedAmount: new Prisma.Decimal(candidate.amount),
              paymentStatus: { in: ['pending', 'paid'] },
              recurringPayment: { accountId: candidate.accountId ?? undefined },
            },
            include: { recurringPayment: true },
          })
        : [];
    const normalized = candidate.description.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const matches = eligible.filter((item) => {
      const names = [
        item.recurringPayment.name,
        ...((item.recurringPayment.aliases as string[]) ?? []),
      ].map((name) => name.toLowerCase().replace(/[^a-z0-9]/gu, ''));
      return (
        names.includes(normalized) &&
        Math.abs(new Date(candidate.occurredAt).getTime() - item.dueAt.getTime()) <= 7 * 86400000
      );
    });
    const match = matches[0];
    if (matches.length === 1 && match?.transactionId) {
      await this.prisma.client.$transaction([
        this.prisma.client.recurringObligation.update({
          where: { id: match.id },
          data: { reconciliationStatus: 'reconciled' },
        }),
        this.prisma.client.transaction.update({
          where: { id: match.transactionId },
          data: {
            rawMetadata: { reconciledSourceEventId: candidate.sourceEventId, origin: 'manual' },
          },
        }),
        this.prisma.client.sourceEvent.update({
          where: { id: event.id },
          data: { status: 'processed' },
        }),
      ]);
      return { id: match.transactionId, status: 'posted', duplicate: true, reconciled: true };
    }
    const created = await this.prisma.client.$transaction(async (transaction) => {
      const needsReview = candidate.requiresReview || matches.length > 1;
      const recurringMatch = matches.length === 1 && !needsReview ? match : undefined;
      const transactionRecord = await transaction.transaction.create({
        data: {
          tenantId: candidate.tenantId,
          sourceEventId: candidate.sourceEventId,
          accountId: candidate.accountId,
          merchantId: candidate.merchantId,
          categoryId: candidate.categoryId,
          externalReference: candidate.externalReference,
          direction: candidate.direction,
          transactionType: recurringMatch ? 'recurring_payment' : candidate.transactionType,
          amount: new Prisma.Decimal(candidate.amount),
          currency: candidate.currency,
          description: candidate.description,
          occurredAt: new Date(candidate.occurredAt),
          postedAt: candidate.postedAt ? new Date(candidate.postedAt) : undefined,
          confidence:
            candidate.confidence === undefined
              ? undefined
              : new Prisma.Decimal(candidate.confidence),
          requiresReview: needsReview,
          status: needsReview ? 'pending_review' : 'posted',
          rawMetadata: {
            ...candidate.rawMetadata,
            adapter: candidate.adapter,
            candidateId: candidate.candidateId,
            ...(recurringMatch ? { recurringObligationId: recurringMatch.id } : {}),
          } as Prisma.InputJsonValue,
        },
      });

      if (recurringMatch) {
        const linked = await transaction.recurringObligation.updateMany({
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
        await transaction.reviewQueue.upsert({
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

      await transaction.sourceEvent.update({
        where: { id: event.id },
        data: { status: needsReview ? 'needs_review' : 'processed' },
      });
      return transactionRecord;
    });
    return { id: created.id, status: created.status, duplicate: false };
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
    const record = await this.prisma.client.actionRun.upsert({
      where: { idempotencyKey: request.idempotencyKey },
      create: {
        sourceEventId: request.sourceEventId,
        actionType: request.actionType,
        idempotencyKey: request.idempotencyKey,
        status: request.status,
        input: request.input as Prisma.InputJsonValue,
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
}
