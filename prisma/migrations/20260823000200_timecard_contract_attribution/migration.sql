-- A timesheet line now records which contract (the original proposal or one of
-- its amendments) the phase belongs to. Phase names repeat across contracts —
-- "Construction Support" can exist on both — so the name alone could not say
-- where the hours were booked. Nullable so existing rows stay valid.
ALTER TABLE "timecard_billable_entries" ADD COLUMN IF NOT EXISTS "proposalId" TEXT;
ALTER TABLE "timecard_billable_entries" ADD COLUMN IF NOT EXISTS "proposalNumber" TEXT;
ALTER TABLE "timecard_billable_entries" ADD COLUMN IF NOT EXISTS "stageId" TEXT;

ALTER TABLE "timecard_entries" ADD COLUMN IF NOT EXISTS "proposalId" TEXT;
ALTER TABLE "timecard_entries" ADD COLUMN IF NOT EXISTS "proposalNumber" TEXT;
ALTER TABLE "timecard_entries" ADD COLUMN IF NOT EXISTS "stageId" TEXT;

CREATE INDEX IF NOT EXISTS "timecard_billable_entries_proposalId_idx"
  ON "timecard_billable_entries"("proposalId");
CREATE INDEX IF NOT EXISTS "timecard_entries_proposalId_idx"
  ON "timecard_entries"("proposalId");
