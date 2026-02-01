-- CreateTable
CREATE TABLE "meeting_links" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "sentToUserId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "meeting_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_links_projectRequestId_idx" ON "meeting_links"("projectRequestId");

-- CreateIndex
CREATE INDEX "meeting_links_sentToUserId_idx" ON "meeting_links"("sentToUserId");

-- CreateIndex
CREATE INDEX "meeting_links_sentByUserId_idx" ON "meeting_links"("sentByUserId");

-- CreateIndex
CREATE INDEX "meeting_links_scheduledAt_idx" ON "meeting_links"("scheduledAt");

-- AddForeignKey
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_sentToUserId_fkey" FOREIGN KEY ("sentToUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_links" ADD CONSTRAINT "meeting_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
