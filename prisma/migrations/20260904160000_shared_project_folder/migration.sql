-- Shared project folder: one card, two sides.
--
-- Project links used to live in two unrelated places — a free-for-all
-- attachment list, and one Drive URL per phase. They collapse into a single
-- shared folder with an Architect half and a Client half, where each side owns
-- what it added.

-- 1. Which side a link belongs to.
CREATE TYPE "AttachmentSide" AS ENUM ('ARCHITECT', 'CLIENT');

ALTER TABLE "project_attachments"
  ADD COLUMN "ownerSide" "AttachmentSide" NOT NULL DEFAULT 'ARCHITECT';

-- 2. Classify what is already there by who added it. Staff roles are the
--    architect side; a client account is the client side.
UPDATE "project_attachments" pa
SET "ownerSide" = 'CLIENT'
FROM "users" u
WHERE u.id = pa."createdById"
  AND u.role = 'USER';

CREATE INDEX "project_attachments_ownerSide_idx" ON "project_attachments"("ownerSide");

-- 3. Carry the per-phase Drive links over to the architect side before the
--    column goes. The new card is one folder for the whole project rather than
--    one per phase, so a project contributes a single link — its earliest
--    phase that has one — instead of a row per phase. Attributed to the
--    assigned manager, falling back to the founding admin when a project has
--    no manager, since the link needs an owner to be editable.
INSERT INTO "project_attachments" ("id", "projectRequestId", "title", "url", "ownerSide", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid(),
       first_link."projectRequestId",
       'Project Deliverables',
       first_link."driveLink",
       'ARCHITECT',
       COALESCE(
         pr."assignedManagerId",
         (SELECT id FROM "users" WHERE role = 'SUPER_ADMIN' ORDER BY "createdAt" ASC LIMIT 1)
       ),
       NOW(),
       NOW()
  FROM (
    SELECT DISTINCT ON (s."projectRequestId")
           s."projectRequestId",
           s."driveLink"
      FROM "project_stages" s
     WHERE s."driveLink" IS NOT NULL
       AND btrim(s."driveLink") <> ''
       AND s."projectRequestId" IS NOT NULL
     ORDER BY s."projectRequestId", s."order" ASC, s."createdAt" ASC
  ) first_link
  JOIN "project_requests" pr ON pr.id = first_link."projectRequestId"
 WHERE COALESCE(
         pr."assignedManagerId",
         (SELECT id FROM "users" WHERE role = 'SUPER_ADMIN' ORDER BY "createdAt" ASC LIMIT 1)
       ) IS NOT NULL
   -- Don't duplicate a link the project already lists.
   AND NOT EXISTS (
     SELECT 1 FROM "project_attachments" existing
      WHERE existing."projectRequestId" = first_link."projectRequestId"
        AND existing.url = first_link."driveLink"
   );

-- 4. The per-phase link is gone; progress is posted to the shared folder now.
ALTER TABLE "project_stages" DROP COLUMN "driveLink";
