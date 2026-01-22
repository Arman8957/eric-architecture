/*
  Warnings:

  - Made the column `projectRequestId` on table `proposals` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_projectRequestId_fkey";

-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_userId_fkey";

-- AlterTable
ALTER TABLE "proposals" ALTER COLUMN "projectRequestId" SET NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
