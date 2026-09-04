-- Data repair: projects that finished but never recorded when.
--
-- `maybeAutoCompleteProject` used to return early whenever the project was
-- already in COMPLETED status, so a project moved to COMPLETED by hand before
-- its final phase was ticked off never had `projectCompletedAt` stamped. The
-- timer on the Project Management tab reads that column, so those projects sat
-- at "END In progress" forever and the year-end contract split had no date to
-- settle on. The service no longer has that hole; this repairs the rows it
-- already left behind.
--
-- A project qualifies when it is COMPLETED, has no end date, and every phase
-- across every accepted contract (amendments included) is done. The date used
-- is when the last phase actually finished, falling back to the row's own last
-- update for phases completed before `completedAt` was being recorded.
UPDATE "project_requests" pr
SET "projectCompletedAt" = COALESCE(finished."lastPhaseAt", pr."updatedAt"),
    "totalDurationMonths" = CASE
      WHEN pr."projectStartedAt" IS NULL THEN NULL
      ELSE EXTRACT(
        EPOCH FROM (COALESCE(finished."lastPhaseAt", pr."updatedAt") - pr."projectStartedAt")
      ) / (60 * 60 * 24 * 30.44)
    END
FROM (
  SELECT p."projectRequestId"          AS project_id,
         MAX(s."completedAt")          AS "lastPhaseAt",
         COUNT(s.id)                   AS phase_count,
         COUNT(*) FILTER (WHERE s.status <> 'COMPLETED') AS unfinished_count
    FROM "proposals" p
    JOIN "project_stages" s ON s."proposalId" = p.id
   WHERE p.status = 'ACCEPTED'
     AND p."projectRequestId" IS NOT NULL
   GROUP BY p."projectRequestId"
) finished
WHERE pr.id = finished.project_id
  AND pr.status = 'COMPLETED'
  AND pr."projectCompletedAt" IS NULL
  AND pr."deletedAt" IS NULL
  AND finished.phase_count > 0
  AND finished.unfinished_count = 0;
