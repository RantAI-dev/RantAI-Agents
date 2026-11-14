-- Pending tool approvals of a live chat (Rust port, D3; docs/port/differences.md row 2).
--
-- The TypeScript gate kept them in an in-process Map, so a decision that reached another
-- instance than the stream timed out as denied. One row per (tool call, user): the stream
-- writes it "pending" and polls it; the decision route sets "approved" or "denied". A
-- decision that arrives before the stream waits is written as a row of its own and read
-- when the stream starts waiting. Purely additive.
CREATE TABLE "ChatToolApproval" (
    "toolCallId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ChatToolApproval_pkey" PRIMARY KEY ("toolCallId","userId")
);

-- The purge of old rows: WHERE "createdAt" < now() - interval.
CREATE INDEX "ChatToolApproval_createdAt_idx" ON "ChatToolApproval"("createdAt");
