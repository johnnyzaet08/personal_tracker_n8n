import { Injectable } from '@nestjs/common';
import { Prisma } from '@tracker/database';
import type { DashboardSummary, PaginatedResponse } from '@tracker/contracts';
import { PrismaService } from '../database/prisma.service';
import type { ListQueryDto, TransactionQueryDto } from './list-query.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, query: TransactionQueryDto): Promise<DashboardSummary> {
    const now = new Date();
    const from = query.dateFrom
      ? new Date(query.dateFrom)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = query.dateTo ? new Date(query.dateTo) : now;
    const where = this.transactionWhere(tenantId, {
      ...query,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
    });
    const transactions = await this.prisma.client.transaction.findMany({
      where,
      select: {
        amount: true,
        direction: true,
        occurredAt: true,
        categoryId: true,
        merchantId: true,
        category: { select: { name: true } },
        merchant: { select: { displayName: true } },
      },
    });
    const pendingReview = await this.prisma.client.reviewQueue.count({
      where: { tenantId, status: 'pending' },
    });
    const integrations = await this.prisma.client.integration.findMany({
      where: { tenantId },
      orderBy: { provider: 'asc' },
      select: { provider: true, status: true, lastSyncAt: true },
    });
    let expenses = new Prisma.Decimal(0);
    let income = new Prisma.Decimal(0);
    const timelineMap = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    const categoryMap = new Map<
      string,
      { categoryId: string | null; name: string; amount: Prisma.Decimal }
    >();
    const merchantMap = new Map<
      string,
      { merchantId: string | null; name: string; amount: Prisma.Decimal }
    >();
    for (const transaction of transactions) {
      if (transaction.direction === 'debit') expenses = expenses.add(transaction.amount);
      if (transaction.direction === 'credit') income = income.add(transaction.amount);
      const day = transaction.occurredAt.toISOString().slice(0, 10);
      const daily = timelineMap.get(day) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      daily[transaction.direction === 'debit' ? 'debit' : 'credit'] = daily[
        transaction.direction === 'debit' ? 'debit' : 'credit'
      ].add(transaction.amount);
      timelineMap.set(day, daily);
      if (transaction.direction === 'debit') {
        const categoryKey = transaction.categoryId ?? 'uncategorized';
        const category = categoryMap.get(categoryKey) ?? {
          categoryId: transaction.categoryId,
          name: transaction.category?.name ?? 'Sin categoría',
          amount: new Prisma.Decimal(0),
        };
        category.amount = category.amount.add(transaction.amount);
        categoryMap.set(categoryKey, category);
        const merchantKey = transaction.merchantId ?? 'unknown';
        const merchant = merchantMap.get(merchantKey) ?? {
          merchantId: transaction.merchantId,
          name: transaction.merchant?.displayName ?? 'Comercio no identificado',
          amount: new Prisma.Decimal(0),
        };
        merchant.amount = merchant.amount.add(transaction.amount);
        merchantMap.set(merchantKey, merchant);
      }
    }
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      expenses: expenses.toFixed(4),
      income: income.toFixed(4),
      balance: income.sub(expenses).toFixed(4),
      pendingReview,
      timeline: [...timelineMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({
          date,
          debit: value.debit.toFixed(4),
          credit: value.credit.toFixed(4),
        })),
      byCategory: [...categoryMap.values()]
        .sort((a, b) => b.amount.comparedTo(a.amount))
        .map((item) => ({ ...item, amount: item.amount.toFixed(4) })),
      topMerchants: [...merchantMap.values()]
        .sort((a, b) => b.amount.comparedTo(a.amount))
        .slice(0, 10)
        .map((item) => ({ ...item, amount: item.amount.toFixed(4) })),
      integrations: integrations.map((item) => ({
        ...item,
        lastSyncAt: item.lastSyncAt?.toISOString() ?? null,
      })),
    };
  }

  async transactions(
    tenantId: string,
    query: TransactionQueryDto,
  ): Promise<PaginatedResponse<object>> {
    const where = this.transactionWhere(tenantId, query);
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.transaction.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { account: true, merchant: true, category: true },
      }),
      this.prisma.client.transaction.count({ where }),
    ]);
    return this.paginated(data, total, query);
  }

  async categories(tenantId: string, query: ListQueryDto): Promise<PaginatedResponse<object>> {
    const where = { tenantId };
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.category.count({ where }),
    ]);
    return this.paginated(data, total, query);
  }

  async recurring(tenantId: string, query: ListQueryDto): Promise<PaginatedResponse<object>> {
    const where = { tenantId };
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.recurringPayment.findMany({
        where,
        orderBy: { nextExpectedAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { account: true, merchant: true },
      }),
      this.prisma.client.recurringPayment.count({ where }),
    ]);
    return this.paginated(data, total, query);
  }

  private transactionWhere(
    tenantId: string,
    query: TransactionQueryDto,
  ): Prisma.TransactionWhereInput {
    return {
      tenantId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { transactionType: query.type } : {}),
      ...(query.requiresReview === undefined ? {} : { requiresReview: query.requiresReview }),
      ...(query.dateFrom || query.dateTo
        ? {
            occurredAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  private paginated<T>(data: T[], total: number, query: ListQueryDto): PaginatedResponse<T> {
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
