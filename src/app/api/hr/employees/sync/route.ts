import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";
import { linkEmployeesToUsers } from "@/lib/hr-user-link";

export const dynamic = "force-dynamic";

/**
 * HR / ATS employee sync (push model). The HR Intelligence & ATS system — the
 * source of truth for people data — POSTs the current employee roster here and
 * TECHCORE upserts it by employeeCode, keeping departments, positions, managers
 * and employment status current. Authenticated by the org collector API key.
 *
 * Body: { employees: [{
 *   employeeCode, firstName, lastName, email?, phone?, position?,
 *   department?(code or name), location?(code or name), managerCode?,
 *   status?("ACTIVE"|"TERMINATED"|"ON_LEAVE"|"OFFBOARDING"|"RESIGNED"),
 *   hireDate?(ISO), terminationDate?(ISO)
 * }], autoCreateDepartments?: boolean }
 */

type Status = "ACTIVE" | "ON_LEAVE" | "OFFBOARDING" | "RESIGNED";
function mapStatus(raw: unknown): Status {
  const s = typeof raw === "string" ? raw.toUpperCase() : "";
  if (s === "TERMINATED" || s === "RESIGNED") return "RESIGNED";
  if (s === "ON_LEAVE") return "ON_LEAVE";
  if (s === "OFFBOARDING") return "OFFBOARDING";
  return "ACTIVE";
}
const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 40) || "DEPT";

export async function POST(req: Request) {
  // Accept a dedicated HR sync key, and still honour the shared collector key
  // for a smooth cut-over.
  const auth = await resolveIngestOrg(req, { keys: ["hr.ingest", "itreport.ingest"] });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const payload = body as { employees?: unknown[]; autoCreateDepartments?: boolean };
  if (!Array.isArray(payload.employees)) return NextResponse.json({ error: "employees_required" }, { status: 400 });
  if (payload.employees.length > 10000) return NextResponse.json({ error: "too_many" }, { status: 400 });
  const autoCreate = payload.autoCreateDepartments !== false; // default on — HR is authoritative

  // Pre-load department/location lookup maps (by code and name, per org).
  const [depts, locs] = await Promise.all([
    prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, code: true, name: true } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, code: true, name: true } }),
  ]);
  const deptBy = new Map<string, string>();
  for (const d of depts) { deptBy.set(d.code.toLowerCase(), d.id); deptBy.set(d.name.toLowerCase(), d.id); }
  const locBy = new Map<string, string>();
  for (const l of locs) { locBy.set(l.code.toLowerCase(), l.id); locBy.set(l.name.toLowerCase(), l.id); }

  async function resolveDept(key: string | null): Promise<string | null> {
    if (!key) return null;
    const hit = deptBy.get(key.toLowerCase());
    if (hit) return hit;
    if (!autoCreate) return null;
    // Create a department so the org tree stays in sync with HR; retry code on
    // unique collision.
    const base = slug(key);
    for (let i = 0; i < 6; i++) {
      const code = i === 0 ? base : `${base}-${i}`;
      try {
        const d = await prisma.department.create({ data: { organizationId: orgId, code, name: key } });
        deptBy.set(d.code.toLowerCase(), d.id);
        deptBy.set(d.name.toLowerCase(), d.id);
        return d.id;
      } catch {
        // code taken — if that code already maps to a dept, reuse it; else bump.
        const taken = deptBy.get(code.toLowerCase());
        if (taken) return taken;
      }
    }
    return null;
  }

  let ok = 0;
  const errors: { employeeCode: string; error: string }[] = [];
  const managerLinks: { code: string; managerCode: string }[] = [];
  // Employee ids touched this batch — reconciled to user accounts at the end.
  const touched: string[] = [];
  // Track dept/position changes to feed the Mover access-review control.
  const movers: { name: string; what: string; employeeId: string }[] = [];
  // Track lifecycle transitions to raise Onboarding (Joiner) / Offboarding (Leaver).
  const joiners: { name: string; employeeId: string }[] = [];
  const leavers: { name: string; employeeId: string; lastWorkDate: Date | null }[] = [];

  for (const raw of payload.employees) {
    const e = raw as Record<string, unknown>;
    const employeeCode = str(e.employeeCode, 50);
    if (!employeeCode) { errors.push({ employeeCode: "(missing)", error: "employeeCode required" }); continue; }
    const firstName = str(e.firstName) ?? employeeCode;
    const lastName = str(e.lastName) ?? "";
    const departmentId = await resolveDept(str(e.department));
    const locationId = str(e.location) ? (locBy.get(String(e.location).toLowerCase()) ?? null) : null;
    const position = str(e.position);
    const status = mapStatus(e.status);

    try {
      const existing = await prisma.employee.findFirst({
        where: { organizationId: orgId, employeeCode },
        select: { id: true, departmentId: true, position: true, firstName: true, lastName: true, status: true },
      });
      const data = {
        firstName, lastName,
        email: str(e.email, 200), phone: str(e.phone, 50),
        position, status,
        startDate: date(e.hireDate), endDate: date(e.terminationDate),
        departmentId, locationId,
      };
      let empId: string;
      if (existing) {
        await prisma.employee.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
        empId = existing.id;
        const deptChanged = (existing.departmentId ?? null) !== (departmentId ?? null);
        const posChanged = (existing.position ?? null) !== (position ?? null);
        if (deptChanged || posChanged) {
          movers.push({
            name: `${firstName} ${lastName}`.trim(),
            what: [deptChanged ? "แผนก/Department" : null, posChanged ? "ตำแหน่ง/Position" : null].filter(Boolean).join(", "),
            employeeId: empId,
          });
        }
        // Leaver: employment transitioned into RESIGNED from a working state.
        if (status === "RESIGNED" && existing.status !== "RESIGNED") {
          leavers.push({ name: `${firstName} ${lastName}`.trim(), employeeId: empId, lastWorkDate: date(e.terminationDate) });
        }
      } else {
        const created = await prisma.employee.create({ data: { organizationId: orgId, employeeCode, ...data } });
        empId = created.id;
        // Joiner: a brand-new active employee from HR — raise IT onboarding.
        if (status === "ACTIVE") joiners.push({ name: `${firstName} ${lastName}`.trim(), employeeId: empId });
        else if (status === "RESIGNED") leavers.push({ name: `${firstName} ${lastName}`.trim(), employeeId: empId, lastWorkDate: date(e.terminationDate) });
      }
      const managerCode = str(e.managerCode, 50);
      if (managerCode && managerCode !== employeeCode) managerLinks.push({ code: employeeCode, managerCode });
      touched.push(empId);
      ok++;
    } catch {
      errors.push({ employeeCode, error: "upsert_failed" });
    }
  }

  // Second pass: resolve manager links by employeeCode.
  for (const link of managerLinks) {
    const [emp, mgr] = await Promise.all([
      prisma.employee.findFirst({ where: { organizationId: orgId, employeeCode: link.code }, select: { id: true } }),
      prisma.employee.findFirst({ where: { organizationId: orgId, employeeCode: link.managerCode }, select: { id: true } }),
    ]);
    if (emp && mgr && emp.id !== mgr.id) {
      await prisma.employee.update({ where: { id: emp.id }, data: { managerId: mgr.id } }).catch(() => {});
    }
  }

  // Reconcile the employees in this batch to TECHCORE user accounts by email, so
  // HR people data stays connected to login identities.
  const link = await linkEmployeesToUsers(orgId, touched).catch(() => ({ linked: 0, unmatched: 0, alreadyLinked: 0 }));

  // Recipients for JML popups: IT managers/admins (and HR, who also action JML).
  let itManagers: { id: string }[] = [];
  if (movers.length > 0 || joiners.length > 0 || leavers.length > 0) {
    itManagers = await prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null, status: "ACTIVE", userRoles: { some: { role: { key: { in: ["SUPER_ADMIN", "ADMIN", "IT_MANAGER", "IT_STAFF", "HR"] } } } } },
      select: { id: true },
    });
  }
  const notify = async (users: { id: string }[], rows: { type: string; level: "INFO" | "WARNING"; title: string; body: string; link: string }[]) => {
    if (users.length === 0 || rows.length === 0) return;
    await prisma.notification.createMany({
      data: rows.flatMap((r) => users.map((u) => ({ organizationId: orgId, userId: u.id, type: r.type, level: r.level, title: r.title, body: r.body, link: r.link }))),
    }).catch(() => {});
  };

  // Mover control: notify IT managers to review access for dept/position changes.
  if (movers.length > 0) {
    await notify(itManagers, movers.map((m) => ({
      type: "ACCESS_REVIEW", level: "WARNING" as const,
      title: "ต้องทบทวนสิทธิ์ (Mover) / Access review needed",
      body: `${m.name} เปลี่ยน ${m.what} (จาก HR sync) — โปรดทบทวนทรัพย์สิน สิทธิ์ และการเข้าถึง`,
      link: `/employees/${m.employeeId}`,
    })));
  }

  // Joiner: raise an IT onboarding checklist (idempotent) and pop a notification.
  let onboardingsCreated = 0;
  for (const j of joiners) {
    const exists = await prisma.onboarding.findFirst({ where: { organizationId: orgId, employeeId: j.employeeId }, select: { id: true } });
    if (!exists) { await prisma.onboarding.create({ data: { organizationId: orgId, employeeId: j.employeeId, status: "PENDING" } }).catch(() => {}); onboardingsCreated++; }
  }
  await notify(itManagers, joiners.map((j) => ({
    type: "ONBOARDING", level: "INFO" as const,
    title: "พนักงานใหม่ (Joiner) / New hire — เริ่ม IT Onboarding",
    body: `${j.name} เข้าใหม่จาก HR — เปิดเครื่อง/บัญชี/อีเมล/สิทธิ์ ตามเช็กลิสต์ Onboarding`,
    link: "/employees?tab=onboarding",
  })));

  // Leaver: raise an IT offboarding case (idempotent — skip if one is already open).
  let offboardingsCreated = 0;
  for (const l of leavers) {
    const open = await prisma.offboarding.findFirst({ where: { organizationId: orgId, employeeId: l.employeeId, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } });
    if (!open) { await prisma.offboarding.create({ data: { organizationId: orgId, employeeId: l.employeeId, status: "OPEN", lastWorkDate: l.lastWorkDate } }).catch(() => {}); offboardingsCreated++; }
  }
  await notify(itManagers, leavers.map((l) => ({
    type: "OFFBOARDING", level: "WARNING" as const,
    title: "พนักงานลาออก (Leaver) / Offboarding — เริ่มคืนทรัพย์สิน/ปิดสิทธิ์",
    body: `${l.name} สิ้นสุดการทำงาน (จาก HR) — คืนอุปกรณ์ ปิดบัญชี เพิกถอนสิทธิ์/รหัสตามเช็กลิสต์ Offboarding`,
    link: "/employees?tab=offboarding",
  })));

  await prisma.auditLog.create({
    data: { organizationId: orgId, action: "IMPORT", entityType: "EMPLOYEE", detail: { via: "hr-sync", ok, failed: errors.length, movers: movers.length, joiners: joiners.length, leavers: leavers.length, onboardingsCreated, offboardingsCreated, usersLinked: link.linked } },
  }).catch(() => {});

  return NextResponse.json({ ok, failed: errors.length, movers: movers.length, joiners: joiners.length, leavers: leavers.length, onboardingsCreated, offboardingsCreated, usersLinked: link.linked, usersUnmatched: link.unmatched, errors: errors.slice(0, 100) });
}
