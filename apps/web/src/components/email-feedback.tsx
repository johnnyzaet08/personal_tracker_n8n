import type { EmailActionResult } from '@/lib/email-ui';

export function EmailFeedback({
  error,
}: {
  error: Extract<EmailActionResult<unknown>, { ok: false }> | null;
}) {
  if (!error) return null;
  return (
    <div className="email-feedback email-feedback-error" role="alert">
      <strong>{error.error}</strong>
      {error.correlationId ? (
        <small>Identificador de seguimiento: {error.correlationId}</small>
      ) : null}
    </div>
  );
}
