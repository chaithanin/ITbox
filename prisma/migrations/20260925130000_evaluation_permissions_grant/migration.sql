-- Backfill the evaluation permission catalog + role grants for EXISTING orgs.
-- (New orgs get these from the seed.) Runtime permissions are DB-derived, so
-- without this even SUPER_ADMIN lacks evaluation:read and /evaluations 500s.

-- 1) Global permission catalog rows
INSERT INTO "permissions" (id, key, description) VALUES
  (gen_random_uuid(), 'evaluation:read',   'View probation 30/60/90 KPI evaluations'),
  (gen_random_uuid(), 'evaluation:manage', 'Create / score probation KPI evaluations')
ON CONFLICT (key) DO NOTHING;

-- 2) Role grants (mirrors ROLE_PERMISSIONS in src/lib/permissions.ts).
--    SUPER_ADMIN + ADMIN get ALL permissions elsewhere; here we grant the
--    review roles explicitly.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'evaluation:read'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','HR','AUDITOR')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'evaluation:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','HR')
ON CONFLICT DO NOTHING;
