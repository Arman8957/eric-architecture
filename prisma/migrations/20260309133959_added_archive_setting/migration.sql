-- AlterTable
ALTER TABLE "project_requests" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archiverId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "project_requests_isArchived_idx" ON "project_requests"("isArchived");

-- CreateIndex
CREATE INDEX "projects_isArchived_idx" ON "projects"("isArchived");
