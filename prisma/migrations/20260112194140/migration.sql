/*
  Warnings:

  - A unique constraint covering the columns `[proposalId]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "project_stages" ADD COLUMN     "projectRequestId" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "proposalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "projects_proposalId_key" ON "projects"("proposalId");

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
