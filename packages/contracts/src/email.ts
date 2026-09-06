import { z } from 'zod';
import { uuidSchema, isoDateTimeSchema } from './common';

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

export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type EmailSourceEvent = z.infer<typeof emailSourceEventSchema>;
export type SourceEvent = z.infer<typeof sourceEventSchema>;
