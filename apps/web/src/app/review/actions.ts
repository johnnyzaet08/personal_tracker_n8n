'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiWrite } from '@/lib/api';

function required(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${key}`);
  return value.trim();
}

export async function assignCategory(form: FormData): Promise<void> {
  await apiWrite(`/api/v1/transactions/${required(form, 'transactionId')}/category`, 'PATCH', {
    categoryId: required(form, 'categoryId'),
  });
  revalidatePath('/review');
  revalidatePath('/categories');
  revalidatePath('/');
  redirect(
    `/review?period=${required(form, 'period')}&currency=${required(form, 'currency')}&assigned=1`,
  );
}
