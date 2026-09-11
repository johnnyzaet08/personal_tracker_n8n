import type { FinancialTransactionCandidate } from '@tracker/contracts';
import { Prisma } from '@tracker/database';

type RecurringDatabase = Pick<Prisma.TransactionClient, 'recurringObligation'>;

export type RecurringObligationMatch = Prisma.RecurringObligationGetPayload<{
  include: { recurringPayment: true; transaction: true };
}>;

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export async function findRecurringObligationMatches(
  database: RecurringDatabase,
  candidate: FinancialTransactionCandidate,
): Promise<RecurringObligationMatch[]> {
  if (candidate.direction !== 'debit') return [];

  const eligible = await database.recurringObligation.findMany({
    where: {
      tenantId: candidate.tenantId,
      currency: candidate.currency,
      expectedAmount: new Prisma.Decimal(candidate.amount),
      paymentStatus: { in: ['pending', 'paid'] },
      recurringPayment: { accountId: candidate.accountId ?? undefined },
    },
    include: { recurringPayment: true, transaction: true },
  });
  const description = normalizedName(candidate.description);

  return eligible.filter((item) => {
    const names = [
      item.recurringPayment.name,
      ...((item.recurringPayment.aliases as string[]) ?? []),
    ].map(normalizedName);
    return (
      names.includes(description) &&
      Math.abs(new Date(candidate.occurredAt).getTime() - item.dueAt.getTime()) <= 7 * 86_400_000
    );
  });
}

export function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value as Record<string, Prisma.JsonValue>;
}
