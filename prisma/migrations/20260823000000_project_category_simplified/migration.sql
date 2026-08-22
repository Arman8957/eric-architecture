-- ProjectCategory drops INSTITUTIONAL, LANDSCAPE, URBAN_PLANNING and renames
-- REMODEL_ADDITION to REMODEL. Postgres cannot remove a value from an enum in
-- place, so the type is rebuilt and every column that uses it is moved over.
--
-- Existing data (checked before writing this):
--   media_contents.category  URBAN_PLANNING x1, REMODEL_ADDITION x1
--   everything else is RESIDENTIAL / COMMERCIAL / TENANT_IMPROVEMENT
-- The retired values collapse into OTHER, except REMODEL_ADDITION which has a
-- direct successor in REMODEL.

-- 1. The retired values have to be gone before the columns are recast.
UPDATE "media_contents"
   SET "category" = 'OTHER'
 WHERE "category" IN ('INSTITUTIONAL', 'LANDSCAPE', 'URBAN_PLANNING');
UPDATE "project_requests"
   SET "projectCategory" = 'OTHER'
 WHERE "projectCategory" IN ('INSTITUTIONAL', 'LANDSCAPE', 'URBAN_PLANNING');
UPDATE "projects"
   SET "category" = 'OTHER'
 WHERE "category" IN ('INSTITUTIONAL', 'LANDSCAPE', 'URBAN_PLANNING');
UPDATE "proposals"
   SET "projectCategory" = 'OTHER'
 WHERE "projectCategory" IN ('INSTITUTIONAL', 'LANDSCAPE', 'URBAN_PLANNING');

-- 2. Build the new type alongside the old one.
CREATE TYPE "ProjectCategory_new" AS ENUM (
  'RESIDENTIAL',
  'COMMERCIAL',
  'INTERIOR',
  'MIXED_USE',
  'TENANT_IMPROVEMENT',
  'REMODEL',
  'ADDITION',
  'OTHER'
);

-- 3. Move each column across, folding REMODEL_ADDITION into REMODEL on the way.
ALTER TABLE "media_contents"
  ALTER COLUMN "category" TYPE "ProjectCategory_new"
  USING (
    CASE "category"::text
      WHEN 'REMODEL_ADDITION' THEN 'REMODEL'
      ELSE "category"::text
    END
  )::"ProjectCategory_new";

ALTER TABLE "project_requests"
  ALTER COLUMN "projectCategory" TYPE "ProjectCategory_new"
  USING (
    CASE "projectCategory"::text
      WHEN 'REMODEL_ADDITION' THEN 'REMODEL'
      ELSE "projectCategory"::text
    END
  )::"ProjectCategory_new";

ALTER TABLE "projects"
  ALTER COLUMN "category" TYPE "ProjectCategory_new"
  USING (
    CASE "category"::text
      WHEN 'REMODEL_ADDITION' THEN 'REMODEL'
      ELSE "category"::text
    END
  )::"ProjectCategory_new";

ALTER TABLE "proposals"
  ALTER COLUMN "projectCategory" TYPE "ProjectCategory_new"
  USING (
    CASE "projectCategory"::text
      WHEN 'REMODEL_ADDITION' THEN 'REMODEL'
      ELSE "projectCategory"::text
    END
  )::"ProjectCategory_new";

-- 4. Swap the types over.
DROP TYPE "ProjectCategory";
ALTER TYPE "ProjectCategory_new" RENAME TO "ProjectCategory";
