-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT,
    "userId" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientPhone" TEXT,
    "clientCompany" TEXT,
    "projectName" TEXT NOT NULL,
    "projectLocation" TEXT NOT NULL,
    "projectDescription" TEXT,
    "additionalContext" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "projectCategory" "ProjectCategory",
    "squareFootage" TEXT,
    "budgetRange" TEXT,
    "expectedTimeline" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentTerms" TEXT,
    "estimatedDuration" TEXT,
    "contactInfo" TEXT,
    "ownerSignature" TEXT,
    "ownerSignedAt" TIMESTAMP(3),
    "ownerSignedBy" TEXT,
    "architectSignature" TEXT,
    "architectSignedAt" TIMESTAMP(3),
    "architectSignedBy" TEXT,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_services" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_credits" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stages" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_proposalNumber_key" ON "proposals"("proposalNumber");

-- CreateIndex
CREATE INDEX "proposals_userId_idx" ON "proposals"("userId");

-- CreateIndex
CREATE INDEX "proposals_proposalNumber_idx" ON "proposals"("proposalNumber");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "proposals_projectRequestId_idx" ON "proposals"("projectRequestId");

-- CreateIndex
CREATE INDEX "proposal_services_proposalId_idx" ON "proposal_services"("proposalId");

-- CreateIndex
CREATE INDEX "proposal_services_order_idx" ON "proposal_services"("order");

-- CreateIndex
CREATE INDEX "proposal_credits_proposalId_idx" ON "proposal_credits"("proposalId");

-- CreateIndex
CREATE INDEX "project_stages_proposalId_idx" ON "project_stages"("proposalId");

-- CreateIndex
CREATE INDEX "project_stages_status_idx" ON "project_stages"("status");

-- CreateIndex
CREATE INDEX "project_stages_assignedToId_idx" ON "project_stages"("assignedToId");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_services" ADD CONSTRAINT "proposal_services_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_credits" ADD CONSTRAINT "proposal_credits_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
