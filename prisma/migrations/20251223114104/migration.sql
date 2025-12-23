-- DropForeignKey
ALTER TABLE "project_assets" DROP CONSTRAINT "project_assets_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_assets" DROP CONSTRAINT "project_assets_projectRequestId_fkey";

-- AlterTable
ALTER TABLE "project_assets" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "project_assets_projectRequestId_idx" ON "project_assets"("projectRequestId");

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
