-- AlterTable
ALTER TABLE "proposal_services" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timelineWeeks" INTEGER;
