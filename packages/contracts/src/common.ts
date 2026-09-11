import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const currencySchema = z.string().regex(/^[A-Z]{3}$/u, 'Expected ISO 4217 currency code');
export const decimalStringSchema = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,4})?$/u, 'Expected a positive decimal string');

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
