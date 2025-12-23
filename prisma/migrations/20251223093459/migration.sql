-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('NEW_CONSTRUCTION', 'RENOVATION', 'ADDITION', 'INTERIOR_DESIGN', 'LANDSCAPE_DESIGN', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'REVIEWED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "project_assets" ADD COLUMN     "projectRequestId" TEXT;

-- CreateTable
CREATE TABLE "project_requests" (
    "id" TEXT NOT NULL,
    "clientFirstName" TEXT NOT NULL,
    "clientMiddleName" TEXT,
    "clientLastName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "state" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "additionalComments" TEXT,
    "projectName" TEXT NOT NULL,
    "projectLocationSameAsClient" BOOLEAN NOT NULL DEFAULT false,
    "projectCountry" TEXT,
    "projectState" TEXT,
    "projectCity" TEXT,
    "projectStreetAddress" TEXT,
    "projectZipCode" TEXT,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'NEW_CONSTRUCTION',
    "projectCategory" "ProjectCategory",
    "projectSize" TEXT,
    "budgetRange" TEXT,
    "preferredArchitecturalStyle" TEXT,
    "siteConstraints" TEXT,
    "sustainabilityGoals" TEXT,
    "specialRequirements" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "appointmentTime" TEXT,
    "appointmentType" TEXT,
    "additionalNotes" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_requests_email_idx" ON "project_requests"("email");

-- CreateIndex
CREATE INDEX "project_requests_status_idx" ON "project_requests"("status");

-- CreateIndex
CREATE INDEX "project_requests_userId_idx" ON "project_requests"("userId");

-- CreateIndex
CREATE INDEX "project_requests_createdAt_idx" ON "project_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "project_requests" ADD CONSTRAINT "project_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
