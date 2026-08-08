-- Track when an approved refund has actually been paid out. Until
-- refundProcessedAt is set, a daily reminder notification is raised for the
-- Super Admin and Finance Manager.
ALTER TABLE "refund_requests" ADD COLUMN "refundProcessedAt" TIMESTAMP(3);
ALTER TABLE "refund_requests" ADD COLUMN "refundProcessedBy" TEXT;
