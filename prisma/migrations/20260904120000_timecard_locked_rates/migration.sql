-- AlterTable
-- Rate snapshot frozen when a timecard is approved. Changing the firm billing
-- rate or an employee's pay/tax setup afterwards must not restate money on
-- already-approved cards; only cards approved after the change use new rates.
ALTER TABLE "timecards" ADD COLUMN     "lockedBillingRate" DECIMAL(10,2),
ADD COLUMN     "lockedHourlyRate" DECIMAL(10,2),
ADD COLUMN     "lockedTaxPercentage" DECIMAL(5,2);

-- Backfill: freeze the rates the already-approved cards are being valued at
-- today, so switching the readers over to the locked columns changes no number.
-- Tax mirrors the service rule: the sum of the employee's tax rows when it has
-- any, else the flat taxPercentage on the profile.
UPDATE "timecards" tc
SET "lockedHourlyRate" = ep."hourlyRate",
    "lockedTaxPercentage" = COALESCE(
      (SELECT SUM(et."percentage")
         FROM "employee_taxes" et
        WHERE et."employeeProfileId" = ep."id"),
      ep."taxPercentage"
    )
FROM "employee_profiles" ep
WHERE ep."userId" = tc."userId"
  AND tc."status" = 'APPROVED';

UPDATE "timecards"
SET "lockedBillingRate" = (
      SELECT NULLIF(ss."value", '')::numeric
        FROM "site_settings" ss
       WHERE ss."key" = 'BILLING_RATE'
    )
WHERE "status" = 'APPROVED';
