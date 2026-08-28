/**
 * HR-ATS → TECHCORE employee sync (push)
 * ======================================
 * Runs INSIDE the HR Intelligence & ATS project (it uses HR-ATS's own Prisma
 * client and DATABASE_URL). Reads the current employee roster and PUSHes it to
 * TECHCORE's /api/hr/employees/sync endpoint, so TECHCORE's people data stays
 * current with HR as the single source of truth. Real data only.
 *
 * Place this file in the HR-ATS repo (e.g. scripts/), then:
 *   TECHCORE_URL=https://<techcore-domain>/api/hr/employees/sync \
 *   TECHCORE_KEY=tck_...  node scripts/hr_ats_to_techcore_sync.mjs
 *
 * Schedule it (cron / Cloud Scheduler → a small job) as often as you want the
 * roster refreshed — e.g. every 15 min, or trigger it on hire/mover/leaver
 * events from the HR-ATS worker.
 *
 * The TECHCORE_KEY is the org collector API key (TECHCORE → Settings →
 * Integrations). No HR secrets are sent; only roster fields TECHCORE needs.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const URL = process.env.TECHCORE_URL;
const KEY = process.env.TECHCORE_KEY;

async function main() {
  if (!URL || !KEY) throw new Error("TECHCORE_URL and TECHCORE_KEY are required.");

  const emps = await prisma.employee.findMany({
    include: {
      position: { select: { title: true } },
      department: { select: { code: true, name: true } },
      location: { select: { name: true } },
      manager: { select: { employeeCode: true } },
      user: { select: { email: true } },
    },
  });

  const employees = emps.map((e) => ({
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.user?.email ?? null,
    position: e.position?.title ?? null,
    // Prefer department code (matches TECHCORE department codes); falls back to name.
    department: e.department?.code ?? e.department?.name ?? null,
    location: e.location?.name ?? null,
    managerCode: e.manager?.employeeCode ?? null,
    status: e.employmentStatus, // ACTIVE | TERMINATED (mapped by TECHCORE)
    hireDate: e.hireDate ? e.hireDate.toISOString() : null,
    terminationDate: e.terminationDate ? e.terminationDate.toISOString() : null,
  }));

  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ employees, autoCreateDepartments: true }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`TECHCORE sync failed ${res.status}: ${JSON.stringify(out)}`);
  console.log(`Synced ${employees.length} employees -> ok=${out.ok} failed=${out.failed} movers=${out.movers}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
