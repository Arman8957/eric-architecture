-- Amendment requests now capture the client's scope estimate (area + budget)
-- instead of the old free-text services/urgency intake.
ALTER TABLE "amendment_requests" ADD COLUMN     "budgetRange" TEXT,
ADD COLUMN     "projectSizeUnit" TEXT,
ADD COLUMN     "squareFootage" TEXT,
ALTER COLUMN "services" DROP NOT NULL,
ALTER COLUMN "urgency" DROP NOT NULL;

-- Phase progress meetings: the PM can require/exclude a walkthrough call per
-- phase, and the client may opt out of one that is offered.
ALTER TABLE "project_stages" ADD COLUMN     "clientBypassedMeeting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingRequired" BOOLEAN NOT NULL DEFAULT true;

-- The three design phases default to no required meeting, per spec.
UPDATE "project_stages"
SET "meetingRequired" = false
WHERE "name" IN ('Schematic Design', 'Design Development', 'Construction Documents');
