/*
  Warnings:

  - Added the required column `projectId` to the `project_stages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "project_stages" ADD COLUMN     "projectId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
