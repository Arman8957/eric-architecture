-- AlterTable
-- Structured in-person meeting address. `meetingLocation` is left in place and
-- keeps holding the one-line rendering of these parts, so existing rows and any
-- consumer of that column keep working.
ALTER TABLE "project_requests" ADD COLUMN     "meetingCountry" TEXT,
ADD COLUMN     "meetingState" TEXT,
ADD COLUMN     "meetingCity" TEXT,
ADD COLUMN     "meetingStreetAddress" TEXT,
ADD COLUMN     "meetingAptSuiteUnit" TEXT,
ADD COLUMN     "meetingZipCode" TEXT;
