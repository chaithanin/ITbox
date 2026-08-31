import { prisma } from "@/lib/prisma";

export type LinkResult = {
  /** Employees newly linked to a user account in this pass. */
  linked: number;
  /** Employees whose email matched no user account in the org. */
  unmatched: number;
  /** Employees skipped because the matching user is already tied to another employee. */
  alreadyLinked: number;
};

/**
 * Match employees to system user accounts by email (org-scoped), setting
 * Employee.userId. This is how HR people data (source of truth) reconciles with
 * TECHCORE login accounts so asset assignments, vault shares and support cases
 * can resolve a person to their account.
 *
 * Rules:
 *  - only touches employees with no user link yet and a non-empty email;
 *  - matches case-insensitively against User.email in the same org;
 *  - never reuses a user already bound to another employee (Employee.userId is
 *    unique) — those are reported as `alreadyLinked`, not linked;
 *  - idempotent: safe to run repeatedly and after every HR sync.
 *
 * Pass `employeeIds` to reconcile just the rows a sync batch touched; omit it to
 * backfill the whole org.
 */
export async function linkEmployeesToUsers(orgId: string, employeeIds?: string[]): Promise<LinkResult> {
  const employees = await prisma.employee.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      userId: null,
      email: { not: null },
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
    },
    select: { id: true, email: true },
  });
  if (employees.length === 0) return { linked: 0, unmatched: 0, alreadyLinked: 0 };

  // Load candidate users. Emails are normally stored lowercased on both sides;
  // pass both the raw and lowercased forms so a case mismatch still matches
  // (Postgres `in` is case-sensitive), then key the map by lowercased email.
  const variants = Array.from(new Set(employees.flatMap((e) => [e.email as string, (e.email as string).toLowerCase()])));
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, deletedAt: null, email: { in: variants } },
    select: { id: true, email: true, employee: { select: { id: true } } },
  });
  const userByEmail = new Map<string, { id: string; taken: boolean }>();
  for (const u of users) userByEmail.set(u.email.toLowerCase(), { id: u.id, taken: Boolean(u.employee) });

  let linked = 0;
  let unmatched = 0;
  let alreadyLinked = 0;
  for (const e of employees) {
    const u = userByEmail.get((e.email as string).toLowerCase());
    if (!u) { unmatched++; continue; }
    if (u.taken) { alreadyLinked++; continue; }
    try {
      await prisma.employee.update({ where: { id: e.id }, data: { userId: u.id } });
      u.taken = true; // don't bind the same user to two employees in one pass
      linked++;
    } catch {
      // Unique collision (raced) — treat as already linked.
      alreadyLinked++;
    }
  }
  return { linked, unmatched, alreadyLinked };
}
