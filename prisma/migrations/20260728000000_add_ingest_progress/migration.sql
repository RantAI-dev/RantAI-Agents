-- Background ingest job: progress tracking fields + Document lifecycle status.
-- All additive; safe to apply on a populated DB (columns have defaults / are nullable).

ALTER TABLE "IngestJob"
  ADD COLUMN IF NOT EXISTS "step"        TEXT,
  ADD COLUMN IF NOT EXISTS "progress"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stepCurrent" INTEGER,
  ADD COLUMN IF NOT EXISTS "stepTotal"   INTEGER,
  ADD COLUMN IF NOT EXISTS "etaSeconds"  INTEGER,
  ADD COLUMN IF NOT EXISTS "startedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "params"      JSONB;

-- Claim query: WHERE status='pending' ORDER BY "createdAt".
CREATE INDEX IF NOT EXISTS "IngestJob_status_createdAt_idx" ON "IngestJob"("status", "createdAt");

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
