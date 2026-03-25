-- Add visibility flag for user-facing tool selectors.
ALTER TABLE "Tool"
ADD COLUMN "userSelectable" BOOLEAN NOT NULL DEFAULT true;

-- Hide internal/system tools from user selectors.
UPDATE "Tool"
SET "userSelectable" = false
WHERE "isBuiltIn" = true
  AND "organizationId" IS NULL
  AND "name" IN (
    'create_artifact',
    'update_artifact',
    'date_time',
    'ocr_document',
    'file_operations',
    'json_transform',
    'text_utilities'
  );

-- Keep these built-ins explicitly selectable.
UPDATE "Tool"
SET "userSelectable" = true
WHERE "isBuiltIn" = true
  AND "organizationId" IS NULL
  AND "name" IN ('web_search', 'code_interpreter');
