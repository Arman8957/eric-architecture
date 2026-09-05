-- Rebuild timecard hour totals from the entries they summarise.
--
-- `billableHours`, `nonBillableHours`, `totalHours` and `totalCost` are a cache
-- of the timecard's own entry rows. An earlier version of updateTimecard wrote
-- `totalHours` as the overhead sum alone and left `nonBillableHours` at 0, so a
-- handful of cards ended up with a total smaller than their billable hours.
--
-- The payroll table derived overhead as `totalHours - billableHours`, which
-- turned negative on those rows (-37.0h), and utilisation as
-- `billableHours / totalHours`, which read 331%. Gross pay is
-- `totalHours x hourlyRate`, so those cards also understated what the employee
-- was owed.
--
-- Approved cards can no longer be edited, so they could never correct
-- themselves. This rewrites the cache from the entries — the entries themselves
-- were always right and are not touched.

WITH sums AS (
  SELECT t.id,
         COALESCE(b.hours, 0) AS billable,
         COALESCE(e.hours, 0) AS non_billable,
         COALESCE(t."lockedHourlyRate", ep."hourlyRate", 0) AS rate
    FROM "timecards" t
    LEFT JOIN (
      SELECT "timecardId", SUM("totalHours") AS hours
        FROM "timecard_billable_entries"
       GROUP BY "timecardId"
    ) b ON b."timecardId" = t.id
    LEFT JOIN (
      SELECT "timecardId", SUM("totalHours") AS hours
        FROM "timecard_entries"
       GROUP BY "timecardId"
    ) e ON e."timecardId" = t.id
    LEFT JOIN "employee_profiles" ep ON ep."userId" = t."userId"
)
UPDATE "timecards" t
   SET "billableHours"    = sums.billable,
       "nonBillableHours" = sums.non_billable,
       "totalHours"       = sums.billable + sums.non_billable,
       "totalCost"        = (sums.billable + sums.non_billable) * sums.rate
  FROM sums
 WHERE sums.id = t.id
   -- Only rows whose cache actually disagrees with their entries, so the
   -- correct majority keep their existing values and timestamps.
   AND (
        t."billableHours"    IS DISTINCT FROM sums.billable
     OR t."nonBillableHours" IS DISTINCT FROM sums.non_billable
     OR t."totalHours"       IS DISTINCT FROM sums.billable + sums.non_billable
   );
