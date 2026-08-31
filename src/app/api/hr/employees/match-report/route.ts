import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * Read-only diagnostic for the employee <-> user matching gap. Shows how many
 * employees have an email, how many are linked, and lists the unlinked
 * employees (with email) and the user accounts that have no employee — so an
 * admin can spot near-misses (same person, mismatched email) and fix the email
 * on one side to raise the match rate.
 *
 * Auth: the HR sync key (`hr.ingest`) or the shared collector key.
 * POST (no body) -> counts + up to 200 unmatched employees + up to 200 unlinked users.
 */
export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req, { keys: ["hr.ingest", "itreport.ingest"] });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  const [employees, users] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { employeeCode: true, firstName: true, lastName: true, email: true, userId: true },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { email: true, name: true, employeeCode: true, employee: { select: { id: true } } },
    }),
  ]);

  const unlinkedWithEmail = employees.filter((e) => !e.userId && e.email);
  const unlinkedNoEmail = employees.filter((e) => !e.userId && !e.email);
  const linked = employees.filter((e) => e.userId);
  const unlinkedUsers = users.filter((u) => !u.employee);

  return NextResponse.json({
    employees: {
      total: employees.length,
      withEmail: employees.filter((e) => e.email).length,
      linked: linked.length,
      unlinkedWithEmail: unlinkedWithEmail.length,
      unlinkedNoEmail: unlinkedNoEmail.length,
    },
    users: {
      total: users.length,
      linkedToEmployee: users.length - unlinkedUsers.length,
      unlinked: unlinkedUsers.length,
      withEmployeeCode: users.filter((u) => u.employeeCode).length,
    },
    unmatchedEmployees: unlinkedWithEmail
      .slice(0, 200)
      .map((e) => ({ employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}`.trim(), email: e.email })),
    unlinkedUsers: unlinkedUsers
      .slice(0, 200)
      .map((u) => ({ email: u.email, name: u.name, employeeCode: u.employeeCode })),
  });
}
