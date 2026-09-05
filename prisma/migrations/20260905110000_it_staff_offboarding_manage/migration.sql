-- Let IT Support (IT_STAFF) offboard employees, not only onboard them.
-- Grants offboarding:manage to every organization's IT_STAFF role.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.key = 'offboarding:manage'
WHERE r.key = 'IT_STAFF'
ON CONFLICT DO NOTHING;
