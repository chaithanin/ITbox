-- CreateTable
CREATE TABLE "signature_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "companyName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#24386F',
    "secondaryColor" TEXT NOT NULL DEFAULT '#6b7280',
    "fontFamily" TEXT NOT NULL DEFAULT 'Arial, Helvetica, sans-serif',
    "fontSize" INTEGER NOT NULL DEFAULT 13,
    "dividerStyle" TEXT NOT NULL DEFAULT 'solid',
    "defaultLinks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "signature_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "templateId" UUID,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "department" TEXT,
    "mobilePhone" TEXT,
    "officePhone" TEXT,
    "extension" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "companyLinks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_templates_organizationId_idx" ON "signature_templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_profiles_userId_key" ON "signature_profiles"("userId");

-- CreateIndex
CREATE INDEX "signature_profiles_organizationId_idx" ON "signature_profiles"("organizationId");

-- AddForeignKey
ALTER TABLE "signature_templates" ADD CONSTRAINT "signature_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_profiles" ADD CONSTRAINT "signature_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_profiles" ADD CONSTRAINT "signature_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_profiles" ADD CONSTRAINT "signature_profiles_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "signature_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
