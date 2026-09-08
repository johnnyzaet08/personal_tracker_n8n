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
    const event = await this.prisma.client.sourceEvent.findFirst({
      where: { id: candidate.sourceEventId, tenantId: candidate.tenantId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Source event not found for this tenant');
    const existing = await this.prisma.client.transaction.findFirst({
      where: {
        tenantId: candidate.tenantId,
        sourceEventId: candidate.sourceEventId,
        externalReference: candidate.externalReference ?? null,
      },
    });
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const created = await this.prisma.client.transaction.create({
      data: {
        tenantId: candidate.tenantId,
        sourceEventId: candidate.sourceEventId,
        accountId: candidate.accountId,
        merchantId: candidate.merchantId,
        categoryId: candidate.categoryId,
        externalReference: candidate.externalReference,
        direction: candidate.direction,
        transactionType: candidate.transactionType,
        amount: new Prisma.Decimal(candidate.amount),
        currency: candidate.currency,
        description: candidate.description,
        occurredAt: new Date(candidate.occurredAt),
        postedAt: candidate.postedAt ? new Date(candidate.postedAt) : undefined,
        confidence:
          candidate.confidence === undefined ? undefined : new Prisma.Decimal(candidate.confidence),
        requiresReview: candidate.requiresReview,
        status: candidate.requiresReview ? 'pending_review' : 'posted',
        rawMetadata: {
          adapter: candidate.adapter,
          candidateId: candidate.candidateId,
        } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.client.sourceEvent.update({
      where: { id: event.id },
      data: { status: 'processed' },
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
}
