-- Profile fields maintained from Profile Settings. These prefill the Client
-- Information step when a client starts a new project from the portal.
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "middleInitial" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "projectUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stateRegion" TEXT,
ADD COLUMN     "streetAddress" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- Seed the name parts from the existing single `name` column so profiles are
-- not blank on first load. Everything after the first token becomes the surname.
UPDATE "users"
SET "firstName" = split_part("name", ' ', 1),
    "lastName"  = NULLIF(substring("name" FROM position(' ' IN "name") + 1), "name")
WHERE "name" IS NOT NULL AND "name" <> '';
