-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('NORMAL', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "parentProposalId" TEXT,
ADD COLUMN     "proposalType" "ProposalType" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "amendment_requests" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "services" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "amendmentProposalId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "amendment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amendment_requests_amendmentProposalId_key" ON "amendment_requests"("amendmentProposalId");

-- CreateIndex
CREATE INDEX "amendment_requests_proposalId_idx" ON "amendment_requests"("proposalId");

-- CreateIndex
CREATE INDEX "amendment_requests_status_idx" ON "amendment_requests"("status");

-- CreateIndex
CREATE INDEX "amendment_requests_requestedById_idx" ON "amendment_requests"("requestedById");

-- CreateIndex
CREATE INDEX "proposals_parentProposalId_idx" ON "proposals"("parentProposalId");

-- CreateIndex
CREATE INDEX "proposals_proposalType_idx" ON "proposals"("proposalType");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_amendmentProposalId_fkey" FOREIGN KEY ("amendmentProposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_requests" ADD CONSTRAINT "amendment_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
