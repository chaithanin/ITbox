-- Onboarding step data: capture the account name, work email (password kept in
-- the Vault, not here), and the list of software installed, alongside the
-- existing checklist booleans.
ALTER TABLE "onboardings" ADD COLUMN "accountUsername" TEXT;
ALTER TABLE "onboardings" ADD COLUMN "emailAddress" TEXT;
ALTER TABLE "onboardings" ADD COLUMN "emailPasswordVaultItemId" UUID;
ALTER TABLE "onboardings" ADD COLUMN "softwareInstalled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
