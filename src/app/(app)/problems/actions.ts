"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(5000).nullable().optional());
const STATUS = ["OPEN", "INVESTIGATING", "KNOWN_ERROR", "RESOLVED", "CLOSED"] as const;
const PRIORITY = ["P1", "P2", "P3", "P4"] as const;

async function nextNumber(organizationId: string, year: number): Promise<string> {
  const prefix = `PRB-${year}-`;
  const count = await prisma.problem.count({ where: { organizationId, problemNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

const createSchema = z.object({
  title: z.string().min(3).max(300),
  description: optStr,
  priority: z.enum(PRIORITY),
});

export async function createProblem(formData: FormData) {
  const user = await requirePermission("problem:manage");
  const i = createSchema.parse(Object.fromEntries(formData));
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const problemNumber = await nextNumber(user.organizationId, new Date().getFullYear());
    try {
      created = await prisma.problem.create({
        data: { organizationId: user.organizationId, problemNumber, title: i.title.trim(), description: i.description ?? null, priority: i.priority, assignedToId: user.id },
        select: { id: true },
      });
    } catch (e) {
      if (!(typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002")) throw e;
    }
  }
  if (!created) throw new Error("Could not allocate problem number");
  await auditLog(user, { action: "CREATE", entityType: "PROBLEM", entityId: created.id, detail: { title: i.title } });
  revalidatePath("/problems");
  redirect(`/problems/${created.id}`);
}

const updateSchema = z.object({
  status: z.enum(STATUS),
  priority: z.enum(PRIORITY),
  rootCause: optStr,
  workaround: optStr,
  knownError: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateProblem(id: string, formData: FormData) {
  const user = await requirePermission("problem:manage");
  const i = updateSchema.parse(Object.fromEntries(formData));
  const p = await prisma.problem.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, problemNumber: true } });
  if (!p) redirect("/problems");
  await prisma.problem.update({
    where: { id },
    data: {
      status: i.status, priority: i.priority, rootCause: i.rootCause ?? null, workaround: i.workaround ?? null,
      knownError: i.knownError ?? false,
      ...(i.status === "RESOLVED" || i.status === "CLOSED" ? { resolvedAt: new Date() } : {}),
    },
  });
  await auditLog(user, { action: "UPDATE", entityType: "PROBLEM", entityId: id, detail: { problemNumber: p.problemNumber, status: i.status } });
  revalidatePath("/problems");
  revalidatePath(`/problems/${id}`);
  redirect(`/problems/${id}?ok=1`);
}

/** Link or unlink a support case (incident) to this problem. */
export async function linkCase(problemId: string, formData: FormData) {
  const user = await requirePermission("problem:manage");
  const caseNumber = z.string().min(1).parse(formData.get("caseNumber")).trim();
  const problem = await prisma.problem.findFirst({ where: { id: problemId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!problem) redirect("/problems");
  const c = await prisma.supportCase.findFirst({ where: { organizationId: user.organizationId, caseNumber, deletedAt: null }, select: { id: true } });
  if (!c) redirect(`/problems/${problemId}?error=nocase`);
  await prisma.supportCase.update({ where: { id: c.id }, data: { problemId } });
  await auditLog(user, { action: "UPDATE", entityType: "SUPPORT_CASE", entityId: c.id, detail: { linkedProblem: problemId } });
  revalidatePath(`/problems/${problemId}`);
  redirect(`/problems/${problemId}?ok=linked`);
}
