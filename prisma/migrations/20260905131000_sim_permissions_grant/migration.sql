-- Seed the new sim:* permissions and grant them to existing roles.
INSERT INTO "permissions" ("id","key","description")
SELECT gen_random_uuid(), k, k
FROM (VALUES ('sim:read'),('sim:manage')) AS v(k)
ON CONFLICT (key) DO NOTHING;

-- sim:read -> everyone who already has asset:read; sim:manage -> IT roles + admins.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key='sim:read'
WHERE EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" pa ON pa.id=rp."permissionId"
             WHERE rp."roleId"=r.id AND pa.key='asset:read')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key='sim:manage'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;
