-- AlterTable
ALTER TABLE "project_requests" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "project_requests_deletedAt_idx" ON "project_requests"("deletedAt");
