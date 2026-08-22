-- CreateEnum
CREATE TYPE "KpiMetric" AS ENUM ('CLOSED_TICKETS', 'SLA_COMPLIANCE', 'AVG_RESOLUTION_HOURS', 'CSAT', 'BACKLOG');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "kpiPopupMode" TEXT NOT NULL DEFAULT 'DAILY';

-- CreateTable
CREATE TABLE "kpi_configs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "metric" "KpiMetric" NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_configs_organizationId_idx" ON "kpi_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_configs_organizationId_metric_key" ON "kpi_configs"("organizationId", "metric");

-- AddForeignKey
ALTER TABLE "kpi_configs" ADD CONSTRAINT "kpi_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
