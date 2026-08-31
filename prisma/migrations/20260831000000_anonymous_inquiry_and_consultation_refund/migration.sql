-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('AWAITING_DECISION', 'ACCEPTED', 'DECLINED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ConsultationRefundStatus" AS ENUM ('PENDING', 'PROCESSED');

-- AlterTable
ALTER TABLE "project_requests" ADD COLUMN     "claimInviteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimInviteSentAt" TIMESTAMP(3),
ADD COLUMN     "claimStaleRemindedAt" TIMESTAMP(3),
ADD COLUMN     "claimTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "claimTokenHash" TEXT,
ADD COLUMN     "inquiryDecidedAt" TIMESTAMP(3),
ADD COLUMN     "inquiryDecidedById" TEXT,
ADD COLUMN     "inquiryStatus" "InquiryStatus";

-- CreateTable
CREATE TABLE "consultation_refunds" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "consultationPaymentId" TEXT NOT NULL,
    "status" "ConsultationRefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "stripeRefundId" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultation_refunds_projectRequestId_key" ON "consultation_refunds"("projectRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_refunds_consultationPaymentId_key" ON "consultation_refunds"("consultationPaymentId");

-- CreateIndex
CREATE INDEX "consultation_refunds_status_idx" ON "consultation_refunds"("status");

-- CreateIndex
CREATE INDEX "consultation_refunds_email_idx" ON "consultation_refunds"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_requests_claimTokenHash_key" ON "project_requests"("claimTokenHash");

-- CreateIndex
CREATE INDEX "project_requests_inquiryStatus_idx" ON "project_requests"("inquiryStatus");

-- AddForeignKey
ALTER TABLE "project_requests" ADD CONSTRAINT "project_requests_inquiryDecidedById_fkey" FOREIGN KEY ("inquiryDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_refunds" ADD CONSTRAINT "consultation_refunds_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_refunds" ADD CONSTRAINT "consultation_refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_refunds" ADD CONSTRAINT "consultation_refunds_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

