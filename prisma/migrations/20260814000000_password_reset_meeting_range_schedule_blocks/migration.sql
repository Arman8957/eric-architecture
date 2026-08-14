-- Password reset flow
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- Meetings occupy a range, not a single instant
ALTER TABLE "meeting_links" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);

-- Meetings are typed so the studio can group them (initial consultation vs kickoff)
DO $$
BEGIN
    CREATE TYPE "MeetingType" AS ENUM ('INITIAL_CONSULTATION', 'PROJECT_KICKOFF', 'PHASE_PROGRESS', 'GENERAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "meeting_links"
    ADD COLUMN IF NOT EXISTS "meetingType" "MeetingType" NOT NULL DEFAULT 'GENERAL';

-- Existing per-phase meetings keep their meaning
UPDATE "meeting_links" SET "meetingType" = 'PHASE_PROGRESS' WHERE "stageId" IS NOT NULL;

-- PM / admin time off (site visit, vacation, out of office)
CREATE TABLE IF NOT EXISTS "schedule_blocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "schedule_blocks_userId_idx" ON "schedule_blocks"("userId");
CREATE INDEX IF NOT EXISTS "schedule_blocks_startAt_idx" ON "schedule_blocks"("startAt");
CREATE INDEX IF NOT EXISTS "schedule_blocks_endAt_idx" ON "schedule_blocks"("endAt");

ALTER TABLE "schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
