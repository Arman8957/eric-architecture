-- AlterTable
ALTER TABLE "project_requests" ADD COLUMN     "assignedManagerId" TEXT;

-- CreateIndex
CREATE INDEX "project_requests_assignedManagerId_idx" ON "project_requests"("assignedManagerId");

-- AddForeignKey
ALTER TABLE "project_requests" ADD CONSTRAINT "project_requests_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
