-- IT Support probation form: per-round decision + improvement fields, and the
-- evaluation:assign permission (create/issue a review — IT Manager only).
-- Fully additive & idempotent.

ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "improvementNote" TEXT;
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "probationResult" TEXT;
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "probationEffectiveFrom" TIMESTAMP(3);
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "decisionNote" TEXT;

-- evaluation:assign — the right to CREATE/ISSUE a probation review. Restricted
-- to the IT Manager (and the admin roles). HR keeps read/manage only.
INSERT INTO "permissions" (id, key, description) VALUES
  (gen_random_uuid(), 'evaluation:assign', 'Create / issue a probation KPI evaluation (IT Manager)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON p.key = 'evaluation:assign'
WHERE r.key IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;
