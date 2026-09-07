-- Per-employee dashboard tab access.
--
-- Only read for role = EMPLOYEE; every other role's sections come from the
-- role itself. Defaults to an empty array so an employee created before this
-- column existed sees nothing until sections are ticked for them, rather than
-- silently inheriting a full dashboard.
ALTER TABLE "users"
  ADD COLUMN "dashboardSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
