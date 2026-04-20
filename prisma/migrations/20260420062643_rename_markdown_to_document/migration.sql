-- Rename artifact discriminator: text/markdown -> application/document.
-- Idempotent: re-running this migration is safe (no rows match the WHERE
-- clause after the first successful run).
UPDATE "Document" SET "artifactType" = 'application/document'
WHERE "artifactType" = 'text/markdown';
