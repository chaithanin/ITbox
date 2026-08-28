-- ===================== Network & IPAM =====================
CREATE TYPE "NetworkDeviceType" AS ENUM ('ROUTER','SWITCH','FIREWALL','ACCESS_POINT','LOAD_BALANCER','CONTROLLER','GATEWAY','OTHER');
CREATE TYPE "NetworkDeviceStatus" AS ENUM ('ONLINE','OFFLINE','MAINTENANCE','UNKNOWN');
CREATE TYPE "IpStatus" AS ENUM ('AVAILABLE','ASSIGNED','RESERVED');

CREATE TABLE "network_devices" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "deviceType" "NetworkDeviceType" NOT NULL DEFAULT 'SWITCH',
  "hostname" TEXT,
  "mgmtIp" TEXT,
  "macAddress" TEXT,
  "vendorId" UUID,
  "model" TEXT,
  "firmware" TEXT,
  "locationId" UUID,
  "status" "NetworkDeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
  "owner" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "network_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "network_devices_organizationId_name_key" ON "network_devices"("organizationId","name");
CREATE INDEX "network_devices_organizationId_status_idx" ON "network_devices"("organizationId","status");
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "vlans" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "vlanId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "purpose" TEXT,
  "locationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vlans_organizationId_vlanId_key" ON "vlans"("organizationId","vlanId");
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subnets" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "cidr" TEXT NOT NULL,
  "gateway" TEXT,
  "dns" TEXT,
  "vlanRef" UUID,
  "purpose" TEXT,
  "locationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "subnets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subnets_organizationId_cidr_key" ON "subnets"("organizationId","cidr");
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_vlanRef_fkey" FOREIGN KEY ("vlanRef") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ip_addresses" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "address" TEXT NOT NULL,
  "status" "IpStatus" NOT NULL DEFAULT 'ASSIGNED',
  "subnetId" UUID,
  "hostname" TEXT,
  "macAddress" TEXT,
  "assignedTo" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ip_addresses_organizationId_address_key" ON "ip_addresses"("organizationId","address");
CREATE INDEX "ip_addresses_organizationId_status_idx" ON "ip_addresses"("organizationId","status");
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "subnets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================== Change Management =====================
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','SCHEDULED','IMPLEMENTED','FAILED','ROLLED_BACK','CLOSED');
CREATE TYPE "ChangeRisk" AS ENUM ('LOW','MEDIUM','HIGH');

CREATE TABLE "change_requests" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "changeNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "risk" "ChangeRisk" NOT NULL DEFAULT 'LOW',
  "impact" TEXT,
  "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
  "rollbackPlan" TEXT,
  "testPlan" TEXT,
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "requestedById" UUID,
  "approvedById" UUID,
  "approvedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "implementedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "change_requests_organizationId_changeNumber_key" ON "change_requests"("organizationId","changeNumber");
CREATE INDEX "change_requests_organizationId_status_idx" ON "change_requests"("organizationId","status");
CREATE INDEX "change_requests_organizationId_scheduledStart_idx" ON "change_requests"("organizationId","scheduledStart");
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Backup & DR =====================
CREATE TYPE "BackupType" AS ENUM ('FULL','INCREMENTAL','DIFFERENTIAL','SNAPSHOT');
CREATE TYPE "BackupStatus" AS ENUM ('OK','WARNING','FAILED','NOT_RUN');

CREATE TABLE "backup_jobs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "system" TEXT NOT NULL,
  "backupType" "BackupType" NOT NULL DEFAULT 'FULL',
  "schedule" TEXT,
  "storageTarget" TEXT,
  "retentionDays" INTEGER,
  "owner" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "lastStatus" "BackupStatus" NOT NULL DEFAULT 'NOT_RUN',
  "rpoHours" INTEGER,
  "rtoHours" INTEGER,
  "lastRestoreTestAt" TIMESTAMP(3),
  "restoreResult" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "backup_jobs_organizationId_system_key" ON "backup_jobs"("organizationId","system");
CREATE INDEX "backup_jobs_organizationId_lastStatus_idx" ON "backup_jobs"("organizationId","lastStatus");
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Contracts =====================
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE','EXPIRING','EXPIRED','TERMINATED');

CREATE TABLE "contracts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "vendorId" UUID,
  "service" TEXT,
  "startDate" DATE,
  "endDate" DATE,
  "renewalDate" DATE,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "cost" DECIMAL(14,2),
  "slaTerms" TEXT,
  "owner" TEXT,
  "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contracts_organizationId_contractNumber_key" ON "contracts"("organizationId","contractNumber");
CREATE INDEX "contracts_organizationId_status_idx" ON "contracts"("organizationId","status");
CREATE INDEX "contracts_organizationId_renewalDate_idx" ON "contracts"("organizationId","renewalDate");
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
