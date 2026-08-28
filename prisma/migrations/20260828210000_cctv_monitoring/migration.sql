-- ===================== CCTV Monitoring =====================
CREATE TYPE "CctvDeviceStatus" AS ENUM ('ONLINE','OFFLINE','AUTH_ERROR','NETWORK_ERROR','TIMEOUT','UNKNOWN');
CREATE TYPE "CctvCameraStatus" AS ENUM ('ONLINE','OFFLINE','VIDEO_LOSS','NO_RECORDING','STREAM_ERROR','AUTH_ERROR','NETWORK_ERROR','DEGRADED','UNKNOWN');
CREATE TYPE "CctvRecordingStatus" AS ENUM ('RECORDING','NOT_RECORDING','NO_RECORDING_FOUND','UNKNOWN');
CREATE TYPE "CctvStorageStatus" AS ENUM ('NORMAL','WARNING','CRITICAL','FAILED','UNKNOWN');
CREATE TYPE "CctvIncidentType" AS ENUM ('RECORDER_OFFLINE','CAMERA_OFFLINE','VIDEO_LOSS','NO_RECORDING','RECORDING_GAP','HDD_ERROR','HDD_FULL','LOW_RETENTION','AUTH_FAILURE','MONITORING_FAILURE');
CREATE TYPE "CctvIncidentStatus" AS ENUM ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED');
CREATE TYPE "CctvSeverity" AS ENUM ('INFO','WARNING','CRITICAL');

CREATE TABLE "cctv_recorders" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "serial" TEXT NOT NULL,
  "project" TEXT,
  "site" TEXT,
  "building" TEXT,
  "floor" TEXT,
  "area" TEXT,
  "localIp" TEXT,
  "deviceType" TEXT,
  "model" TEXT,
  "firmware" TEXT,
  "tcpPort" INTEGER NOT NULL DEFAULT 37777,
  "httpPort" INTEGER,
  "httpsPort" INTEGER,
  "rtspPort" INTEGER,
  "protocol" TEXT,
  "username" TEXT,
  "credentialEnc" TEXT,
  "credentialIv" TEXT,
  "credentialTag" TEXT,
  "credentialDekEnc" TEXT,
  "credentialKeyVer" TEXT,
  "channelCount" INTEGER,
  "capabilities" JSONB,
  "status" "CctvDeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
  "lastSeenAt" TIMESTAMP(3),
  "lastOnlineAt" TIMESTAMP(3),
  "offlineSince" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "assetId" UUID,
  "locationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "cctv_recorders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cctv_recorders_organizationId_serial_key" ON "cctv_recorders"("organizationId","serial");
CREATE INDEX "cctv_recorders_organizationId_status_idx" ON "cctv_recorders"("organizationId","status");
CREATE INDEX "cctv_recorders_organizationId_project_idx" ON "cctv_recorders"("organizationId","project");
ALTER TABLE "cctv_recorders" ADD CONSTRAINT "cctv_recorders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cctv_recorders" ADD CONSTRAINT "cctv_recorders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cctv_recorders" ADD CONSTRAINT "cctv_recorders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cctv_cameras" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recorderId" UUID NOT NULL,
  "channel" INTEGER NOT NULL,
  "name" TEXT,
  "cameraIp" TEXT,
  "model" TEXT,
  "serial" TEXT,
  "status" "CctvCameraStatus" NOT NULL DEFAULT 'UNKNOWN',
  "streamStatus" TEXT,
  "recordingStatus" "CctvRecordingStatus" NOT NULL DEFAULT 'UNKNOWN',
  "latestRecordingAt" TIMESTAMP(3),
  "earliestRecordingAt" TIMESTAMP(3),
  "recordingGapSeconds" INTEGER,
  "retentionDays" DOUBLE PRECISION,
  "retentionEstimated" BOOLEAN NOT NULL DEFAULT false,
  "lastSnapshotAt" TIMESTAMP(3),
  "lastSnapshotPath" TEXT,
  "lastSnapshotW" INTEGER,
  "lastSnapshotH" INTEGER,
  "lastOnlineAt" TIMESTAMP(3),
  "offlineSince" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "cctv_cameras_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cctv_cameras_recorderId_channel_key" ON "cctv_cameras"("recorderId","channel");
CREATE INDEX "cctv_cameras_organizationId_status_idx" ON "cctv_cameras"("organizationId","status");
ALTER TABLE "cctv_cameras" ADD CONSTRAINT "cctv_cameras_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cctv_cameras" ADD CONSTRAINT "cctv_cameras_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "cctv_recorders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cctv_health_logs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recorderId" UUID NOT NULL,
  "cameraId" UUID,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deviceStatus" "CctvDeviceStatus",
  "cameraStatus" "CctvCameraStatus",
  "streamStatus" TEXT,
  "recordingStatus" "CctvRecordingStatus",
  "latestRecordingAt" TIMESTAMP(3),
  "recordingGapSeconds" INTEGER,
  "snapshotStatus" TEXT,
  "snapshotPath" TEXT,
  "latencyMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "cctv_health_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cctv_health_logs_organizationId_checkedAt_idx" ON "cctv_health_logs"("organizationId","checkedAt");
CREATE INDEX "cctv_health_logs_recorderId_checkedAt_idx" ON "cctv_health_logs"("recorderId","checkedAt");
CREATE INDEX "cctv_health_logs_cameraId_checkedAt_idx" ON "cctv_health_logs"("cameraId","checkedAt");
ALTER TABLE "cctv_health_logs" ADD CONSTRAINT "cctv_health_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cctv_health_logs" ADD CONSTRAINT "cctv_health_logs_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "cctv_recorders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cctv_health_logs" ADD CONSTRAINT "cctv_health_logs_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cctv_cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cctv_storage_logs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recorderId" UUID NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hddIndex" INTEGER NOT NULL,
  "hddModel" TEXT,
  "status" "CctvStorageStatus" NOT NULL DEFAULT 'UNKNOWN',
  "capacityBytes" BIGINT,
  "usedBytes" BIGINT,
  "freeBytes" BIGINT,
  "temperatureC" INTEGER,
  "smartStatus" TEXT,
  CONSTRAINT "cctv_storage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cctv_storage_logs_organizationId_checkedAt_idx" ON "cctv_storage_logs"("organizationId","checkedAt");
CREATE INDEX "cctv_storage_logs_recorderId_checkedAt_idx" ON "cctv_storage_logs"("recorderId","checkedAt");
ALTER TABLE "cctv_storage_logs" ADD CONSTRAINT "cctv_storage_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cctv_storage_logs" ADD CONSTRAINT "cctv_storage_logs_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "cctv_recorders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cctv_incidents" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recorderId" UUID,
  "cameraId" UUID,
  "type" "CctvIncidentType" NOT NULL,
  "severity" "CctvSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "CctvIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "downtimeMinutes" INTEGER,
  "rootCause" TEXT,
  "resolution" TEXT,
  "responsiblePerson" TEXT,
  "ticketNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cctv_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cctv_incidents_organizationId_status_idx" ON "cctv_incidents"("organizationId","status");
CREATE INDEX "cctv_incidents_organizationId_type_idx" ON "cctv_incidents"("organizationId","type");
ALTER TABLE "cctv_incidents" ADD CONSTRAINT "cctv_incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cctv_incidents" ADD CONSTRAINT "cctv_incidents_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "cctv_recorders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cctv_incidents" ADD CONSTRAINT "cctv_incidents_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cctv_cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================== CCTV permissions =====================
INSERT INTO "permissions" ("id","key") VALUES
  (gen_random_uuid(),'cctv:view'),
  (gen_random_uuid(),'cctv:manage')
ON CONFLICT ("key") DO NOTHING;

-- Full manage for admin/manager roles.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('cctv:view','cctv:manage')
WHERE r."key" IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

-- View-only for oversight roles.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'cctv:view'
WHERE r."key" IN ('SECURITY_ADMIN','MANAGER','AUDITOR','VIEWER')
ON CONFLICT DO NOTHING;
