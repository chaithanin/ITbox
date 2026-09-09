-- Backfill the access-request / permission-profile permission catalog + role
-- grants for EXISTING orgs. (New orgs get these from the seed, which already
-- includes them in ROLE_PERMISSIONS.) Without this, no DB role holds
-- accessreq:read, so requirePermission("accessreq:read") throws on
-- /access-requests/[id] (and the Access Review report / employee Access panel
-- never render) even for SUPER_ADMIN — runtime permissions are DB-derived.

-- 1) Global permission catalog rows
INSERT INTO "permissions" (id, key, description) VALUES
  (gen_random_uuid(), 'accessreq:read',     'View access requests'),
  (gen_random_uuid(), 'accessreq:manage',   'Manage / provision access requests'),
  (gen_random_uuid(), 'permprofile:manage', 'Manage default permission profiles')
ON CONFLICT (key) DO NOTHING;

-- 2) Role grants (mirrors ROLE_PERMISSIONS in src/lib/permissions.ts).
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'accessreq:read'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'accessreq:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'permprofile:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;
