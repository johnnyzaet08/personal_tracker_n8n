'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiWrite } from '@/lib/api';

function required(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  return value.trim();
}

function destination(form: FormData): string {
  return `/categories?period=${required(form, 'period')}&currency=${required(form, 'currency')}`;
}

export async function saveBudget(form: FormData): Promise<void> {
  await apiWrite('/api/v1/monthly-budgets', 'POST', {
    period: required(form, 'period'),
    currency: required(form, 'currency').toUpperCase(),
    incomeBase: required(form, 'incomeBase'),
    allocations: {
      savings: Number(required(form, 'savings')),
      needs: Number(required(form, 'needs')),
      provisions: Number(required(form, 'provisions')),
      play: Number(required(form, 'play')),
    },
  });
  revalidatePath('/categories');
  revalidatePath('/');
  redirect(`${destination(form)}&saved=1`);
}

export async function createCategory(form: FormData): Promise<void> {
  await apiWrite('/api/v1/categories', 'POST', {
    name: required(form, 'name'),
    type: 'expense',
    budgetGroup: required(form, 'budgetGroup'),
    color: required(form, 'color'),
  });
  revalidatePath('/categories');
  redirect(`${destination(form)}&categoryCreated=1`);
}

export async function updateCategory(form: FormData): Promise<void> {
  await apiWrite(`/api/v1/categories/${required(form, 'categoryId')}`, 'PATCH', {
    name: required(form, 'name'),
    type: required(form, 'type'),
    budgetGroup: required(form, 'budgetGroup'),
    color: required(form, 'color'),
  });
  revalidatePath('/categories');
  revalidatePath('/');
  revalidatePath('/review');
  redirect(`${destination(form)}&categoryUpdated=1`);
}
