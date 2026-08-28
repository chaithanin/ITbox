-- Grant the new module permissions to existing roles across all orgs so the
-- Network/Change/Backup/Contract modules are visible without re-seeding.
-- Idempotent: safe to run against a DB that already has some of these.

-- 1) Ensure the permission keys exist in the catalog.
INSERT INTO "permissions" ("id","key") VALUES
  (gen_random_uuid(),'network:read'),
  (gen_random_uuid(),'network:manage'),
  (gen_random_uuid(),'change:read'),
  (gen_random_uuid(),'change:manage'),
  (gen_random_uuid(),'change:approve'),
  (gen_random_uuid(),'backup:read'),
  (gen_random_uuid(),'backup:manage'),
  (gen_random_uuid(),'contract:read'),
  (gen_random_uuid(),'contract:manage')
ON CONFLICT ("key") DO NOTHING;

-- 2) Full access for admin/manager roles.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN
  ('network:read','network:manage','change:read','change:manage','change:approve',
   'backup:read','backup:manage','contract:read','contract:manage')
WHERE r."key" IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;

-- 3) IT_STAFF: manage network/backup, create changes, read contracts (no approve/contract:manage).
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN
  ('network:read','network:manage','change:read','change:manage',
   'backup:read','backup:manage','contract:read')
WHERE r."key" = 'IT_STAFF'
ON CONFLICT DO NOTHING;

-- 4) Read-only-based roles get the read permissions.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN
  ('network:read','change:read','backup:read','contract:read')
WHERE r."key" IN ('VIEWER','AUDITOR','FINANCE','MANAGER')
ON CONFLICT DO NOTHING;
