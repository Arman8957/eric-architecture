/*
  Warnings:

  - A unique constraint covering the columns `[projectId]` on the table `proposals` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "project_stages" ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "proposalId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "proposals_projectId_key" ON "proposals"("projectId");
