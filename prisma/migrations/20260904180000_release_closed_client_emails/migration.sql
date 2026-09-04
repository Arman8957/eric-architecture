-- Data repair: client accounts that were closed but never finished closing.
--
-- Older builds fell back to merely deactivating a client when a foreign key
-- blocked the delete, leaving the row holding its real email address and still
-- attached to its projects. The address stayed taken, so the same person could
-- not sign up again — the app insisted the account already existed — and a PM
-- raising a new inquiry for that address would silently link it to the dead
-- account.
--
-- Finish the job the way the current code does: detach the projects and
-- contracts (they stay on the books in full — every financial report is built
-- from those rows, and each already stores the client's name, email and
-- address in its own columns) and anonymise the account so it cannot be signed
-- into and no longer holds the address.
--
-- Nothing is deleted here. Only client (USER) rows already marked inactive are
-- touched; a suspended staff account keeps its identity.

-- 1. Hand the projects and contracts back, exactly as a proper close does.
UPDATE "project_requests"
SET "userId" = NULL
WHERE "userId" IN (
  SELECT id FROM "users"
   WHERE role = 'USER'
     AND "isActive" = false
     AND email NOT LIKE 'deleted-%'
);

UPDATE "proposals"
SET "userId" = NULL
WHERE "userId" IN (
  SELECT id FROM "users"
   WHERE role = 'USER'
     AND "isActive" = false
     AND email NOT LIKE 'deleted-%'
);

-- 2. Release the email address and strip the credentials, so the account can
--    never be logged into and the person is free to register as new.
UPDATE "users"
SET email                = 'deleted-' || id || '@deleted.invalid',
    name                 = 'Deleted Client',
    "firstName"          = NULL,
    "lastName"           = NULL,
    "middleInitial"      = NULL,
    "phoneNumber"        = NULL,
    "companyName"        = NULL,
    bio                  = NULL,
    avatar               = NULL,
    "googleId"           = NULL,
    "streetAddress"      = NULL,
    "aptSuiteUnit"       = NULL,
    city                 = NULL,
    "stateRegion"        = NULL,
    "zipCode"            = NULL,
    country              = NULL,
    password             = NULL,
    "refreshToken"       = NULL,
    "emailVerifyToken"   = NULL,
    "passwordResetToken" = NULL
WHERE role = 'USER'
  AND "isActive" = false
  AND email NOT LIKE 'deleted-%';
