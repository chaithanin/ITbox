-- Backfill the borrow:* permission catalog + role grants for EXISTING orgs.
-- (New orgs get these from the seed, which already includes borrow:* in
-- ROLE_PERMISSIONS.) Without this, no role holds borrow:read, so the
-- "ยืม-คืนทรัพย์สิน / Borrow & Return" nav item never renders.

-- 1) Global permission catalog rows
INSERT INTO "permissions" (id, key, description) VALUES
  (gen_random_uuid(), 'borrow:read',    'View borrow requests'),
  (gen_random_uuid(), 'borrow:create',  'Create borrow requests'),
  (gen_random_uuid(), 'borrow:approve', 'Approve or reject borrow requests'),
  (gen_random_uuid(), 'borrow:issue',   'Issue / hand over borrowed assets'),
  (gen_random_uuid(), 'borrow:return',  'Process asset returns and inspection'),
  (gen_random_uuid(), 'borrow:manage',  'Manage borrowing settings / overrides'),
  (gen_random_uuid(), 'borrow:export',  'Export borrowing reports')
ON CONFLICT (key) DO NOTHING;

-- 2) Role grants (mirrors ROLE_PERMISSIONS in src/lib/permissions.ts), across
--    every organization's system roles. ADMIN/SUPER_ADMIN get all borrow perms.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:read'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF','HR','MANAGER','EMPLOYEE','FINANCE','AUDITOR','VIEWER')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:create'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF','MANAGER','EMPLOYEE')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:approve'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF','MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:issue'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:return'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:export'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;
