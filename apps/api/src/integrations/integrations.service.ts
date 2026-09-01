import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { ListQueryDto } from '../finance/list-query.dto';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string, query: ListQueryDto): Promise<object> {
    const where = { tenantId };
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.integration.findMany({
        where,
        orderBy: { provider: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.integration.count({ where }),
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

  async status(tenantId: string) {
    let database: 'connected' | 'error' = 'connected';
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    let n8n: 'running' | 'unavailable' = 'unavailable';
    try {
      const response = await fetch(
        `${this.config.getOrThrow<string>('N8N_INTERNAL_URL')}/healthz`,
        {
          signal: AbortSignal.timeout(1500),
        },
      );
      n8n = response.ok ? 'running' : 'unavailable';
    } catch {
      n8n = 'unavailable';
    }
    const gmail = await this.prisma.client.integration.findUnique({
      where: { tenantId_provider_type: { tenantId, provider: 'gmail', type: 'email' } },
      select: { status: true, lastSyncAt: true },
    });
    return {
      api: 'available',
      postgresql: database,
      n8n,
      gmail: gmail?.status ?? 'disconnected',
      gmailLastSyncAt: gmail?.lastSyncAt?.toISOString() ?? null,
    };
  }
}
