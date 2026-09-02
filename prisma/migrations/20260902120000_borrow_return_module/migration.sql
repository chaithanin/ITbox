-- IT Asset Borrowing & Return Management module.
-- Adds temporary-loan lifecycle tables (request → approval → issue → return)
-- plus digital-signature-ready records. Reuses assets/employees/departments.

-- Extend AssetStatus with loan-specific states (append-only; safe in PG12+ as
-- these new values are not referenced within this migration).
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'BORROWED';

-- New enum types
CREATE TYPE "BorrowRequestStatus" AS ENUM ('DRAFT', 'PENDING_MANAGER', 'PENDING_IT', 'PENDING_MANAGEMENT', 'APPROVED', 'REJECTED', 'READY_TO_ISSUE', 'ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED', 'CANCELLED');
CREATE TYPE "BorrowApprovalStep" AS ENUM ('MANAGER', 'IT', 'MANAGEMENT');
CREATE TYPE "BorrowApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
CREATE TYPE "BorrowItemStatus" AS ENUM ('PENDING', 'ISSUED', 'RETURNED', 'DAMAGED', 'LOST');
CREATE TYPE "LoanCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'OTHER');
CREATE TYPE "InspectionResult" AS ENUM ('COMPLETE', 'DAMAGED', 'MISSING_ACCESSORY', 'REPAIR_REQUIRED', 'LOST');
CREATE TYPE "SignatureType" AS ENUM ('NONE', 'DRAWN', 'TYPED', 'UPLOADED');
CREATE TYPE "SignatureRole" AS ENUM ('REQUESTER', 'DEPT_MANAGER', 'IT_RECEIVER', 'IT_HANDOVER', 'IT_MANAGER', 'MANAGEMENT', 'RETURNER', 'RETURN_RECEIVER');
CREATE TYPE "ConditionPhotoPhase" AS ENUM ('BEFORE', 'AFTER');

-- borrow_requests
CREATE TABLE "borrow_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "refYear" INTEGER NOT NULL,
    "refSeq" INTEGER NOT NULL,
    "requesterEmployeeId" UUID NOT NULL,
    "departmentId" UUID,
    "requesterName" TEXT,
    "requesterPosition" TEXT,
    "requesterPhone" TEXT,
    "requesterEmail" TEXT,
    "purpose" TEXT,
    "useLocation" TEXT,
    "borrowDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" "BorrowRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" "BorrowApprovalStep",
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "borrow_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "borrow_requests_organizationId_refNo_key" ON "borrow_requests"("organizationId", "refNo");
CREATE INDEX "borrow_requests_organizationId_status_idx" ON "borrow_requests"("organizationId", "status");
CREATE INDEX "borrow_requests_organizationId_requesterEmployeeId_idx" ON "borrow_requests"("organizationId", "requesterEmployeeId");
CREATE INDEX "borrow_requests_organizationId_dueDate_idx" ON "borrow_requests"("organizationId", "dueDate");

-- borrow_request_items
CREATE TABLE "borrow_request_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "status" "BorrowItemStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "borrow_request_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "borrow_request_items_organizationId_borrowRequestId_idx" ON "borrow_request_items"("organizationId", "borrowRequestId");
CREATE INDEX "borrow_request_items_organizationId_assetId_idx" ON "borrow_request_items"("organizationId", "assetId");

-- borrow_approvals
CREATE TABLE "borrow_approvals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "step" "BorrowApprovalStep" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "BorrowApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverUserId" UUID,
    "approverName" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "borrow_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "borrow_approvals_organizationId_borrowRequestId_idx" ON "borrow_approvals"("organizationId", "borrowRequestId");

-- asset_issue_records
CREATE TABLE "asset_issue_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "issuedById" UUID,
    "issuedByName" TEXT,
    "receivedByEmployeeId" UUID,
    "receivedByName" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    CONSTRAINT "asset_issue_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_issue_records_organizationId_borrowRequestId_idx" ON "asset_issue_records"("organizationId", "borrowRequestId");

-- asset_issue_items
CREATE TABLE "asset_issue_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueRecordId" UUID NOT NULL,
    "borrowItemId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "conditionBefore" "LoanCondition" NOT NULL DEFAULT 'GOOD',
    "conditionNote" TEXT,
    "serialSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_issue_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_issue_items_organizationId_issueRecordId_idx" ON "asset_issue_items"("organizationId", "issueRecordId");

-- asset_return_records
CREATE TABLE "asset_return_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "returnedByEmployeeId" UUID,
    "returnedByName" TEXT,
    "receivedById" UUID,
    "receivedByName" TEXT,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionResult" "InspectionResult" NOT NULL DEFAULT 'COMPLETE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    CONSTRAINT "asset_return_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_return_records_organizationId_borrowRequestId_idx" ON "asset_return_records"("organizationId", "borrowRequestId");

-- asset_return_items
CREATE TABLE "asset_return_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "returnRecordId" UUID NOT NULL,
    "borrowItemId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "conditionAfter" "LoanCondition" NOT NULL DEFAULT 'GOOD',
    "inspectionResult" "InspectionResult" NOT NULL DEFAULT 'COMPLETE',
    "accessoriesComplete" BOOLEAN NOT NULL DEFAULT true,
    "accessoriesNote" TEXT,
    "damageNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_return_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_return_items_organizationId_returnRecordId_idx" ON "asset_return_items"("organizationId", "returnRecordId");

-- asset_condition_photos
CREATE TABLE "asset_condition_photos" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "phase" "ConditionPhotoPhase" NOT NULL,
    "issueItemId" UUID,
    "returnItemId" UUID,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "caption" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_condition_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_condition_photos_organizationId_issueItemId_idx" ON "asset_condition_photos"("organizationId", "issueItemId");
CREATE INDEX "asset_condition_photos_organizationId_returnItemId_idx" ON "asset_condition_photos"("organizationId", "returnItemId");

-- digital_signatures
CREATE TABLE "digital_signatures" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "phase" TEXT,
    "signatureType" "SignatureType" NOT NULL DEFAULT 'NONE',
    "signatureImage" TEXT,
    "signedByUserId" UUID,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "digital_signatures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "digital_signatures_organizationId_borrowRequestId_idx" ON "digital_signatures"("organizationId", "borrowRequestId");

-- Foreign keys
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "borrow_request_items" ADD CONSTRAINT "borrow_request_items_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "borrow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "borrow_request_items" ADD CONSTRAINT "borrow_request_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "borrow_approvals" ADD CONSTRAINT "borrow_approvals_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "borrow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_issue_records" ADD CONSTRAINT "asset_issue_records_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "borrow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_issue_items" ADD CONSTRAINT "asset_issue_items_issueRecordId_fkey" FOREIGN KEY ("issueRecordId") REFERENCES "asset_issue_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_issue_items" ADD CONSTRAINT "asset_issue_items_borrowItemId_fkey" FOREIGN KEY ("borrowItemId") REFERENCES "borrow_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_return_records" ADD CONSTRAINT "asset_return_records_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "borrow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_return_items" ADD CONSTRAINT "asset_return_items_returnRecordId_fkey" FOREIGN KEY ("returnRecordId") REFERENCES "asset_return_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_return_items" ADD CONSTRAINT "asset_return_items_borrowItemId_fkey" FOREIGN KEY ("borrowItemId") REFERENCES "borrow_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_condition_photos" ADD CONSTRAINT "asset_condition_photos_issueItemId_fkey" FOREIGN KEY ("issueItemId") REFERENCES "asset_issue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_condition_photos" ADD CONSTRAINT "asset_condition_photos_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "asset_return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "digital_signatures" ADD CONSTRAINT "digital_signatures_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "borrow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
