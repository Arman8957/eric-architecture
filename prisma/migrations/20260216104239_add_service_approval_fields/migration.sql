-- CreateEnum
CREATE TYPE "ServiceApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "proposal_services" ADD COLUMN     "approvalStatus" "ServiceApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "proposal_services_approvalStatus_idx" ON "proposal_services"("approvalStatus");
