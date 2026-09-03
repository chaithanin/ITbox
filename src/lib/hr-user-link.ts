import { prisma } from "@/lib/prisma";

export type LinkResult = {
  /** Employees newly linked to a user account in this pass. */
  linked: number;
  /** Employees that matched no user account (by email or unambiguous name). */
  unmatched: number;
  /** Employees skipped because the matching user is already tied to another employee. */
  alreadyLinked: number;
};

// Leading honorifics stripped before comparing names (Thai + English). Matched
// as a separate leading word ("<title> name") for either script — this avoids
// eating real names that merely start with those letters (e.g. "Missy").
const WORD_TITLES = [
  "นาย", "นาง", "นางสาว", "น.ส.", "ดร.", "ดร", "ว่าที่ร.ต.", "ว่าที่ ร.ต.",
  "mr.", "mr", "mrs.", "mrs", "ms.", "ms", "miss", "dr.", "dr",
];
// Thai honorifics are very commonly written glued to the given name
// (นายสมชาย, นางสาวสุดา, น.ส.สุดา). These may be stripped with no following
// space. Distinctive prefixes only — bare "ดร" is excluded so it can't eat a
// name like "ดรุณี" (only "ดร." with the period is glued-stripped).
const GLUE_TITLES = ["ว่าที่ร.ต.", "นางสาว", "น.ส.", "ดร.", "นาย", "นาง"];

/** Normalize a full name for comparison: strip a leading title, collapse
 * whitespace, lowercase. Returns "" when nothing usable remains. */
function normName(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  const lower = s.toLowerCase();
  // 1) title as a separate leading word (longest first: "นางสาว" before "นาง").
  let stripped = false;
  for (const t of [...WORD_TITLES].sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(t + " ")) { s = s.slice(t.length).trim(); stripped = true; break; }
  }
  // 2) otherwise a glued Thai honorific (นายวิชัย -> วิชัย).
  if (!stripped) {
    for (const t of [...GLUE_TITLES].sort((a, b) => b.length - a.length)) {
      if (s.startsWith(t)) { s = s.slice(t.length).trim(); break; }
    }
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Match employees to system user accounts (org-scoped), setting Employee.userId,
 * so HR people data reconciles with TECHCORE login accounts (asset assignments,
 * vault shares and support cases can then resolve a person to their account).
 *
 * Matching, in priority order:
 *  1. employee code — exact (case-insensitive) against User.employeeCode. This
 *     is the deterministic, 100%-reliable match. Set the code on an account in
 *     Settings > Users to guarantee it.
 *  2. email — exact, case-insensitive (when the employee has one);
 *  3. full name — `firstName lastName` vs `User.name`, normalized (title/
 *     whitespace/case), and only when UNAMBIGUOUS: exactly one employee and
 *     exactly one unlinked user carry that name — the employee code disambiguates
 *     same-name collisions so they are skipped rather than mislinked.
 *
 * On a successful email/name link, the employee's code is stamped onto the user
 * account (when it has none), so the next reconciliation matches by code — the
 * first fuzzy match bootstraps a permanent deterministic key.
 *
 * Rules: only touches employees with no user link yet; never reuses a user
 * already bound to another employee (Employee.userId is unique); idempotent.
 *
 * Pass `employeeIds` to reconcile just a sync batch; omit to backfill the org.
 */
export async function linkEmployeesToUsers(orgId: string, employeeIds?: string[]): Promise<LinkResult> {
  const employees = await prisma.employee.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      userId: null,
      ...(employeeIds ? { id: { in: employeeIds } } : {}),
    },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true },
  });
  if (employees.length === 0) return { linked: 0, unmatched: 0, alreadyLinked: 0 };

  // Users already bound to a LIVE employee are off-limits. We derive this from
  // the employee side (not the User.employee relation) so that a user pointed at
  // by a soft-deleted employee is correctly treated as available — see DB-001.
  const taken = new Set(
    (await prisma.employee.findMany({
      where: { organizationId: orgId, deletedAt: null, userId: { not: null } },
      select: { userId: true },
    })).map((e) => e.userId as string),
  );

  // All active users in the org — indexed by code, email and normalized name.
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, email: true, name: true, employeeCode: true },
  });
  type Ref = { id: string; taken: boolean; hasCode: boolean };
  const userByCode = new Map<string, Ref>();
  const userByEmail = new Map<string, Ref>();
  const usersByName = new Map<string, Ref[]>();
  for (const u of users) {
    const ref: Ref = { id: u.id, taken: taken.has(u.id), hasCode: Boolean(u.employeeCode) };
    if (u.employeeCode) userByCode.set(u.employeeCode.toLowerCase(), ref);
    if (u.email) userByEmail.set(u.email.toLowerCase(), ref);
    const n = normName(u.name);
    if (n) {
      const arr = usersByName.get(n);
      if (arr) arr.push(ref);
      else usersByName.set(n, [ref]);
    }
  }

  // Count how many unlinked employees share each normalized name, so a name that
  // maps to more than one person is treated as ambiguous and skipped.
  const empNameCount = new Map<string, number>();
  for (const e of employees) {
    const n = normName(`${e.firstName} ${e.lastName}`);
    if (n) empNameCount.set(n, (empNameCount.get(n) ?? 0) + 1);
  }

  let linked = 0;
  let unmatched = 0;
  let alreadyLinked = 0;
  for (const e of employees) {
    // 1. employee code (deterministic)
    let ref: Ref | undefined = userByCode.get(e.employeeCode.toLowerCase());
    // 2. email
    if (!ref && e.email) ref = userByEmail.get(e.email.toLowerCase());
    // 3. unambiguous full-name
    if (!ref) {
      const n = normName(`${e.firstName} ${e.lastName}`);
      if (n && empNameCount.get(n) === 1) {
        const free = (usersByName.get(n) ?? []).filter((u) => !u.taken);
        if (free.length === 1) ref = free[0];
      }
    }
    if (!ref) { unmatched++; continue; }
    if (ref.taken) { alreadyLinked++; continue; }
    try {
      await prisma.employee.update({ where: { id: e.id }, data: { userId: ref.id } });
      ref.taken = true; // don't bind the same user to two employees in one pass
      // Bootstrap: stamp the code onto the account so future runs match by code.
      if (!ref.hasCode) {
        await prisma.user.update({ where: { id: ref.id }, data: { employeeCode: e.employeeCode } }).catch(() => {});
        ref.hasCode = true;
      }
      linked++;
    } catch {
      alreadyLinked++;
    }
  }
  return { linked, unmatched, alreadyLinked };
}
