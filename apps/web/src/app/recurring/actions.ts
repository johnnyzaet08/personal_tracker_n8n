'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiWrite } from '@/lib/api';

function required(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  return value.trim();
}

export async function createRecurring(form: FormData): Promise<void> {
  await apiWrite('/api/v1/recurring-payments', 'POST', {
    name: required(form, 'name'),
    expectedAmount: required(form, 'expectedAmount'),
    currency: required(form, 'currency').toUpperCase(),
    categoryId: required(form, 'categoryId'),
    startAt: required(form, 'startAt'),
    dueDay: Number(required(form, 'dueDay')),
    aliases: required(form, 'aliases')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    frequency: 'monthly',
  });
  revalidatePath('/recurring');
  revalidatePath('/');
  redirect('/recurring?created=1');
}

export async function createCategory(form: FormData): Promise<void> {
  await apiWrite('/api/v1/categories', 'POST', {
    name: required(form, 'categoryName'),
    type: 'expense',
  });
  revalidatePath('/recurring');
  redirect('/recurring?category=1');
}

export async function materializeCurrent(form: FormData): Promise<void> {
  await apiWrite('/api/v1/recurring-obligations/materialize', 'POST', {
    period: required(form, 'period'),
  });
  revalidatePath('/recurring');
  revalidatePath('/');
  redirect(`/recurring?period=${required(form, 'period')}`);
}

export async function payObligation(form: FormData): Promise<void> {
  const id = required(form, 'id');
  await apiWrite(`/api/v1/recurring-obligations/${id}/pay`, 'POST', {
    paidAt: required(form, 'paidAt'),
    actualAmount: required(form, 'actualAmount'),
  });
  revalidatePath('/recurring');
  revalidatePath('/');
  redirect('/recurring?paid=1');
}
