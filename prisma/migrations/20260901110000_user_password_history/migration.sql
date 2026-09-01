-- AUTH-006: keep recent password hashes to block reuse on change/reset.
ALTER TABLE "users" ADD COLUMN "passwordHistory" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
