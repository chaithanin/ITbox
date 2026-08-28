-- ===================== Problem Management =====================
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN','INVESTIGATING','KNOWN_ERROR','RESOLVED','CLOSED');

CREATE TABLE "problems" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "problemNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "CasePriority" NOT NULL DEFAULT 'P3',
  "rootCause" TEXT,
  "workaround" TEXT,
  "knownError" BOOLEAN NOT NULL DEFAULT false,
  "assignedToId" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "problems_organizationId_problemNumber_key" ON "problems"("organizationId","problemNumber");
CREATE INDEX "problems_organizationId_status_idx" ON "problems"("organizationId","status");
ALTER TABLE "problems" ADD CONSTRAINT "problems_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Link incidents (support cases) to a problem
ALTER TABLE "support_cases" ADD COLUMN "problemId" UUID;
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================== Knowledge Base =====================
CREATE TYPE "KbStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');

CREATE TABLE "kb_articles" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "body" TEXT NOT NULL,
  "tags" TEXT,
  "status" "KbStatus" NOT NULL DEFAULT 'DRAFT',
  "authorId" UUID,
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kb_articles_organizationId_status_idx" ON "kb_articles"("organizationId","status");
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== Vulnerability & Patch =====================
CREATE TYPE "VulnSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "VulnStatus" AS ENUM ('OPEN','IN_PROGRESS','REMEDIATED','ACCEPTED','FALSE_POSITIVE');

CREATE TABLE "vulnerabilities" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "cveId" TEXT,
  "severity" "VulnSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "VulnStatus" NOT NULL DEFAULT 'OPEN',
  "assetId" UUID,
  "affectedSystem" TEXT,
  "description" TEXT,
  "remediation" TEXT,
  "patchAvailable" BOOLEAN NOT NULL DEFAULT false,
  "patchVersion" TEXT,
  "dueDate" DATE,
  "assignedToId" UUID,
  "remediatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vulnerabilities_organizationId_status_idx" ON "vulnerabilities"("organizationId","status");
CREATE INDEX "vulnerabilities_organizationId_severity_idx" ON "vulnerabilities"("organizationId","severity");
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================== Grant permissions to roles =====================
INSERT INTO "permissions" ("id","key") VALUES
  (gen_random_uuid(),'problem:read'),(gen_random_uuid(),'problem:manage'),
  (gen_random_uuid(),'kb:read'),(gen_random_uuid(),'kb:manage'),
  (gen_random_uuid(),'vuln:read'),(gen_random_uuid(),'vuln:manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('problem:read','problem:manage','kb:read','kb:manage','vuln:read','vuln:manage')
WHERE r."key" IN ('SUPER_ADMIN','ADMIN','IT_MANAGER','IT_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('problem:read','kb:read','vuln:read')
WHERE r."key" IN ('VIEWER','AUDITOR','FINANCE','MANAGER')
ON CONFLICT DO NOTHING;

-- Security roles should see vulnerabilities
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r
JOIN "permissions" p ON p."key" IN ('vuln:read','vuln:manage','kb:read')
WHERE r."key" = 'SECURITY_ADMIN'
ON CONFLICT DO NOTHING;
