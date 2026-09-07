-- Employee nickname (ชื่อเล่น). Sourced from the HR/ATS system via the
-- employee sync push; also shown on employee detail and auto-filled into the
-- document forms' "ชื่อเล่น / Nickname" field.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
