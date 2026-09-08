export interface TransactionRecord {
  id: string;
  direction: 'debit' | 'credit';
  transactionType: string;
  amount: string;
  currency: string;
  description: string;
  occurredAt: string;
  status: string;
  requiresReview: boolean;
  account: { alias: string } | null;
  merchant: { displayName: string } | null;
  category: { name: string; color: string | null } | null;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  type: string;
  color: string | null;
  icon: string | null;
  status: string;
  budgetGroup: 'savings' | 'needs' | 'provisions' | 'play' | null;
  spent?: string;
}
export interface RecurringRecord {
  id: string;
  name: string;
  expectedAmount: string | null;
  currency: string;
  frequency: string;
  nextExpectedAt: string | null;
  status: string;
  merchant: { displayName: string } | null;
}
export interface ReviewRecord {
  id: string;
  reason: string;
  priority: string;
  status: string;
  createdAt: string;
}
export interface IntegrationRecord {
  id: string;
  provider: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
}
export interface IntegrationStatus {
  api: 'available' | 'error';
  postgresql: 'connected' | 'error';
  n8n: 'running' | 'unavailable';
  gmail: string;
  gmailLastSyncAt: string | null;
}
