-- ===================== Impact x Urgency (D-21) =====================
CREATE TYPE "CaseUrgency" AS ENUM ('HIGH','MEDIUM','LOW');
ALTER TABLE "support_cases" ADD COLUMN "urgency" "CaseUrgency";

-- ===================== CMDB =====================
CREATE TYPE "CiType" AS ENUM ('APPLICATION','SERVICE','SERVER','DATABASE','NETWORK','STORAGE','OTHER');
CREATE TYPE "CiStatus" AS ENUM ('ACTIVE','DEGRADED','OFFLINE','RETIRED');
CREATE TYPE "CiRelationType" AS ENUM ('DEPENDS_ON','RUNS_ON','CONNECTS_TO','HOSTS','USES');

CREATE TABLE "configuration_items" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "ciType" "CiType" NOT NULL DEFAULT 'SERVICE',
  "status" "CiStatus" NOT NULL DEFAULT 'ACTIVE',
  "description" TEXT,
  "owner" TEXT,
  "assetId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "configuration_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "configuration_items_organizationId_name_key" ON "configuration_items"("organizationId","name");
CREATE INDEX "configuration_items_organizationId_ciType_idx" ON "configuration_items"("organizationId","ciType");
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ci_relationships" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "relType" "CiRelationType" NOT NULL DEFAULT 'DEPENDS_ON',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ci_relationships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ci_relationships_organizationId_sourceId_targetId_relType_key" ON "ci_relationships"("organizationId","sourceId","targetId","relType");
CREATE INDEX "ci_relationships_organizationId_sourceId_idx" ON "ci_relationships"("organizationId","sourceId");
CREATE INDEX "ci_relationships_organizationId_targetId_idx" ON "ci_relationships"("organizationId","targetId");
ALTER TABLE "ci_relationships" ADD CONSTRAINT "ci_relationships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ci_relationships" ADD CONSTRAINT "ci_relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ci_relationships" ADD CONSTRAINT "ci_relationships_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================== Grant CMDB permissions =====================
INSERT INTO "permissions" ("id","key") VALUES
  (gen_random_uuid(),'cmdb:read'),(gen_random_uuid(),'cmdb:manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('cmdb:read','cmdb:manage')
WHERE r."key" IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" = 'cmdb:read'
WHERE r."key" IN ('VIEWER','AUDITOR','FINANCE','MANAGER')
ON CONFLICT DO NOTHING;
