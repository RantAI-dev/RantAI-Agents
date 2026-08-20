-- Nested knowledge bases.
--
-- A KB may now sit inside another KB. Existing rows get parentId NULL, which
-- means "top level" — so every KB that exists today keeps behaving exactly as
-- it does now and nothing needs backfilling.
--
-- ON DELETE RESTRICT is deliberate: cascading would let one delete take out a
-- whole branch of someone's library, and SET NULL would silently promote the
-- children to the root next to unrelated KBs. The API asks for an explicit
-- cascade instead and deletes deepest-first.
ALTER TABLE "KnowledgeBaseGroup" ADD COLUMN "parentId" TEXT;

ALTER TABLE "KnowledgeBaseGroup"
  ADD CONSTRAINT "KnowledgeBaseGroup_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "KnowledgeBaseGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retrieval expands a selected KB to its subtree, which walks one query per
-- level filtering on parentId; without this index that walk is a seq scan of
-- every KB in the install on every chat turn.
CREATE INDEX "KnowledgeBaseGroup_parentId_idx" ON "KnowledgeBaseGroup"("parentId");
