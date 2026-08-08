-- Accountants archive approved timecards once payroll has been processed.
ALTER TABLE "timecards" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "timecards" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "timecards" ADD COLUMN "archivedBy" TEXT;

CREATE INDEX "timecards_isArchived_idx" ON "timecards"("isArchived");
