import { z } from 'zod';
import { currencySchema, isoDateTimeSchema, uuidSchema } from './common';
import { financialTransactionCandidateSchema } from './finance';

export const emailProcessingClassificationSchema = z.enum([
  'new',
  'exact_duplicate',
  'already_processed',
  'conflict',
  'requires_review',
  'ignored_outside_period',
  'invalid',
]);
export const emailSyncRunStatusSchema = z.enum([
  'pending',
  'fetching',
  'awaiting_selection',
  'processing',
  'completed',
  'partially_completed',
  'failed',
  'cancelled',
]);
export const emailReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u);
export const emailSourceConfigurationInputSchema = z.strictObject({
  schemaVersion: z.literal(1).default(1),
  integrationId: uuidSchema,
  displayName: z.string().trim().min(1).max(160),
  senderAddress: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  institutionName: z.string().trim().min(1).max(160),
  adapterKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/u),
  accountId: uuidSchema.nullable().default(null),
  defaultCurrency: currencySchema.nullable().default(null),
  autoIngestionEnabled: z.boolean().default(false),
  manualSyncEnabled: z.boolean().default(true),
  status: z.enum(['active', 'disabled']).default('active'),
});
export const emailSourceConfigurationPatchSchema = emailSourceConfigurationInputSchema.partial();
export const emailSourceConfigurationSchema = emailSourceConfigurationInputSchema.extend({
  id: uuidSchema,
  tenantId: uuidSchema,
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastResult: z.string().max(64).nullable(),
  lastErrorCode: emailReasonCodeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const emailSyncPreviewRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(1).default(1),
    period: z.enum(['current_month', 'exact_date']),
    exactDate: z.iso.date().optional(),
    idempotencyKey: uuidSchema.optional(),
  })
  .refine((v) => (v.period === 'exact_date' ? Boolean(v.exactDate) : !v.exactDate), {
    message: 'An exact date is required only for the exact-date period',
    path: ['exactDate'],
  });
export const emailSyncSelectionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1).default(1),
  candidateIds: z
    .array(uuidSchema)
    .min(1)
    .max(10)
    .refine((v) => new Set(v).size === v.length),
});
export const bankEmailAdapterResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapter: z.strictObject({ name: z.string().max(128), version: z.string().max(64) }),
  candidate: financialTransactionCandidateSchema.optional(),
  requiresReview: z.boolean(),
  reasonCodes: z.array(emailReasonCodeSchema).max(20),
});
export const emailProcessingResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  classification: emailProcessingClassificationSchema,
  messageId: z.string().min(1).max(512),
  sourceEventId: uuidSchema.optional(),
  transactionId: uuidSchema.optional(),
  reviewId: uuidSchema.optional(),
  reasonCodes: z.array(emailReasonCodeSchema).max(20),
});
export const emailSyncRunResultSchema = z.strictObject({
  found: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  inReview: z.number().int().nonnegative(),
  ignoredOutsidePeriod: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  updated: z.literal(0),
  errors: z
    .array(z.strictObject({ code: emailReasonCodeSchema, message: z.string().max(160) }))
    .max(10),
});
export const emailSyncCandidateSchema = z.strictObject({
  id: uuidSchema,
  messageId: z.string().min(1).max(512),
  receivedAt: isoDateTimeSchema,
  eligible: z.boolean(),
  selected: z.boolean(),
  classification: emailProcessingClassificationSchema,
  financial: financialTransactionCandidateSchema.optional(),
  reasonCodes: z.array(emailReasonCodeSchema).max(20),
  processingResult: emailProcessingResultSchema.optional(),
});
export const emailSyncRunSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: uuidSchema,
  tenantId: uuidSchema,
  sourceId: uuidSchema,
  status: emailSyncRunStatusSchema,
  period: z.enum(['current_month', 'exact_date']),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/u),
  exactDate: z.iso.date().nullable(),
  result: emailSyncRunResultSchema,
  candidates: z.array(emailSyncCandidateSchema).max(10),
  lastErrorCode: emailReasonCodeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export const emailSyncPreviewSchema = emailSyncRunSchema;
export const emailSourceOptionsSchema = z.strictObject({
  integrations: z.array(
    z.strictObject({ id: uuidSchema, provider: z.string(), status: z.string() }),
  ),
  accounts: z.array(
    z.strictObject({ id: uuidSchema, alias: z.string(), currency: currencySchema }),
  ),
  adapters: z.array(
    z.strictObject({ key: z.string(), displayName: z.string(), version: z.string() }),
  ),
  currentMonth: z.string(),
  today: z.iso.date(),
  timezone: z.literal('America/Costa_Rica'),
});

export type EmailSourceConfiguration = z.infer<typeof emailSourceConfigurationSchema>;
export type EmailSourceConfigurationInput = z.infer<typeof emailSourceConfigurationInputSchema>;
export type EmailSourceConfigurationPatch = z.infer<typeof emailSourceConfigurationPatchSchema>;
export type EmailSyncPreviewRequest = z.infer<typeof emailSyncPreviewRequestSchema>;
export type EmailSyncPreview = z.infer<typeof emailSyncPreviewSchema>;
export type EmailSyncCandidate = z.infer<typeof emailSyncCandidateSchema>;
export type EmailSyncSelectionRequest = z.infer<typeof emailSyncSelectionRequestSchema>;
export type EmailSyncRun = z.infer<typeof emailSyncRunSchema>;
export type EmailSyncRunResult = z.infer<typeof emailSyncRunResultSchema>;
export type EmailProcessingResult = z.infer<typeof emailProcessingResultSchema>;
export type BankEmailAdapterResult = z.infer<typeof bankEmailAdapterResultSchema>;
export type EmailSourceOptions = z.infer<typeof emailSourceOptionsSchema>;
