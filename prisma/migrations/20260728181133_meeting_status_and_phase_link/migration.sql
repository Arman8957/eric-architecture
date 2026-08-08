-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PENDING_CLIENT_REQUEST', 'PENDING_RESPONSE', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "meeting_links" ALTER COLUMN "meetingUrl" DROP NOT NULL,
ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'PENDING_RESPONSE',
ADD COLUMN     "stageId" TEXT;

-- Backfill: legacy client-request placeholder rows become PENDING_CLIENT_REQUEST
-- with no URL (the old sentinel value is no longer meaningful).
UPDATE "meeting_links"
SET "status" = 'PENDING_CLIENT_REQUEST', "meetingUrl" = NULL
WHERE "meetingUrl" = 'https://pending.request';

-- Backfill: every other pre-existing row was already "just sent" under the
-- old model (no response concept existed) — treat as settled so they don't
-- suddenly appear as pending in the new UI.
UPDATE "meeting_links"
SET "status" = 'ACCEPTED'
WHERE "meetingUrl" IS NOT NULL AND "meetingUrl" != 'https://pending.request';

-- CreateIndex
CREATE INDEX "meeting_links_stageId_idx" ON "meeting_links"("stageId");

-- CreateIndex
CREATE INDEX "meeting_links_status_idx" ON "meeting_links"("status");

-- AddForeignKey
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "project_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
