import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { CaseStatus } from "@prisma/client";
import {
  CATEGORY_META, CATEGORY_ORDER, computeKpis, rollupByCategory, exceptions,
  type HealthCheck, type ItSystemCategory,
} from "@/lib/services/it-report";

const OPEN_STATUSES = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR", "REOPENED"] as const;
const STATUS_LABEL: Record<string, string> = { NORMAL: "Normal", WARNING: "Warning", CRITICAL: "Critical", NOT_CHECKED: "Not checked" };

function loadThaiFont(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/NotoSansThai-Regular.ttf"));
  } catch {
    return null;
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

interface ReportData {
  reportDate: Date;
  orgName: string;
  checks: (HealthCheck & { verified: boolean })[];
  issues: { caseNumber: string; subject: string; priority: string; status: string; assignee: string; overdue: boolean }[];
}

async function loadData(orgId: string, dateParam: string | null): Promise<ReportData> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  let reportDate: Date;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    reportDate = new Date(`${dateParam}T00:00:00.000Z`);
  } else {
    const latest = await prisma.itHealthCheck.findFirst({
      where: { organizationId: orgId, deletedAt: null }, orderBy: { checkDate: "desc" }, select: { checkDate: true },
    });
    reportDate = latest?.checkDate ?? new Date();
  }
  const [raw, issues] = await Promise.all([
    prisma.itHealthCheck.findMany({
      where: { organizationId: orgId, deletedAt: null, checkDate: reportDate },
      include: { location: { select: { name: true } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.supportCase.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: OPEN_STATUSES as unknown as CaseStatus[] } },
      select: { caseNumber: true, subject: true, priority: true, status: true, resolutionDueAt: true, assignedUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const now = new Date();
  return {
    reportDate,
    orgName: org?.name ?? "Organization",
    checks: raw.map((c) => ({
      id: c.id, category: c.category as ItSystemCategory, name: c.name, mode: c.mode, status: c.status,
      healthPercent: c.healthPercent, metrics: c.metrics, note: c.note, issueCaseId: c.issueCaseId,
      locationName: c.location?.name ?? null, verified: !!c.verifiedAt,
    })),
    issues: issues.map((i) => ({
      caseNumber: i.caseNumber, subject: i.subject, priority: i.priority, status: i.status,
      assignee: i.assignedUser?.name ?? "Unassigned", overdue: !!i.resolutionDueAt && i.resolutionDueAt < now,
    })),
  };
}

async function toXlsx(d: ReportData): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const kpis = computeKpis(d.checks);
  const rollups = rollupByCategory(d.checks);

  const s1 = wb.addWorksheet("Summary");
  s1.addRow(["Daily IT Health Report"]);
  s1.addRow([d.orgName, fmtDate(d.reportDate)]);
  s1.addRow([]);
  s1.addRow(["Overall Health %", kpis.healthPercent]);
  s1.addRow(["Systems", kpis.total, "Checked", kpis.checked]);
  s1.addRow(["Normal", kpis.normal, "Warning", kpis.warning, "Critical", kpis.critical, "Pending", kpis.notChecked]);
  s1.addRow(["Open Issues", d.issues.length, "Over SLA", d.issues.filter((i) => i.overdue).length]);
  s1.addRow([]);
  s1.addRow(["Category", "Total", "Normal", "Warning", "Critical", "Not checked", "Worst"]);
  for (const r of rollups) {
    s1.addRow([CATEGORY_META[r.category].en, r.total, r.normal, r.warning, r.critical, r.notChecked, STATUS_LABEL[r.worst]]);
  }
  s1.getRow(1).font = { bold: true, size: 14 };
  s1.getRow(9).font = { bold: true };

  const s2 = wb.addWorksheet("Checks");
  s2.addRow(["Category", "Name", "Location", "Mode", "Status", "Health %", "Online", "Recording", "Note", "Verified"]);
  s2.getRow(1).font = { bold: true };
  for (const c of d.checks) {
    const m = (c.metrics ?? {}) as Record<string, unknown>;
    s2.addRow([
      CATEGORY_META[c.category].en, c.name, c.locationName ?? "", c.mode, STATUS_LABEL[c.status],
      c.healthPercent ?? "", typeof m.online === "string" ? m.online : "", typeof m.recording === "string" ? m.recording : "",
      c.note ?? "", c.verified ? "Yes" : "No",
    ]);
  }

  const s3 = wb.addWorksheet("Open Issues");
  s3.addRow(["Case", "Priority", "Status", "Subject", "Assignee", "Over SLA"]);
  s3.getRow(1).font = { bold: true };
  for (const i of d.issues) s3.addRow([i.caseNumber, i.priority, i.status, i.subject, i.assignee, i.overdue ? "Yes" : "No"]);

  return wb.xlsx.writeBuffer();
}

function toPdf(d: ReportData, font: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("thai", font);
    doc.font("thai");

    const W = doc.page.width - margin * 2;
    const bottom = doc.page.height - margin;
    const kpis = computeKpis(d.checks);
    const rollups = rollupByCategory(d.checks);
    const attention = exceptions(d.checks);

    const ensure = (h: number) => { if (doc.y + h > bottom) doc.addPage(); };
    const heading = (t: string) => {
      ensure(28);
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor("#111827").text(t, { width: W });
      doc.moveTo(margin, doc.y + 1).lineTo(margin + W, doc.y + 1).strokeColor("#d1d5db").stroke();
      doc.moveDown(0.4);
    };
    const line = (label: string, value: string, color = "#374151") => {
      ensure(14);
      doc.fontSize(9).fillColor("#6b7280").text(label, margin, doc.y, { width: 150, continued: true });
      doc.fillColor(color).text("  " + value, { width: W - 150 });
    };

    // Title
    doc.fontSize(18).fillColor("#111827").text("Daily IT Health Report", { width: W });
    doc.fontSize(10).fillColor("#6b7280").text(`${d.orgName} · ${fmtDate(d.reportDate)}`, { width: W });
    doc.fontSize(8).fillColor("#9ca3af").text(`Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, { width: W });

    heading("Executive Summary");
    doc.fontSize(22).fillColor(kpis.healthPercent >= 95 ? "#16a34a" : kpis.healthPercent >= 85 ? "#d97706" : "#dc2626")
      .text(`IT Infrastructure Health: ${kpis.healthPercent}%`, { width: W });
    doc.moveDown(0.3);
    line("Systems / Checked", `${kpis.total} / ${kpis.checked}`);
    line("Normal / Warning / Critical / Pending", `${kpis.normal} / ${kpis.warning} / ${kpis.critical} / ${kpis.notChecked}`);
    line("Open IT Issues / Over SLA", `${d.issues.length} / ${d.issues.filter((i) => i.overdue).length}`);
    line("Verified sign-offs", `${d.checks.filter((c) => c.verified).length} / ${d.checks.length}`);

    heading("System Health");
    for (const cat of CATEGORY_ORDER) {
      const r = rollups.find((x) => x.category === cat);
      if (!r) continue;
      const worst = STATUS_LABEL[r.worst];
      line(CATEGORY_META[cat].en, `${r.normal}/${r.total} normal` + (r.warning ? `, ${r.warning} warning` : "") + (r.critical ? `, ${r.critical} critical` : "") + `  [${worst}]`,
        r.worst === "CRITICAL" ? "#dc2626" : r.worst === "WARNING" ? "#d97706" : "#16a34a");
    }

    heading("Need Attention");
    if (attention.length === 0) {
      doc.fontSize(9).fillColor("#16a34a").text("Nothing abnormal.", { width: W });
    } else {
      for (const c of attention) {
        ensure(14);
        doc.fontSize(9).fillColor(c.status === "CRITICAL" ? "#dc2626" : "#d97706")
          .text(`${c.status === "CRITICAL" ? "🔴" : "🟡"} [${CATEGORY_META[c.category].en}] ${c.name}${c.locationName ? " · " + c.locationName : ""}${c.note ? " — " + c.note : ""}`, { width: W });
      }
    }

    heading("Open IT Issues");
    if (d.issues.length === 0) doc.fontSize(9).fillColor("#6b7280").text("No open cases.", { width: W });
    for (const i of d.issues.slice(0, 40)) {
      ensure(13);
      doc.fontSize(8.5).fillColor("#374151").text(`${i.caseNumber} [${i.priority}] ${i.status} — ${i.subject} · ${i.assignee}${i.overdue ? "  (OVER SLA)" : ""}`, { width: W });
    }

    heading("All Checks");
    for (const c of d.checks) {
      ensure(12);
      const m = (c.metrics ?? {}) as Record<string, unknown>;
      const extra = [typeof m.online === "string" ? "Online:" + m.online : "", typeof m.recording === "string" ? "REC:" + m.recording : ""].filter(Boolean).join(" ");
      doc.fontSize(8).fillColor("#4b5563").text(`${CATEGORY_META[c.category].en} · ${c.name} · ${STATUS_LABEL[c.status]}${c.healthPercent != null ? " " + c.healthPercent + "%" : ""}${extra ? " · " + extra : ""}${c.verified ? " · ✓verified" : ""}`, { width: W });
    }

    doc.moveDown(1);
    heading("IT Support Verification");
    doc.fontSize(9).fillColor("#374151").text("Prepared by IT Support · Verified sign-offs recorded in system.", { width: W });
    doc.moveDown(2);
    doc.fontSize(9).fillColor("#111827").text("Signature: ____________________________      Date: ______________", { width: W });

    doc.end();
  });
}

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("report:read");
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const dateParam = url.searchParams.get("date");
  const data = await loadData(user.organizationId, dateParam);
  const dateStr = data.reportDate.toISOString().slice(0, 10);

  await auditLog(user, { action: "EXPORT", entityType: "IT_HEALTH_REPORT", detail: { date: dateStr, format } });

  const common = { "Content-Disposition": `attachment; filename="IT-Daily-Report-${dateStr}.${format === "xlsx" ? "xlsx" : "pdf"}"` };

  if (format === "xlsx") {
    const buf = await toXlsx(data);
    return new NextResponse(buf, {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...common },
    });
  }

  const font = loadThaiFont();
  if (!font) return NextResponse.json({ error: "font_unavailable" }, { status: 500 });
  const buf = await toPdf(data, font);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", ...common } });
});
