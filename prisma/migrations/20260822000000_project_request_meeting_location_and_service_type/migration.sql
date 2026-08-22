-- In-person appointments carry the address the client wants to meet at
ALTER TABLE "project_requests" ADD COLUMN IF NOT EXISTS "meetingLocation" TEXT;

-- "Other" selections on the request form let the client type what they meant
ALTER TABLE "project_requests" ADD COLUMN IF NOT EXISTS "serviceTypeOther" TEXT;
ALTER TABLE "project_requests" ADD COLUMN IF NOT EXISTS "projectCategoryOther" TEXT;
