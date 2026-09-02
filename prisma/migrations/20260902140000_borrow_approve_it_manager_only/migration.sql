-- Restrict borrow approval to IT Manager and (Assistant) Manager only.
-- Previously IT_STAFF also held borrow:approve; borrow requests should now be
-- approved solely by IT_MANAGER / MANAGER (plus ADMIN / SUPER_ADMIN as system
-- administrators). This mirrors ROLE_PERMISSIONS in src/lib/permissions.ts and
-- STEP_ROLES.IT in src/lib/borrow/service.ts.

-- 1) Revoke borrow:approve from every organization's IT_STAFF role.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.key = 'IT_STAFF'
  AND p.key = 'borrow:approve';

-- 2) Ensure MANAGER (used as "Assistant Manager") holds borrow:approve.
--    (Already granted by the earlier backfill for most orgs; idempotent here.)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'borrow:approve'
WHERE r.key = 'MANAGER'
ON CONFLICT DO NOTHING;
