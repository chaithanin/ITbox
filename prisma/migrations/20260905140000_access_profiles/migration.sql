-- RBAC access-request profiles + persisted access requests
CREATE TYPE "JobLevel" AS ENUM ('L0','L1','L2','L3','L4','L5','L6','IT_ADMIN');
CREATE TYPE "PermissionDefaultStatus" AS ENUM ('REQUIRED','OPTIONAL','RESTRICTED','NOT_ALLOWED');
CREATE TYPE "PermissionSource" AS ENUM ('DEFAULT','ADDITIONAL','RESTRICTED');
CREATE TYPE "AccessRequestStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','PROVISIONED','REVOKED');
CREATE TYPE "ProvisionStatus" AS ENUM ('PENDING','ACCOUNT_CREATED','ACCESS_GRANTED','FAILED','REVOKED');

CREATE TABLE "permission_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "department" TEXT,
  "position" TEXT,
  "jobLevel" "JobLevel",
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "requiresManagerApproval" BOOLEAN NOT NULL DEFAULT true,
  "requiresSystemOwnerApproval" BOOLEAN NOT NULL DEFAULT false,
  "requiresItManagerApproval" BOOLEAN NOT NULL DEFAULT false,
  "requiresManagementApproval" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "permission_profiles_org_dept_pos_level_idx" ON "permission_profiles"("organizationId","department","position","jobLevel");
ALTER TABLE "permission_profiles" ADD CONSTRAINT "permission_profiles_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "permission_profile_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profileId" UUID NOT NULL,
  "system" TEXT NOT NULL,
  "resource" TEXT,
  "permissionLevel" TEXT NOT NULL,
  "defaultStatus" "PermissionDefaultStatus" NOT NULL DEFAULT 'OPTIONAL',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "permission_profile_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "permission_profile_items_profileId_idx" ON "permission_profile_items"("profileId");
ALTER TABLE "permission_profile_items" ADD CONSTRAINT "ppi_profile_fkey" FOREIGN KEY ("profileId") REFERENCES "permission_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "access_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "refNo" TEXT,
  "employeeId" UUID,
  "employeeCode" TEXT,
  "nameTh" TEXT,
  "nameEn" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "company" TEXT,
  "department" TEXT,
  "position" TEXT,
  "jobLevel" "JobLevel",
  "effectiveDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "businessJustification" TEXT,
  "approvalChain" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "access_requests_org_status_idx" ON "access_requests"("organizationId","status");
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_emp_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "access_request_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accessRequestId" UUID NOT NULL,
  "system" TEXT NOT NULL,
  "resource" TEXT,
  "permissionLevel" TEXT NOT NULL,
  "source" "PermissionSource" NOT NULL DEFAULT 'DEFAULT',
  "businessJustification" TEXT,
  "provisionStatus" "ProvisionStatus" NOT NULL DEFAULT 'PENDING',
  "provisionedById" UUID,
  "provisionedAt" TIMESTAMP(3),
  CONSTRAINT "access_request_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "access_request_items_reqId_idx" ON "access_request_items"("accessRequestId");
ALTER TABLE "access_request_items" ADD CONSTRAINT "ari_req_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
