-- ===================== Major incident + TOTP replay =====================
ALTER TABLE "support_cases" ADD COLUMN "isMajorIncident" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "support_cases" ADD COLUMN "incidentCommanderId" UUID;
ALTER TABLE "support_cases" ADD COLUMN "commsLog" TEXT;
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_incidentCommanderId_fkey" FOREIGN KEY ("incidentCommanderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD COLUMN "totpLastStep" BIGINT;

-- ===================== Onboarding =====================
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED');
CREATE TABLE "onboardings" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
  "accountCreated" BOOLEAN NOT NULL DEFAULT false,
  "emailCreated" BOOLEAN NOT NULL DEFAULT false,
  "assetAssigned" BOOLEAN NOT NULL DEFAULT false,
  "softwareAssigned" BOOLEAN NOT NULL DEFAULT false,
  "accessGranted" BOOLEAN NOT NULL DEFAULT false,
  "inductionDone" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "startedById" UUID,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboardings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "onboardings_organizationId_status_idx" ON "onboardings"("organizationId","status");
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Service catalog =====================
CREATE TABLE "service_catalog_items" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "slaHours" INTEGER,
  "fulfillmentTeam" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_catalog_items_organizationId_name_key" ON "service_catalog_items"("organizationId","name");
ALTER TABLE "service_catalog_items" ADD CONSTRAINT "service_catalog_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== EDR / endpoint posture =====================
CREATE TYPE "ProtectionStatus" AS ENUM ('PROTECTED','AT_RISK','OFFLINE','UNKNOWN');
CREATE TABLE "endpoint_posture" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "hostname" TEXT NOT NULL,
  "assetId" UUID,
  "protectionStatus" "ProtectionStatus" NOT NULL DEFAULT 'UNKNOWN',
  "agentVersion" TEXT,
  "osVersion" TEXT,
  "lastScanAt" TIMESTAMP(3),
  "threatsFound" INTEGER NOT NULL DEFAULT 0,
  "isolated" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "endpoint_posture_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "endpoint_posture_organizationId_hostname_key" ON "endpoint_posture"("organizationId","hostname");
CREATE INDEX "endpoint_posture_organizationId_protectionStatus_idx" ON "endpoint_posture"("organizationId","protectionStatus");
ALTER TABLE "endpoint_posture" ADD CONSTRAINT "endpoint_posture_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "endpoint_posture" ADD CONSTRAINT "endpoint_posture_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================== Monitoring =====================
CREATE TYPE "MonitorStatus" AS ENUM ('UP','WARNING','DOWN','UNKNOWN');
CREATE TABLE "monitoring_hosts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "hostname" TEXT NOT NULL,
  "status" "MonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
  "cpuPercent" INTEGER,
  "memPercent" INTEGER,
  "diskPercent" INTEGER,
  "uptimeSeconds" BIGINT,
  "note" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitoring_hosts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "monitoring_hosts_organizationId_hostname_key" ON "monitoring_hosts"("organizationId","hostname");
CREATE INDEX "monitoring_hosts_organizationId_status_idx" ON "monitoring_hosts"("organizationId","status");
ALTER TABLE "monitoring_hosts" ADD CONSTRAINT "monitoring_hosts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Grant permissions =====================
INSERT INTO "permissions" ("id","key") VALUES
  (gen_random_uuid(),'onboarding:read'),(gen_random_uuid(),'onboarding:manage'),
  (gen_random_uuid(),'catalog:read'),(gen_random_uuid(),'catalog:manage'),
  (gen_random_uuid(),'monitoring:read')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('onboarding:read','onboarding:manage','catalog:read','catalog:manage','monitoring:read')
WHERE r."key" IN ('SUPER_ADMIN','ADMIN','IT_MANAGER')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('onboarding:read','onboarding:manage','catalog:read','monitoring:read')
WHERE r."key" = 'IT_STAFF'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('onboarding:read','onboarding:manage','catalog:read')
WHERE r."key" = 'HR'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" = 'monitoring:read'
WHERE r."key" = 'SECURITY_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('onboarding:read','catalog:read','monitoring:read')
WHERE r."key" IN ('VIEWER','AUDITOR','FINANCE','MANAGER')
ON CONFLICT DO NOTHING;
