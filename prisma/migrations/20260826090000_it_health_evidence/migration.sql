-- CreateTable
CREATE TABLE "it_health_evidence" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "checkId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "it_health_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "it_health_evidence_organizationId_checkId_idx" ON "it_health_evidence"("organizationId", "checkId");

-- AddForeignKey
ALTER TABLE "it_health_evidence" ADD CONSTRAINT "it_health_evidence_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "it_health_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
