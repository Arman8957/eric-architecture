/*
  Warnings:

  - Made the column `proposalId` on table `projects` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "proposalId" SET NOT NULL;
