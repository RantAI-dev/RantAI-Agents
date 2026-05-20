-- Add a monotonic per-row sequence column to DashboardMessage so the loader has
-- a deterministic tiebreaker. PostgreSQL's now() (which Prisma's @default(now())
-- compiles to) is transaction-scoped, so batched inserts inside a single
-- $transaction tie on createdAt and ORDER BY createdAt ASC becomes
-- non-deterministic. Combined with random UUID ids that have no time prefix,
-- reload could reorder a turn into Q,A,A,Q.
--
-- Strategy:
--   1. Add seq as a nullable BIGINT first.
--   2. Backfill in stable order: (createdAt ASC, id ASC) so existing chats
--      keep their effective order. (Random UUIDs can't disambiguate true
--      send order on tied timestamps, but this is the best we can do for
--      already-corrupted historical rows — at least it'll be stable.)
--   3. Attach a sequence for future inserts, advance it past the backfill,
--      set the default, set NOT NULL.
--   4. Add the (sessionId, seq) index used by the loader.

ALTER TABLE "DashboardMessage" ADD COLUMN "seq" BIGINT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "DashboardMessage"
)
UPDATE "DashboardMessage" m
SET "seq" = ordered.rn
FROM ordered
WHERE m.id = ordered.id;

CREATE SEQUENCE "DashboardMessage_seq_seq" OWNED BY "DashboardMessage"."seq";

SELECT setval(
  '"DashboardMessage_seq_seq"',
  COALESCE((SELECT MAX("seq") FROM "DashboardMessage"), 0) + 1,
  false
);

ALTER TABLE "DashboardMessage"
  ALTER COLUMN "seq" SET DEFAULT nextval('"DashboardMessage_seq_seq"'),
  ALTER COLUMN "seq" SET NOT NULL;

CREATE INDEX "DashboardMessage_sessionId_seq_idx"
  ON "DashboardMessage" ("sessionId", "seq");
