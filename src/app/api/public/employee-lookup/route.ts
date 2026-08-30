/**
 * Public staff-ID lookup for the web-intake form (/report/<org-slug>).
 *
 * The reporter types their staff ID and we echo back a PARTIALLY MASKED name so
 * they can confirm "yes, that's me" before opening a case. This is deliberately
 * the least data that makes the confirm step meaningful:
 *   - name is masked (สมชาย ใ***), department is shown unmasked (not personal)
 *   - email / phone / employee id are never returned
 *   - unknown or inactive staff IDs get the same generic { ok: false }
 *   - hard per-IP rate limit, because an unauthenticated lookup is otherwise a
 *     staff-directory enumeration oracle
 *
 * No session required — this route is listed as public in auth.config.ts.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { findEmployeeByCode, maskEmployeeName } from "@/lib/services/support";

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  employeeCode: z.string().trim().min(1).max(64),
});

// Same shape for "bad input", "unknown org", "no such staff ID" and "inactive":
// the caller must not be able to tell these apart.
const NOT_FOUND = NextResponse.json(
  { ok: false, message: "ไม่พบรหัสพนักงานนี้ / Staff ID not found" },
  { status: 200 }
);

export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";

  // 20 lookups/hour/IP: plenty for a person who mistypes, useless for scraping.
  if (!checkRateLimit(`emplookup:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, message: "ลองบ่อยเกินไป กรุณารอสักครู่ / Too many attempts" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NOT_FOUND;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NOT_FOUND;

  const org = await prisma.organization.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (!org) return NOT_FOUND;

  const employee = await findEmployeeByCode(org.id, parsed.data.employeeCode);
  if (!employee) return NOT_FOUND;

  return NextResponse.json({
    ok: true,
    employeeCode: employee.employeeCode,
    displayName: maskEmployeeName(employee.firstName, employee.lastName),
    department: employee.department?.name ?? null,
  });
}
