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
}

export type FinancialTransactionCandidate = z.infer<typeof financialTransactionCandidateSchema>;
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
