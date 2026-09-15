import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { categoryUpdateSchema, recurringPaymentUpdateSchema } from '@tracker/contracts';
import { Prisma } from '@tracker/database';
import type { PrismaService } from '../database/prisma.service';
import { FinanceService } from './finance.service';

void test('finance update contracts reject empty payloads and allow clearing optional references', () => {
  assert.equal(categoryUpdateSchema.safeParse({}).success, false);
  assert.equal(
    categoryUpdateSchema.safeParse({
      name: 'Servicios',
      type: 'expense',
      color: null,
      budgetGroup: 'needs',
    }).success,
    true,
  );
  assert.equal(recurringPaymentUpdateSchema.safeParse({}).success, false);
  assert.equal(
    recurringPaymentUpdateSchema.safeParse({ accountId: null, merchantId: null }).success,
    true,
  );
});

void test('category edits are tenant-scoped', async () => {
  const updates: Array<{ where: object; data: object }> = [];
  const tx = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    category: {
      findFirst: ({ where }: { where: { tenantId: string } }) =>
        Promise.resolve(
          where.tenantId === 'tenant-owner' ? { id: 'category-1', type: 'expense' } : null,
        ),
      update: (input: { where: object; data: object }) => {
        updates.push(input);
        return Promise.resolve({ id: 'category-1', ...input.data });
      },
    },
    transaction: { count: () => Promise.resolve(1) },
    recurringPayment: { count: () => Promise.resolve(0) },
    recurringObligation: { count: () => Promise.resolve(0) },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (database: typeof tx) => Promise<unknown>) => callback(tx),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateCategory('tenant-other', 'category-1', { name: 'No permitido' }),
    NotFoundException,
  );
  await service.updateCategory('tenant-owner', 'category-1', {
    name: 'Servicios',
    color: null,
    budgetGroup: 'needs',
  });
  assert.deepEqual(updates, [
    {
      where: { id: 'category-1' },
      data: { name: 'Servicios', color: null, budgetGroup: 'needs' },
    },
  ]);
  await assert.rejects(
    service.updateCategory('tenant-owner', 'category-1', { type: 'income' }),
    ConflictException,
  );
});

void test('an unused income category receives a valid default group when changed to expense', async () => {
  let updateData: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    category: {
      findFirst: () => Promise.resolve({ id: 'category-1', type: 'income' }),
      update: ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return Promise.resolve({ id: 'category-1', ...data });
      },
    },
    transaction: { count: () => Promise.resolve(0) },
    recurringPayment: { count: () => Promise.resolve(0) },
    recurringObligation: { count: () => Promise.resolve(0) },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (database: typeof tx) => Promise<unknown>) => callback(tx),
    },
  } as unknown as PrismaService);

  await service.updateCategory('tenant-owner', 'category-1', { type: 'expense' });
  assert.deepEqual(updateData, { type: 'expense', budgetGroup: 'needs' });
});

void test('category assignment requires an active expense category and a posted debit', async () => {
  let transactionFilter: object | undefined;
  let categoryFilter: object | undefined;
  let updateData: Record<string, unknown> | undefined;
  const database = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    transaction: {
      findFirst: ({ where }: { where: object }) => {
        transactionFilter = where;
        return Promise.resolve({ id: 'transaction-1' });
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return Promise.resolve({ id: 'transaction-1' });
      },
    },
    category: {
      findFirst: ({ where }: { where: object }) => {
        categoryFilter = where;
        return Promise.resolve({ id: 'category-1' });
      },
    },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
    },
  } as unknown as PrismaService);

  await service.assignCategory('tenant-1', 'transaction-1', 'category-1');
  assert.deepEqual(transactionFilter, {
    id: 'transaction-1',
    tenantId: 'tenant-1',
    direction: 'debit',
    status: 'posted',
  });
  assert.deepEqual(categoryFilter, {
    id: 'category-1',
    tenantId: 'tenant-1',
    status: 'active',
    type: 'expense',
  });
  assert.equal(updateData?.categoryId, 'category-1');
  assert.equal(updateData?.manuallyModifiedAt instanceof Date, true);
});

void test('recurring edits persist scheduling fields, clear references and pause future expectation', async () => {
  let updateInput: { where: object; data: Record<string, unknown>; include: object } | undefined;
  const database = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    recurringPayment: {
      findFirst: () =>
        Promise.resolve({
          id: 'recurring-1',
          startAt: new Date('2026-01-01T06:00:00.000Z'),
          dueDay: 5,
          status: 'active',
        }),
      update: (input: typeof updateInput) => {
        updateInput = input;
        return Promise.resolve(input);
      },
    },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
    },
  } as unknown as PrismaService);

  await service.updateRecurring('tenant-1', 'recurring-1', {
    startAt: '2026-02-01',
    dueDay: 28,
    accountId: null,
    merchantId: null,
    status: 'paused',
  });
  assert.equal(updateInput?.data.startAt instanceof Date, true);
  assert.equal((updateInput?.data.startAt as Date).toISOString(), '2026-02-01T06:00:00.000Z');
  assert.equal(updateInput?.data.dueDay, 28);
  assert.equal(updateInput?.data.accountId, null);
  assert.equal(updateInput?.data.merchantId, null);
  assert.equal(updateInput?.data.nextExpectedAt, null);
  assert.equal(updateInput?.data.status, 'paused');
  assert.equal(updateInput?.data.pausedAt instanceof Date, true);
  await service.updateRecurring('tenant-1', 'recurring-1', { status: 'active' });
  const resumedNextExpectedAt: unknown = updateInput?.data.nextExpectedAt;
  assert.ok(resumedNextExpectedAt instanceof Date);
  assert.ok(resumedNextExpectedAt >= new Date());
});

void test('manual obligation due dates are marked as protected from month synchronization', async () => {
  let updateData: Record<string, unknown> | undefined;
  const database = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    recurringObligation: {
      findFirst: () =>
        Promise.resolve({
          id: 'obligation-1',
          paymentStatus: 'pending',
          reconciliationStatus: 'unreconciled',
          transactionId: null,
        }),
      update: ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return Promise.resolve({ id: 'obligation-1' });
      },
    },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
    },
  } as unknown as PrismaService);

  await service.updateObligation('tenant-1', 'obligation-1', '2026-02-07');
  assert.equal(updateData?.dueAtManuallyOverridden, true);
  assert.equal((updateData?.dueAt as Date).toISOString(), '2026-02-07T06:00:00.000Z');
});

void test('paid obligations reject due-date edits', async () => {
  const database = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    recurringObligation: {
      findFirst: () =>
        Promise.resolve({
          id: 'obligation-1',
          paymentStatus: 'paid',
          reconciliationStatus: 'manual',
          transactionId: 'transaction-1',
        }),
      update: () => Promise.reject(new Error('protected obligation must not be updated')),
    },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateObligation('tenant-1', 'obligation-1', '2026-02-07'),
    ConflictException,
  );
});

void test('materialize creates missing rows, synchronizes changed pending rows and preserves paid rows', async () => {
  const patterns = [
    {
      id: 'new',
      expectedAmount: new Prisma.Decimal('10.00'),
      currency: 'CRC',
      categoryId: 'category-1',
      dueDay: 10,
      startAt: new Date('2026-01-01T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-10T06:00:00.000Z'),
    },
    {
      id: 'changed',
      expectedAmount: new Prisma.Decimal('20.00'),
      currency: 'USD',
      categoryId: 'category-2',
      dueDay: 31,
      startAt: new Date('2026-01-01T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-31T06:00:00.000Z'),
    },
    {
      id: 'paid',
      expectedAmount: new Prisma.Decimal('30.00'),
      currency: 'CRC',
      categoryId: 'category-3',
      dueDay: 15,
      startAt: new Date('2026-01-01T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-15T06:00:00.000Z'),
    },
    {
      id: 'same',
      expectedAmount: new Prisma.Decimal('40.00'),
      currency: 'CRC',
      categoryId: 'category-4',
      dueDay: 20,
      startAt: new Date('2026-01-01T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-20T06:00:00.000Z'),
    },
    {
      id: 'manual-due',
      expectedAmount: new Prisma.Decimal('51.00'),
      currency: 'CRC',
      categoryId: 'category-5',
      dueDay: 25,
      startAt: new Date('2026-01-01T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-25T06:00:00.000Z'),
    },
    {
      id: 'starts-after-due',
      expectedAmount: new Prisma.Decimal('60.00'),
      currency: 'CRC',
      categoryId: 'category-6',
      dueDay: 5,
      startAt: new Date('2026-02-20T06:00:00.000Z'),
      nextExpectedAt: new Date('2026-03-05T06:00:00.000Z'),
    },
  ];
  const existing = new Map<string, Record<string, unknown>>([
    [
      'changed',
      {
        id: 'obligation-changed',
        expectedAmount: new Prisma.Decimal('19.00'),
        currency: 'CRC',
        categoryId: 'category-old',
        dueAt: new Date('2026-02-01T06:00:00.000Z'),
        paymentStatus: 'pending',
        reconciliationStatus: 'unreconciled',
        transactionId: null,
        dueAtManuallyOverridden: false,
      },
    ],
    [
      'paid',
      {
        id: 'obligation-paid',
        expectedAmount: new Prisma.Decimal('29.00'),
        currency: 'CRC',
        categoryId: 'category-old',
        dueAt: new Date('2026-02-15T06:00:00.000Z'),
        paymentStatus: 'paid',
        reconciliationStatus: 'manual',
        transactionId: 'transaction-1',
        dueAtManuallyOverridden: false,
      },
    ],
    [
      'same',
      {
        id: 'obligation-same',
        expectedAmount: new Prisma.Decimal('40.00'),
        currency: 'CRC',
        categoryId: 'category-4',
        dueAt: new Date('2026-02-20T06:00:00.000Z'),
        paymentStatus: 'pending',
        reconciliationStatus: 'unreconciled',
        transactionId: null,
        dueAtManuallyOverridden: false,
      },
    ],
    [
      'manual-due',
      {
        id: 'obligation-manual-due',
        expectedAmount: new Prisma.Decimal('50.00'),
        currency: 'CRC',
        categoryId: 'category-5',
        dueAt: new Date('2026-02-07T06:00:00.000Z'),
        paymentStatus: 'pending',
        reconciliationStatus: 'unreconciled',
        transactionId: null,
        dueAtManuallyOverridden: true,
      },
    ],
  ]);
  const created: object[] = [];
  const updated: Array<{ where: object; data: object }> = [];
  const tx = {
    $queryRaw: () => Promise.resolve([{ locked: 1 }]),
    recurringPayment: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where.status, 'active');
        return Promise.resolve(patterns);
      },
      update: (input: object) => Promise.resolve(input),
    },
    recurringObligation: {
      findUnique: async ({
        where,
      }: {
        where: {
          tenantId_recurringPaymentId_period: {
            tenantId: string;
            recurringPaymentId: string;
            period: string;
          };
        };
      }) =>
        Promise.resolve(
          existing.get(where.tenantId_recurringPaymentId_period.recurringPaymentId) ?? null,
        ),
      create: ({ data }: { data: object }) => {
        created.push(data);
        return Promise.resolve({ id: 'obligation-new' });
      },
      update: (input: { where: object; data: object }) => {
        updated.push(input);
        return Promise.resolve(input);
      },
    },
  };
  const service = new FinanceService({
    client: {
      $transaction: (callback: (database: typeof tx) => Promise<unknown>) => callback(tx),
    },
  } as unknown as PrismaService);

  const result = await service.materialize('tenant-1', '2026-02');
  assert.deepEqual(result, {
    period: '2026-02',
    created: 1,
    updated: 2,
    unchanged: 1,
    skipped: 1,
    ids: ['obligation-new'],
    updatedIds: ['obligation-changed', 'obligation-manual-due'],
  });
  assert.equal(created.length, 1);
  assert.deepEqual(updated, [
    {
      where: { id: 'obligation-changed' },
      data: {
        expectedAmount: new Prisma.Decimal('20.00'),
        currency: 'USD',
        categoryId: 'category-2',
        dueAt: new Date('2026-02-28T06:00:00.000Z'),
      },
    },
    {
      where: { id: 'obligation-manual-due' },
      data: {
        expectedAmount: new Prisma.Decimal('51.00'),
        currency: 'CRC',
        categoryId: 'category-5',
      },
    },
  ]);
});
