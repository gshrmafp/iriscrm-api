-- HRMS: new HR_ADMIN role. Kept in its own migration because Postgres does not
-- allow a newly added enum value to be used inside the same transaction, and
-- the next migration inserts RolePermission rows for it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR_ADMIN';
