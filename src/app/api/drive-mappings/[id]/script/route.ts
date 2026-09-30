import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/drive-mappings/[id]/script — a Windows .bat that maps the sheet's
 * network drives. The password is NEVER embedded: `net use` uses the signed-in
 * user's credentials, or prompts if the share needs different ones.
 */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("support:read");
  const { id } = await ctx.params;
  const r = await prisma.driveMapping.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // A .bat comment must not contain a raw newline; each drive path goes in a
  // quoted `net use` argument. Strip control chars defensively.
  const clean = (s: string) => s.replace(/[\r\n\t]/g, " ").trim();
  const lines: string[] = [
    "@echo off",
    "chcp 65001 >nul",
    "REM ============================================================",
    `REM  ITBox - Map Drives`,
    `REM  Employee : ${clean(r.employeeName || "-")}${r.employeeCode ? ` (${clean(r.employeeCode)})` : ""}`,
    `REM  Computer : ${clean(r.computerName || "-")}    User Share: ${clean(r.userShare || "-")}`,
    `REM  Login    : ${clean(r.loginUsername || r.computerName || "-")}`,
    "REM  NOTE: Password is NOT stored in this file. If a share asks for it,",
    "REM        get it from the ITBox Vault. To map to a drive letter, change a",
    'REM        line to:  net use Z: "\\\\server\\share" /persistent:yes',
    "REM ============================================================",
    "",
  ];
  if (r.drives.length === 0) {
    lines.push("REM (no drives configured)");
  } else {
    for (const path of r.drives) {
      lines.push(`net use "${clean(path)}" /persistent:yes`);
    }
  }
  lines.push("", "echo.", "echo Done. Mapped drives are listed above.", "pause");

  const body = lines.join("\r\n") + "\r\n";
  const fname = `map-drives-${(r.employeeCode || r.computerName || id.slice(0, 8)).replace(/[^a-zA-Z0-9._-]/g, "_")}.bat`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
});
