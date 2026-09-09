-- Where a new staff member's hiring paperwork lives.
--
-- A shared-folder link — Drive, Dropbox, Mega — that the welcome email points
-- the new starter at: they download the blank federal tax forms, sign them, and
-- upload the signed copies back into the same folder.
--
-- Nullable, and set separately from creating the account. The folder often does
-- not exist yet when the account is made, so this can be filled in afterwards
-- without holding up onboarding.

ALTER TABLE "users" ADD COLUMN "hiringDocumentsUrl" TEXT;
