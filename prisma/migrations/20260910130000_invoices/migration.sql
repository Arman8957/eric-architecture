-- Invoices: bills raised against a project outside the signed contract.
--
-- Two kinds, which behave differently in the accounts:
--
--   REIMBURSABLE_EXPENSE — the firm paid something on the client's behalf
--     (permit fees and the like) and is billing it back. The money left the
--     firm when the invoice was raised, so it is a cost from that moment; the
--     client's repayment is revenue against it and the pair nets to nothing.
--
--   ADDITIONAL_SERVICE — work beyond the contracted scope. Nothing left the
--     firm, so there is no cost — revenue only, and only once the client pays.
--
-- Kept out of `proposals` on purpose. A proposal is an agreement the client
-- accepts; an invoice is a demand for payment against one that already exists.
-- Folding them together would have put unaccepted bills into contract totals.
--
-- `proposalId` records which contract the invoice extends — the original or a
-- named amendment. Nullable and ON DELETE SET NULL: losing the contract row
-- must not take the record of money billed with it.
--
-- `paidAt`, not `createdAt`, is the date revenue is attributed to, so a
-- December bill settled in January counts as January's income.

CREATE TYPE "InvoiceType" AS ENUM ('REIMBURSABLE_EXPENSE', 'ADDITIONAL_SERVICE');
CREATE TYPE "InvoiceStatus" AS ENUM ('SENT', 'PAID', 'CANCELLED');

CREATE TABLE "invoices" (
    "id"                    TEXT NOT NULL,
    "projectRequestId"      TEXT NOT NULL,
    "proposalId"            TEXT,
    "name"                  TEXT NOT NULL,
    "description"           TEXT,
    "type"                  "InvoiceType" NOT NULL,
    "amount"                DECIMAL(10,2) NOT NULL,
    "status"                "InvoiceStatus" NOT NULL DEFAULT 'SENT',
    "createdById"           TEXT NOT NULL,
    "cancelledById"         TEXT,
    "cancelledAt"           TIMESTAMP(3),
    "cancelReason"          TEXT,
    "paidAt"                TIMESTAMP(3),
    "stripeSessionId"       TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_stripeSessionId_key" ON "invoices"("stripeSessionId");
CREATE UNIQUE INDEX "invoices_stripePaymentIntentId_key" ON "invoices"("stripePaymentIntentId");
CREATE INDEX "invoices_projectRequestId_idx" ON "invoices"("projectRequestId");
CREATE INDEX "invoices_proposalId_idx" ON "invoices"("proposalId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_paidAt_idx" ON "invoices"("paidAt");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectRequestId_fkey"
    FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
