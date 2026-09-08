import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const currencySchema = z.string().regex(/^[A-Z]{3}$/u, 'Expected ISO 4217 currency code');
export const decimalStringSchema = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,4})?$/u, 'Expected a positive decimal string');

export const attachmentMetadataSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().nonnegative(),
  contentId: z.string().max(255).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});

export const emailSourceEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: uuidSchema,
  tenantId: uuidSchema,
  source: z.enum(['gmail', 'email_fixture', 'email_forward']),
  externalId: z.string().min(1).max(512),
  occurredAt: isoDateTimeSchema,
  receivedAt: isoDateTimeSchema,
  sender: z.object({
    address: z.email().max(320),
    name: z.string().max(255).optional(),
    domain: z.string().max(255).optional(),
  }),
  subject: z.string().max(998).optional(),
  textBody: z.string().max(1_000_000).optional(),
  htmlBody: z.string().max(2_000_000).optional(),
  labels: z.array(z.string().max(255)).max(100).optional(),
  attachments: z.array(attachmentMetadataSchema).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const sourceEventSchema = emailSourceEventSchema;

export const financialTransactionCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  candidateId: uuidSchema,
  tenantId: uuidSchema,
  sourceEventId: uuidSchema,
  externalReference: z.string().max(512).optional(),
  accountId: uuidSchema.optional(),
  merchantId: uuidSchema.optional(),
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

export const classificationResultSchema = z.object({
  schemaVersion: z.literal(1),
  sourceEventId: uuidSchema,
  classifier: z.string().min(1).max(128),
  classifierVersion: z.string().min(1).max(64),
  labels: z.array(z.string().min(1).max(128)).max(50),
  confidence: z.number().min(0).max(1).optional(),
  decisionReason: z.string().max(1_000).optional(),
});

export const actionRequestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceEventId: uuidSchema.optional(),
  actionType: z.string().min(1).max(128),
  idempotencyKey: z.string().min(8).max(255),
  input: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']).default('pending'),
});

export const reviewQueueItemSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: uuidSchema,
  sourceEventId: uuidSchema,
  reason: z.string().min(1).max(1_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

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

export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type EmailSourceEvent = z.infer<typeof emailSourceEventSchema>;
export type SourceEvent = z.infer<typeof sourceEventSchema>;
export type FinancialTransactionCandidate = z.infer<typeof financialTransactionCandidateSchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export type RecurringPaymentInput = z.infer<typeof recurringPaymentInputSchema>;
export type RecurringPaymentUpdate = z.infer<typeof recurringPaymentUpdateSchema>;
export type MaterializeObligations = z.infer<typeof materializeObligationsSchema>;
export type ObligationPayment = z.infer<typeof obligationPaymentSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryAssignment = z.infer<typeof categoryAssignmentSchema>;
export type MonthlyBudgetInput = z.infer<typeof monthlyBudgetInputSchema>;
