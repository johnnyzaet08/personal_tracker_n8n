'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiWrite } from '@/lib/api';

function required(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  return value.trim();
}

export async function createMonthlyIncome(form: FormData): Promise<void> {
  const period = required(form, 'period');
  const currency = required(form, 'currency').toUpperCase();
  await apiWrite('/api/v1/monthly-incomes', 'POST', {
    period,
    currency,
    occurredOn: required(form, 'occurredOn'),
    description: required(form, 'description'),
    amount: required(form, 'amount'),
  });
  revalidatePath('/income');
  revalidatePath('/categories');
  revalidatePath('/');
  redirect(`/income?period=${period}&currency=${currency}&added=1`);
}
