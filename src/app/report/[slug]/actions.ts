"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPublicCase, findEmployeeByCode } from "@/lib/services/support";
import type { CaseImpact } from "@prisma/client";

const emptyNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const schema = z.object({
  slug: z.string().min(1).max(120),
  employeeCode: z.string().trim().min(1).max(64),
  subject: z.string().trim().min(3).max(300),
  description: z.string().trim().min(10).max(5000),
  typeId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  impact: z.preprocess(emptyNull, z.enum(["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"]).nullable()),
  // Honeypot: real users never see or fill this; bots do.
  company: z.string().max(0).optional().or(z.literal("")),
});

export async function submitPublicCaseAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");

  // Spam trap: a filled honeypot is silently treated as "success" (no case).
  if (typeof formData.get("company") === "string" && (formData.get("company") as string).length > 0) {
    redirect(`/report/${slug}?ok=spam`);
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";

  // Per-IP and per-slug throttles (defense in depth; see rate-limit.ts).
  if (!checkRateLimit(`report:ip:${ip}`, 5, 60 * 60 * 1000)) {
    redirect(`/report/${slug}?error=rate`);
  }
  if (!checkRateLimit(`report:slug:${slug}`, 60, 60 * 60 * 1000)) {
    redirect(`/report/${slug}?error=rate`);
  }

  const parsed = schema.safeParse({
    slug,
    employeeCode: formData.get("employeeCode"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    typeId: formData.get("typeId"),
    impact: formData.get("impact"),
    company: formData.get("company") ?? "",
  });
  if (!parsed.success) redirect(`/report/${slug}?error=invalid`);
  const d = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { slug: d.slug },
    select: { id: true },
  });
  if (!org) redirect(`/report/${slug}?error=notfound`);

  // Re-validate the staff ID here: the browser step is convenience only, and a
  // hand-crafted POST must not be able to open a case against an unknown or
  // departed employee.
  const employee = await findEmployeeByCode(org.id, d.employeeCode);
  if (!employee) redirect(`/report/${slug}?error=employee`);

  let caseNumber: string;
  try {
    const created = await createPublicCase(org.id, {
      employeeCode: d.employeeCode,
      subject: d.subject,
      description: d.description,
      typeId: d.typeId,
      impact: d.impact as CaseImpact | null,
    });
    caseNumber = created.caseNumber;
  } catch {
    redirect(`/report/${slug}?error=failed`);
  }

  redirect(`/report/${slug}?ok=${encodeURIComponent(caseNumber)}`);
}
