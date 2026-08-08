-- AlterTable
ALTER TABLE "project_requests" ADD COLUMN     "projectCompletedAt" TIMESTAMP(3),
ADD COLUMN     "totalDurationMonths" DOUBLE PRECISION;
