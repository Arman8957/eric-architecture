-- Tenant Improvement became its own service type; it used to share the ADDITION value
-- on the request form. Kept in its own migration because ALTER TYPE ... ADD VALUE
-- cannot be used by other statements in the same transaction.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'TENANT_IMPROVEMENT';
