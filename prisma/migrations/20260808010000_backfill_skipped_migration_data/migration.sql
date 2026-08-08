-- Backfill for the data steps of 20260803000000 and 20260803010000.
--
-- Those two migrations were applied to the database via `prisma db push`, which
-- syncs schema but never runs data statements. They were later marked as
-- applied to unblock the migration history, so their UPDATEs would otherwise
-- never run. Both statements below are safe to re-run.

-- The three design phases default to no required meeting, per spec.
UPDATE "project_stages"
SET "meetingRequired" = false
WHERE "name" IN ('Schematic Design', 'Design Development', 'Construction Documents')
  AND "meetingRequired" = true;

-- Seed the name parts from the existing single `name` column so profiles are
-- not blank on first load. Everything after the first token becomes the surname.
-- Guarded on firstName IS NULL so anyone who has since edited their profile
-- keeps what they entered.
UPDATE "users"
SET "firstName" = split_part("name", ' ', 1),
    "lastName"  = NULLIF(substring("name" FROM position(' ' IN "name") + 1), "name")
WHERE "name" IS NOT NULL
  AND "name" <> ''
  AND "firstName" IS NULL;
