-- Probation 30/60/90 KPI Evaluation. Fully additive; no existing table touched.
-- A review record only (document/HR) — grants no system access.

DO $$ BEGIN
  CREATE TYPE "EvaluationTemplate" AS ENUM ('IT_SUPPORT','IT_ASSISTANT_MANAGER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EvaluationStatus" AS ENUM ('DRAFT','IN_REVIEW','COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "evaluations" (
  "id"                UUID NOT NULL,
  "organizationId"    UUID NOT NULL,
  "employeeId"        UUID NOT NULL,
  "template"          "EvaluationTemplate" NOT NULL,
  "status"            "EvaluationStatus" NOT NULL DEFAULT 'DRAFT',
  "refNo"             TEXT,
  "employeeName"      TEXT,
  "position"          TEXT,
  "department"        TEXT,
  "reviewPeriodStart" TIMESTAMP(3),
  "probationEndDate"  TIMESTAMP(3),
  "currentStage"      TEXT,
  "scores"            JSONB NOT NULL DEFAULT '{}',
  "overallScore"      DOUBLE PRECISION,
  "grade"             TEXT,
  "managerComment"    TEXT,
  "employeeComment"   TEXT,
  "actionPlan"        TEXT,
  "reviewerName"      TEXT,
  "reviewerId"        UUID,
  "employeeAckAt"     TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),
  "createdById"       UUID,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "evaluations_organizationId_status_idx" ON "evaluations"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "evaluations_organizationId_employeeId_idx" ON "evaluations"("organizationId", "employeeId");

DO $$ BEGIN
  ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
