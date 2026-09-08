import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tracker/database';
import type {
  CategoryInput,
  BudgetSummary,
  DashboardSummary,
  MonthlyBudgetInput,
  ObligationPayment,
  PaginatedResponse,
  RecurringPaymentInput,
  RecurringPaymentUpdate,
} from '@tracker/contracts';
import { randomUUID, createHash } from 'node:crypto';
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
        category: { select: { name: true, budgetGroup: true } },
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
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { defaultCurrency: true },
    });
    const currency = query.currency?.toUpperCase() ?? tenant.defaultCurrency;
    const period = from.toISOString().slice(0, 7);
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
      currency,
      budget: await this.budgetSummary(tenantId, period, currency),
    };
  }

  async planning(tenantId: string, period: string, currency: string): Promise<object> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(period) || !/^[A-Z]{3}$/u.test(currency))
      throw new BadRequestException('A valid period and currency are required');
    const from = this.periodStart(period);
    const to = this.periodEnd(period);
    const [categories, uncategorized, budget] = await Promise.all([
      this.prisma.client.category.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: {
          transactions: {
            where: {
              direction: 'debit',
              currency,
              status: 'posted',
              occurredAt: { gte: from, lte: to },
            },
            select: { amount: true },
          },
        },
      }),
      this.prisma.client.transaction.findMany({
        where: {
          tenantId,
          categoryId: null,
          direction: 'debit',
          currency,
          status: 'posted',
          occurredAt: { gte: from, lte: to },
        },
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          occurredAt: true,
          merchant: { select: { displayName: true } },
        },
      }),
      this.budgetSummary(tenantId, period, currency),
    ]);
    return {
      period,
      currency,
      budget,
      categories: categories.map((category) => ({
        ...category,
        spent: category.transactions
          .reduce((sum, transaction) => sum.add(transaction.amount), new Prisma.Decimal(0))
          .toFixed(4),
        transactions: undefined,
      })),
      uncategorized,
    };
  }

  async saveBudget(tenantId: string, input: MonthlyBudgetInput): Promise<BudgetSummary> {
    await this.prisma.client.$transaction(async (tx) => {
      const budget = await tx.monthlyBudget.upsert({
        where: {
          tenantId_period_currency: { tenantId, period: input.period, currency: input.currency },
        },
        create: {
          tenantId,
          period: input.period,
          currency: input.currency,
          incomeBase: new Prisma.Decimal(input.incomeBase),
        },
        update: { incomeBase: new Prisma.Decimal(input.incomeBase), status: 'active' },
      });
      for (const [groupKey, percentage] of Object.entries(input.allocations)) {
        await tx.budgetAllocation.upsert({
          where: { budgetId_groupKey: { budgetId: budget.id, groupKey } },
          create: { budgetId: budget.id, groupKey, percentage: new Prisma.Decimal(percentage) },
          update: { percentage: new Prisma.Decimal(percentage) },
        });
      }
    });
    return (await this.budgetSummary(tenantId, input.period, input.currency))!;
  }

  async assignCategory(
    tenantId: string,
    transactionId: string,
    categoryId: string,
  ): Promise<object> {
    const [transaction, category] = await Promise.all([
      this.prisma.client.transaction.findFirst({ where: { id: transactionId, tenantId } }),
      this.prisma.client.category.findFirst({
        where: { id: categoryId, tenantId, status: 'active' },
      }),
    ]);
    if (!transaction || !category)
      throw new NotFoundException('Transaction or category not found for this tenant');
    return this.prisma.client.transaction.update({
      where: { id: transactionId },
      data: { categoryId },
    });
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

  async createCategory(tenantId: string, input: CategoryInput): Promise<object> {
    const base = input.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/(^-|-$)/gu, '');
    const count = await this.prisma.client.category.count({
      where: { tenantId, slug: { startsWith: base } },
    });
    return this.prisma.client.category.create({
      data: {
        tenantId,
        name: input.name,
        slug: count ? `${base}-${count + 1}` : base,
        type: input.type,
        color: input.color,
        budgetGroup: input.budgetGroup,
      },
    });
  }

  async recurring(tenantId: string, query: ListQueryDto): Promise<PaginatedResponse<object>> {
    const where = { tenantId };
    const [data, total] = await this.prisma.client.$transaction([
      this.prisma.client.recurringPayment.findMany({
        where,
        orderBy: { nextExpectedAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { account: true, merchant: true, category: true },
      }),
      this.prisma.client.recurringPayment.count({ where }),
    ]);
    return this.paginated(data, total, query);
  }

  async obligations(tenantId: string, period?: string): Promise<object[]> {
    return this.prisma.client.recurringObligation.findMany({
      where: { tenantId, ...(period ? { period } : {}) },
      include: { recurringPayment: true, category: true, transaction: true },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createRecurring(tenantId: string, input: RecurringPaymentInput): Promise<object> {
    await this.ensureReferences(tenantId, input.categoryId, input.accountId, input.merchantId);
    const startAt = this.dateAtCostaRica(input.startAt);
    const dueDay = input.dueDay ?? Number(input.startAt.slice(8, 10));
    return this.prisma.client.recurringPayment.create({
      data: {
        tenantId,
        name: input.name,
        aliases: input.aliases,
        expectedAmount: new Prisma.Decimal(input.expectedAmount),
        currency: input.currency,
        categoryId: input.categoryId,
        accountId: input.accountId,
        merchantId: input.merchantId,
        startAt,
        dueDay,
        frequency: input.frequency,
        nextExpectedAt: this.dueAt(input.startAt.slice(0, 7), dueDay),
      },
      include: { category: true, account: true, merchant: true },
    });
  }

  async updateRecurring(
    tenantId: string,
    id: string,
    input: RecurringPaymentUpdate,
  ): Promise<object> {
    const current = await this.prisma.client.recurringPayment.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Recurring payment not found');
    if (input.categoryId || input.accountId || input.merchantId)
      await this.ensureReferences(tenantId, input.categoryId, input.accountId, input.merchantId);
    return this.prisma.client.recurringPayment.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.aliases ? { aliases: input.aliases } : {}),
        ...(input.expectedAmount
          ? { expectedAmount: new Prisma.Decimal(input.expectedAmount) }
          : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.dueDay ? { dueDay: input.dueDay } : {}),
        ...(input.status
          ? { status: input.status, pausedAt: input.status === 'paused' ? new Date() : null }
          : {}),
      },
    });
  }

  async materialize(tenantId: string, period: string): Promise<object> {
    const [year, month] = period.split('-').map(Number);
    if (!year || !month) throw new BadRequestException('Invalid period');
    const patterns = await this.prisma.client.recurringPayment.findMany({
      where: {
        tenantId,
        status: 'active',
        frequency: 'monthly',
        startAt: { lt: new Date(Date.UTC(year, month, 1)) },
      },
    });
    const created: string[] = [];
    for (const pattern of patterns) {
      if (!pattern.expectedAmount || !pattern.dueDay) continue;
      try {
        const row = await this.prisma.client.recurringObligation.create({
          data: {
            tenantId,
            recurringPaymentId: pattern.id,
            period,
            expectedAmount: pattern.expectedAmount,
            currency: pattern.currency,
            categoryId: pattern.categoryId,
            dueAt: this.dueAt(period, pattern.dueDay),
          },
        });
        created.push(row.id);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
      }
    }
    return { period, created: created.length, ids: created };
  }

  async updateObligation(tenantId: string, id: string, dueAt: string): Promise<object> {
    const obligation = await this.prisma.client.recurringObligation.findFirst({
      where: { id, tenantId },
    });
    if (!obligation) throw new NotFoundException('Recurring obligation not found');
    return this.prisma.client.recurringObligation.update({
      where: { id },
      data: { dueAt: this.dateAtCostaRica(dueAt) },
    });
  }

  async payObligation(tenantId: string, id: string, input: ObligationPayment): Promise<object> {
    const paidAt = this.dateAtCostaRica(input.paidAt);
    if (paidAt > new Date()) throw new BadRequestException('Payment date cannot be in the future');
    return this.prisma.client.$transaction(async (tx) => {
      const obligation = await tx.recurringObligation.findFirst({
        where: { id, tenantId },
        include: { recurringPayment: true },
      });
      if (!obligation) throw new NotFoundException('Recurring obligation not found');
      if (obligation.transactionId)
        return { id: obligation.transactionId, obligationId: id, duplicate: true };
      const eventId = randomUUID();
      const externalId = `manual-obligation:${id}`;
      const payload = {
        source: 'manual',
        obligationId: id,
        paidAt: input.paidAt,
        actualAmount: input.actualAmount,
      };
      const source = await tx.sourceEvent.create({
        data: {
          id: eventId,
          tenantId,
          source: 'manual',
          externalId,
          eventType: 'finance.manual_payment',
          schemaVersion: 1,
          occurredAt: paidAt,
          receivedAt: new Date(),
          status: 'processed',
          payload,
          payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        },
      });
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          sourceEventId: source.id,
          accountId: obligation.recurringPayment.accountId,
          merchantId: obligation.recurringPayment.merchantId,
          categoryId: obligation.categoryId,
          direction: 'debit',
          transactionType: 'recurring_payment',
          amount: new Prisma.Decimal(input.actualAmount),
          currency: obligation.currency,
          description: obligation.recurringPayment.name,
          occurredAt: paidAt,
          status: 'posted',
          rawMetadata: { origin: 'manual', obligationId: id },
        },
      });
      await tx.recurringObligation.update({
        where: { id },
        data: {
          transactionId: transaction.id,
          paidAt,
          actualAmount: new Prisma.Decimal(input.actualAmount),
          paymentStatus: 'paid',
          reconciliationStatus: 'manual',
        },
      });
      return { id: transaction.id, obligationId: id, duplicate: false };
    });
  }

  private async ensureReferences(
    tenantId: string,
    categoryId?: string,
    accountId?: string,
    merchantId?: string,
  ): Promise<void> {
    const [category, account, merchant] = await Promise.all([
      categoryId
        ? this.prisma.client.category.findFirst({
            where: { id: categoryId, tenantId },
            select: { id: true },
          })
        : true,
      accountId
        ? this.prisma.client.account.findFirst({
            where: { id: accountId, tenantId },
            select: { id: true },
          })
        : true,
      merchantId
        ? this.prisma.client.merchant.findFirst({
            where: { id: merchantId, tenantId },
            select: { id: true },
          })
        : true,
    ]);
    if (!category || !account || !merchant)
      throw new BadRequestException('Referenced resource does not belong to this tenant');
  }

  private async budgetSummary(
    tenantId: string,
    period: string,
    currency: string,
  ): Promise<BudgetSummary | null> {
    const budget = await this.prisma.client.monthlyBudget.findUnique({
      where: { tenantId_period_currency: { tenantId, period, currency } },
      include: { allocations: true },
    });
    if (!budget) return null;
    const [transactions, pending] = await Promise.all([
      this.prisma.client.transaction.findMany({
        where: {
          tenantId,
          currency,
          direction: 'debit',
          status: 'posted',
          occurredAt: { gte: this.periodStart(period), lte: this.periodEnd(period) },
        },
        select: {
          amount: true,
          transactionType: true,
          category: { select: { budgetGroup: true } },
        },
      }),
      this.prisma.client.recurringObligation.findMany({
        where: { tenantId, period, currency, paymentStatus: 'pending' },
        select: { expectedAmount: true },
      }),
    ]);
    const labels = {
      savings: 'Ahorro',
      needs: 'Gastos necesarios',
      provisions: 'Provisiones',
      play: 'Monto de play',
    } as const;
    const pendingTotal = pending.reduce(
      (sum, item) => sum.add(item.expectedAmount),
      new Prisma.Decimal(0),
    );
    return {
      id: budget.id,
      period,
      currency,
      incomeBase: budget.incomeBase.toFixed(4),
      groups: (Object.keys(labels) as Array<keyof typeof labels>).map((key) => {
        const percentage =
          budget.allocations.find((item) => item.groupKey === key)?.percentage ??
          new Prisma.Decimal(0);
        const assigned = budget.incomeBase.mul(percentage).div(100);
        const used = transactions
          .filter((item) =>
            item.transactionType === 'recurring_payment'
              ? key === 'needs'
              : item.category?.budgetGroup === key,
          )
          .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const recurringPending = key === 'needs' ? pendingTotal : new Prisma.Decimal(0);
        const committed = used.add(recurringPending);
        return {
          key,
          label: labels[key],
          percentage: percentage.toFixed(4),
          assigned: assigned.toFixed(4),
          used: used.toFixed(4),
          recurringPending: recurringPending.toFixed(4),
          committed: committed.toFixed(4),
          available: assigned.sub(committed).toFixed(4),
        };
      }),
    };
  }

  private periodStart(period: string): Date {
    return this.dateAtCostaRica(`${period}-01`);
  }
  private periodEnd(period: string): Date {
    const [year, month] = period.split('-').map(Number);
    if (!year || !month) throw new BadRequestException('Invalid period');
    return new Date(Date.UTC(year, month, 1, 5, 59, 59, 999));
  }

  private dateAtCostaRica(day: string): Date {
    return new Date(`${day}T06:00:00.000Z`);
  }
  private dueAt(period: string, dueDay: number): Date {
    const parts = period.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    if (!year || !month) throw new BadRequestException('Invalid period');
    return new Date(
      Date.UTC(
        year,
        month - 1,
        Math.min(dueDay, new Date(Date.UTC(year, month, 0)).getUTCDate()),
        6,
      ),
    );
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
