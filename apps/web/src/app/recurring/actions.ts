'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiWrite } from '@/lib/api';

function required(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  return value.trim();
}

function optional(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function createRecurring(form: FormData): Promise<void> {
  await apiWrite('/api/v1/recurring-payments', 'POST', {
    name: required(form, 'name'),
    expectedAmount: required(form, 'expectedAmount'),
    currency: required(form, 'currency').toUpperCase(),
    categoryId: required(form, 'categoryId'),
    startAt: required(form, 'startAt'),
    dueDay: Number(required(form, 'dueDay')),
    aliases: optional(form, 'aliases')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    frequency: 'monthly',
  });
  revalidatePath('/recurring');
  revalidatePath('/');
  redirect(
    `/recurring?period=${required(form, 'period')}&currency=${required(form, 'filterCurrency')}&created=1`,
  );
}

export async function updateRecurring(form: FormData): Promise<void> {
  const id = required(form, 'id');
  await apiWrite(`/api/v1/recurring-payments/${id}`, 'PATCH', {
    name: required(form, 'name'),
    expectedAmount: required(form, 'expectedAmount'),
    currency: required(form, 'currency').toUpperCase(),
    categoryId: required(form, 'categoryId'),
    dueDay: Number(required(form, 'dueDay')),
    aliases: optional(form, 'aliases')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    status: required(form, 'status'),
  });
  revalidatePath('/recurring');
  revalidatePath('/categories');
  revalidatePath('/');
  redirect(
    `/recurring?period=${required(form, 'period')}&currency=${required(form, 'filterCurrency')}&updated=1`,
  );
}

export async function createCategory(form: FormData): Promise<void> {
  await apiWrite('/api/v1/categories', 'POST', {
    name: required(form, 'categoryName'),
    type: 'expense',
  });
  revalidatePath('/recurring');
  redirect(
    `/recurring?period=${required(form, 'period')}&currency=${required(form, 'currency')}&category=1`,
  );
}

export async function materializeCurrent(form: FormData): Promise<void> {
  const result = await apiWrite<{
    created: number;
    updated?: number;
    unchanged?: number;
    skipped?: number;
  }>('/api/v1/recurring-obligations/materialize', 'POST', {
    period: required(form, 'period'),
  });
  revalidatePath('/recurring');
  revalidatePath('/categories');
  revalidatePath('/');
  const params = new URLSearchParams({
    period: required(form, 'period'),
    currency: required(form, 'currency'),
    synced: '1',
    created: String(result.created ?? 0),
    updated: String(result.updated ?? 0),
    unchanged: String(result.unchanged ?? 0),
    skipped: String(result.skipped ?? 0),
  });
  redirect(`/recurring?${params.toString()}`);
}

export async function payObligation(form: FormData): Promise<void> {
  const id = required(form, 'id');
  await apiWrite(`/api/v1/recurring-obligations/${id}/pay`, 'POST', {
    paidAt: required(form, 'paidAt'),
    actualAmount: required(form, 'actualAmount'),
  });
  revalidatePath('/recurring');
  revalidatePath('/');
  redirect(
    `/recurring?period=${required(form, 'period')}&currency=${required(form, 'currency')}&paid=1`,
  );
}
