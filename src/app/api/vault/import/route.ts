import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission, AuthError } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { createVaultItem, type VaultItemInput } from "@/lib/services/vault";
import type { VaultItemType, SecretClassification } from "@prisma/client";

/**
 * Bulk import of vault secrets (admin, vault:manage). Accepts CSV or XLSX.
 * Each row is encrypted server-side with a fresh DEK wrapped by Cloud KMS —
 * plaintext is never stored, logged, or echoed back. There is deliberately no
 * matching export endpoint. Import is audited (metadata only).
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DATA_ROWS = 5000;
const MAX_ERRORS_RETURNED = 500;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TYPES: VaultItemType[] = [
  "PASSWORD", "SERVER", "DATABASE", "API_KEY", "SSH_KEY", "WIFI",
  "NETWORK_DEVICE", "CERTIFICATE", "LICENSE_KEY", "TOKEN", "OTHER",
];
const CLASSIFICATIONS: SecretClassification[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Recognized columns (case-insensitive; secret-bearing columns handled below)
const COLUMNS = [
  "name", "category", "type", "classification", "environment",
  "username", "url", "host", "port", "protocol", "tags", "notes",
  "password", "apikey", "token", "sshprivatekey", "sshpublickey", "certificate",
] as const;

const TEMPLATE_HEADERS = [
  "name", "category", "type", "classification", "environment",
  "username", "url", "host", "port", "protocol", "tags", "notes", "password",
];
const TEMPLATE_EXAMPLE = [
  "Production Server — Windows Admin", "Server", "SERVER", "HIGH", "Production",
  "administrator", "", "10.0.0.10", "3389", "RDP", "prod,windows",
  "primary domain controller", "REPLACE-WITH-REAL-PASSWORD",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Minimal RFC-4180 CSV parser (handles quotes, doubled quotes, CRLF, BOM)
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    // ExcelJS row.values is 1-indexed with a leading undefined
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      cells.push(
        v === null || v === undefined
          ? ""
          : typeof v === "object"
            ? String((v as { text?: string; result?: unknown }).text ??
                (v as { result?: unknown }).result ?? "")
            : String(v)
      );
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  });
  return rows;
}

interface RowError { row: number; name: string; error: string }

export const GET = apiHandler(async () => {
  await requirePermission("vault:manage");
  const header = TEMPLATE_HEADERS.map(csvCell).join(",");
  const example = TEMPLATE_EXAMPLE.map(csvCell).join(",");
  const csv = "﻿" + header + "\r\n" + example + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vault-import-template.csv"',
    },
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("vault:manage");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;

  let rows: string[][];
  try {
    rows = isXlsx ? await parseXlsx(buffer) : parseCsv(buffer.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  // Map header columns (case-insensitive, ignoring spaces/underscores)
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const header = rows[0].map(norm);
  const colIndex: Partial<Record<(typeof COLUMNS)[number], number>> = {};
  for (const col of COLUMNS) {
    const idx = header.indexOf(col);
    if (idx !== -1) colIndex[col] = idx;
  }
  if (colIndex.name === undefined) {
    return NextResponse.json({ error: "missing_name_column" }, { status: 400 });
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return NextResponse.json({ error: "too_many_rows" }, { status: 400 });
  }

  // Prefetch existing categories (case-insensitive) so we can resolve/create
  const existingCats = await prisma.vaultCategory.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));

  const get = (r: string[], col: (typeof COLUMNS)[number]): string => {
    const i = colIndex[col];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  const errors: RowError[] = [];
  let created = 0;

  for (let n = 0; n < dataRows.length; n++) {
    const r = dataRows[n];
    const rowNo = n + 2; // 1-based + header
    const name = get(r, "name");
    if (!name) {
      // silently skip fully-blank rows; report rows that have data but no name
      if (r.some((c) => (c ?? "").trim() !== "")) {
        errors.push({ row: rowNo, name: "", error: "name is required / ต้องระบุ name" });
      }
      continue;
    }

    try {
      // Resolve or create category
      let categoryId: string | null = null;
      const catName = get(r, "category");
      if (catName) {
        const key = catName.toLowerCase();
        categoryId = catByName.get(key) ?? null;
        if (!categoryId) {
          const cat = await prisma.vaultCategory.create({
            data: { organizationId: user.organizationId, name: catName },
          });
          categoryId = cat.id;
          catByName.set(key, cat.id);
        }
      }

      const typeRaw = get(r, "type").toUpperCase().replace(/[\s-]+/g, "_");
      const type = (TYPES as string[]).includes(typeRaw)
        ? (typeRaw as VaultItemType)
        : "PASSWORD";
      const clsRaw = get(r, "classification").toUpperCase();
      const classification = (CLASSIFICATIONS as string[]).includes(clsRaw)
        ? (clsRaw as SecretClassification)
        : "MEDIUM";

      const portRaw = get(r, "port");
      const port = portRaw && /^\d+$/.test(portRaw) ? Number(portRaw) : null;
      const tagsRaw = get(r, "tags");
      const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) : [];

      const secret: VaultItemInput["secret"] = {};
      if (get(r, "password")) secret.password = get(r, "password");
      if (get(r, "apikey")) secret.apiKey = get(r, "apikey");
      if (get(r, "token")) secret.token = get(r, "token");
      if (get(r, "sshprivatekey")) secret.sshPrivateKey = get(r, "sshprivatekey");
      if (get(r, "sshpublickey")) secret.sshPublicKey = get(r, "sshpublickey");
      if (get(r, "certificate")) secret.certificate = get(r, "certificate");

      if (Object.keys(secret).length === 0) {
        errors.push({ row: rowNo, name, error: "no secret value / ไม่มีข้อมูลลับ (password/apiKey/…)" });
        continue;
      }

      await createVaultItem(user, {
        name: name.slice(0, 200),
        type,
        classification,
        categoryId,
        departmentId: null,
        environment: get(r, "environment") || null,
        url: get(r, "url") || null,
        host: get(r, "host") || null,
        port,
        protocol: get(r, "protocol") || null,
        username: get(r, "username") || null,
        tags,
        notes: get(r, "notes") || null,
        rotationDays: null,
        expiresAt: null,
        requireMfaToReveal: classification === "HIGH" || classification === "CRITICAL",
        requireApprovalToReveal: false,
        secret,
      });
      created++;
    } catch (e) {
      if (e instanceof AuthError) throw e; // permission problems bubble up
      errors.push({ row: rowNo, name, error: "import failed / นำเข้าไม่สำเร็จ" });
    }
  }

  await auditLog(user, {
    action: "IMPORT",
    entityType: "VAULT_ITEM",
    detail: { created, failed: errors.length, fileName: file.name.slice(0, 200) },
  });

  return NextResponse.json({
    created,
    failed: errors.length,
    errors: errors.slice(0, MAX_ERRORS_RETURNED),
  });
});
