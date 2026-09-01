import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  INTERNAL_API_KEY: z.string().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOCAL_AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
  LOCAL_TENANT_ID: z.uuid().optional(),
  N8N_INTERNAL_URL: z.url().default('http://n8n:5678'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }
  if (result.data.LOCAL_AUTH_ENABLED === 'true' && !result.data.LOCAL_TENANT_ID) {
    throw new Error('LOCAL_TENANT_ID is required when LOCAL_AUTH_ENABLED=true');
  }
  return result.data;
}
