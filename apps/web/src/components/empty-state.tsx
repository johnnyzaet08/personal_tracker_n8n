import { Inbox } from 'lucide-react';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-icon">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
