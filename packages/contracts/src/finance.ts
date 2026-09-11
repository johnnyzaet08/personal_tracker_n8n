import { z } from 'zod';
import { uuidSchema, isoDateTimeSchema, currencySchema, decimalStringSchema } from './common';

export const financialTransactionCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  candidateId: uuidSchema,
  tenantId: uuidSchema,
  sourceEventId: uuidSchema,
  externalReference: z.string().max(512).optional(),
  accountId: uuidSchema.optional(),
  merchantId: uuidSchema.optional(),
  merchant: z.string().min(1).max(255).optional(),
  maskedIdentifier: z.string().max(32).optional(),
  categoryId: uuidSchema.optional(),
  direction: z.enum(['debit', 'credit']),
  transactionType: z.string().min(1).max(64),
  amount: decimalStringSchema,
  currency: currencySchema,
  description: z.string().min(1).max(1_000),
  occurredAt: isoDateTimeSchema,
  postedAt: isoDateTimeSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  requiresReview: z.boolean().default(false),
  rawMetadata: z.record(z.string(), z.unknown()).default({}),
  adapter: z.object({
    name: z.string().min(1).max(128),
    version: z.string().min(1).max(64),
  }),
});

export const dashboardFiltersSchema = z.object({
  dateFrom: isoDateTimeSchema.optional(),
  dateTo: isoDateTimeSchema.optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  merchantId: uuidSchema.optional(),
  currency: currencySchema.optional(),
  status: z.string().max(64).optional(),
  type: z.string().max(64).optional(),
  requiresReview: z.boolean().optional(),
});

export const recurringPaymentInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  aliases: z.array(z.string().trim().min(1).max(255)).max(20).default([]),
  expectedAmount: decimalStringSchema,
  currency: currencySchema,
  categoryId: uuidSchema,
  accountId: uuidSchema.optional(),
  merchantId: uuidSchema.optional(),
  startAt: z.iso.date(),
  dueDay: z.number().int().min(1).max(31).optional(),
  frequency: z.literal('monthly').default('monthly'),
});

export const recurringPaymentUpdateSchema = recurringPaymentInputSchema.partial().extend({
  status: z.enum(['active', 'paused']).optional(),
});

export const materializeObligationsSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

export const obligationPaymentSchema = z.object({
  paidAt: z.iso.date(),
  actualAmount: decimalStringSchema,
});

export const obligationUpdateSchema = z.object({ dueAt: z.iso.date() });

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(['expense', 'income']).default('expense'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u)
    .optional(),
  budgetGroup: z.enum(['savings', 'needs', 'provisions', 'play']).default('needs'),
});

export const categoryAssignmentSchema = z.object({ categoryId: uuidSchema });

export const monthlyBudgetInputSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  currency: currencySchema,
  incomeBase: decimalStringSchema,
  allocations: z
    .object({
      savings: z.number().min(0).max(100),
      needs: z.number().min(0).max(100),
      provisions: z.number().min(0).max(100),
      play: z.number().min(0).max(100),
    })
    .refine(
      (value) => Math.abs(Object.values(value).reduce((sum, item) => sum + item, 0) - 100) < 0.0001,
      'Allocations must total 100%',
    ),
});

export interface DashboardSummary {
  period: { from: string; to: string };
  expenses: string;
  income: string;
  balance: string;
  pendingReview: number;
  timeline: Array<{ date: string; debit: string; credit: string }>;
  byCategory: Array<{ categoryId: string | null; name: string; amount: string }>;
  topMerchants: Array<{ merchantId: string | null; name: string; amount: string }>;
  integrations: Array<{ provider: string; status: string; lastSyncAt: string | null }>;
  currency: string;
  budget: BudgetSummary | null;
}

export interface BudgetGroupSummary {
  key: 'savings' | 'needs' | 'provisions' | 'play';
  label: string;
  percentage: string;
  assigned: string;
  used: string;
  recurringPending: string;
  committed: string;
  available: string;
}

export interface BudgetSummary {
  id: string;
  period: string;
  currency: string;
  incomeBase: string;
  groups: BudgetGroupSummary[];
}

export type FinancialTransactionCandidate = z.infer<typeof financialTransactionCandidateSchema>;
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export type RecurringPaymentInput = z.infer<typeof recurringPaymentInputSchema>;
export type RecurringPaymentUpdate = z.infer<typeof recurringPaymentUpdateSchema>;
export type MaterializeObligations = z.infer<typeof materializeObligationsSchema>;
export type ObligationPayment = z.infer<typeof obligationPaymentSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryAssignment = z.infer<typeof categoryAssignmentSchema>;
export type MonthlyBudgetInput = z.infer<typeof monthlyBudgetInputSchema>;
