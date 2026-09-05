INSERT INTO "permissions" ("id","key","description")
SELECT gen_random_uuid(), k, k FROM (VALUES ('permprofile:manage'),('accessreq:read'),('accessreq:manage')) AS v(k)
ON CONFLICT (key) DO NOTHING;

-- admin config -> admins + IT Manager
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key='permprofile:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER') ON CONFLICT DO NOTHING;

-- read/provision access requests -> admins + IT Manager/Staff
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key IN ('accessreq:read','accessreq:manage')
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF') ON CONFLICT DO NOTHING;
