-- A real username to sign in with.
--
-- The signup form has always asked for a username, but wrote it into `name` —
-- so the value existed as a display name and could never be used to log in.
-- This gives it a column of its own, and login accepts either it or the email.
--
-- Nullable: staff accounts and Google sign-ins are created without one, and
-- every existing row starts empty. Unique so two people cannot claim the same
-- handle; values are lowercased by the service before they are written, which
-- makes the lookup case-insensitive without a functional index.

ALTER TABLE "users" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
