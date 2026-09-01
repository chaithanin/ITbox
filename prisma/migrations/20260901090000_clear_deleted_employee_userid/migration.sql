-- DB-001: soft-deleted employees kept their unique userId, which blocked
-- re-linking that login account to a new employee record. Going forward the app
-- clears userId on soft-delete; this one-off backfill frees already-deleted rows.
UPDATE "employees" SET "userId" = NULL
WHERE "deletedAt" IS NOT NULL AND "userId" IS NOT NULL;
