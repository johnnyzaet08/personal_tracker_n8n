import { z } from 'zod';
import { uuidSchema } from './common';

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
  tenantId: uuidSchema,
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

export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
