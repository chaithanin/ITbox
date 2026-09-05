import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { resolveAccessProfile, approvalChain } from "@/lib/documents/access-profile";
import type { JobLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "IT_ADMIN"];

/** GET /api/doc-forms/access-profile — resolve the default permission profile. */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const lv = sp.get("jobLevel");
  const resolved = await resolveAccessProfile(user.organizationId, {
    company: sp.get("company"),
    department: sp.get("department"),
    position: sp.get("position"),
    jobLevel: lv && LEVELS.includes(lv) ? (lv as JobLevel) : null,
  });
  const hasRestricted = resolved.items.some((i) => i.defaultStatus === "RESTRICTED");
  return NextResponse.json({
    ...resolved,
    approvalChain: approvalChain(resolved.approval, { hasRestricted }),
  });
});
