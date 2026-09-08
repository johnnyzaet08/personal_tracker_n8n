-- Normalized incoming financial evidence for human reconciliation; never MIME or email bodies.
ALTER TABLE automation.review_queue
  ADD COLUMN proposed_financial_candidate JSONB,
  ADD COLUMN proposed_content_hash CHAR(64),
  ADD CONSTRAINT review_queue_proposed_content_hash_check CHECK (proposed_content_hash IS NULL OR proposed_content_hash ~ '^[a-f0-9]{64}$');
