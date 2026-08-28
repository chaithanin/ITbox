import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * Inventory ingest (assets + software licenses) — push model.
 * =========================================================
 * A machine inside the network POSTs the IT asset register here, authenticated
 * by the org collector API key (the same key used by the IT-report / EDR /
 * monitoring collectors). Records are UPSERTED so the push is idempotent and
 * safe to re-run: assets by (organization, assetTag), licenses by
 * (organization, softwareName). No mock data — everything comes from the body.
 *
 * Body:
 * {
 *   assets?: [{ assetTag, name, serialNumber?, brand?, model?, category?,
 *     department?, location?, status?, condition?, notes?, assignedToName?,
 *     ipAddress?, macAddress?, imei? }],
 *   licenses?: [{ softwareName, licenseType?, totalSeats?, vendor?, notes? }],
 *   autoCreate?: boolean   // create missing category/department/location/vendor (default true)
 * }
 */

const ASSET_STATUSES = new Set(["AVAILABLE", "ASSIGNED", "IN_USE", "IN_REPAIR", "LOST", "STOLEN", "DAMAGED", "RETIRED", "DISPOSED"]);
const ASSET_CONDITIONS = new Set(["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"]);
const LICENSE_TYPES = new Set(["PERPETUAL", "SUBSCRIPTION", "OEM", "VOLUME"]);
const MAX_ASSETS = 2000;
const MAX_LICENSES = 2000;

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function uniqueCode(name: string, prefix: string, taken: Set<string>): string {
  const base =
    name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) ||
    `${prefix}${Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000}`;
  let code = base, n = 1;
  while (taken.has(code.toUpperCase())) code = `${base.slice(0, 14)}-${++n}`;
  taken.add(code.toUpperCase());
  return code;
}

export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const b = body as { assets?: unknown[]; licenses?: unknown[]; autoCreate?: boolean };
  const assetsIn = Array.isArray(b.assets) ? b.assets : [];
  const licensesIn = Array.isArray(b.licenses) ? b.licenses : [];
  const autoCreate = b.autoCreate !== false;
  if (assetsIn.length > MAX_ASSETS) return NextResponse.json({ error: "too_many_assets", max: MAX_ASSETS }, { status: 400 });
  if (licensesIn.length > MAX_LICENSES) return NextResponse.json({ error: "too_many_licenses", max: MAX_LICENSES }, { status: 400 });
  if (assetsIn.length === 0 && licensesIn.length === 0) return NextResponse.json({ error: "empty_payload" }, { status: 400 });

  const orgWhere = { organizationId: orgId, deletedAt: null };
  const [categories, departments, locations, vendors, employees] = await Promise.all([
    prisma.assetCategory.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: orgWhere, select: { id: true, code: true, name: true } }),
    prisma.location.findMany({ where: orgWhere, select: { id: true, code: true, name: true } }),
    prisma.vendor.findMany({ where: orgWhere, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: orgWhere, select: { id: true, firstName: true, lastName: true } }),
  ]);

  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const locByName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));
  const deptCodes = new Set(departments.map((d) => d.code.toUpperCase()));
  const locCodes = new Set(locations.map((l) => l.code.toUpperCase()));

  const empByFull = new Map<string, string>();
  const empByFirst = new Map<string, string>();
  for (const e of employees) {
    empByFull.set(`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e.id);
    const f = e.firstName.trim().toLowerCase();
    if (f && !empByFirst.has(f)) empByFirst.set(f, e.id);
  }
  const resolveEmployee = (name: string): string | null => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return empByFull.get(n) ?? empByFirst.get(n) ?? null;
  };

  // Pre-create referenced category / department / location / vendor (when autoCreate)
  if (autoCreate) {
    const wantCat = new Set<string>(), wantDept = new Set<string>(), wantLoc = new Set<string>(), wantVendor = new Set<string>();
    for (const raw of assetsIn) {
      const a = raw as Record<string, unknown>;
      const c = str(a.category); if (c && !catByName.has(c.toLowerCase())) wantCat.add(c);
      const d = str(a.department); if (d && !deptByName.has(d.toLowerCase())) wantDept.add(d);
      const l = str(a.location); if (l && !locByName.has(l.toLowerCase())) wantLoc.add(l);
    }
    for (const raw of licensesIn) {
      const v = str((raw as Record<string, unknown>).vendor);
      if (v && !vendorByName.has(v.toLowerCase())) wantVendor.add(v);
    }
    for (const name of wantCat) { const c = await prisma.assetCategory.create({ data: { organizationId: orgId, name } }); catByName.set(name.toLowerCase(), c.id); }
    for (const name of wantDept) { const d = await prisma.department.create({ data: { organizationId: orgId, name, code: uniqueCode(name, "DEPT", deptCodes) } }); deptByName.set(name.toLowerCase(), d.id); }
    for (const name of wantLoc) { const l = await prisma.location.create({ data: { organizationId: orgId, name, code: uniqueCode(name, "LOC", locCodes) } }); locByName.set(name.toLowerCase(), l.id); }
    for (const name of wantVendor) { const v = await prisma.vendor.create({ data: { organizationId: orgId, name } }); vendorByName.set(name.toLowerCase(), v.id); }
  }

  // ---- Assets ----
  let assetsCreated = 0, assetsUpdated = 0, assetsLinked = 0;
  const assetErrors: { assetTag: string; error: string }[] = [];
  for (const raw of assetsIn) {
    const a = raw as Record<string, unknown>;
    const assetTag = str(a.assetTag, 100);
    const name = str(a.name, 300);
    if (!assetTag) { assetErrors.push({ assetTag: "(blank)", error: "assetTag required" }); continue; }
    if (!name) { assetErrors.push({ assetTag, error: "name required" }); continue; }

    const status = ASSET_STATUSES.has(str(a.status).toUpperCase()) ? str(a.status).toUpperCase() : "AVAILABLE";
    const condition = ASSET_CONDITIONS.has(str(a.condition).toUpperCase()) ? str(a.condition).toUpperCase() : "GOOD";
    const categoryId = catByName.get(str(a.category).toLowerCase()) ?? null;
    const departmentId = deptByName.get(str(a.department).toLowerCase()) ?? null;
    const locationId = locByName.get(str(a.location).toLowerCase()) ?? null;
    const assignedName = str(a.assignedToName, 200);
    const assignedToId = resolveEmployee(assignedName);
    if (assignedToId) assetsLinked++;

    const data = {
      name,
      serialNumber: str(a.serialNumber, 200) || null,
      brand: str(a.brand, 100) || null,
      model: str(a.model, 200) || null,
      specification: str(a.specification, 1000) || null,
      status: status as never,
      condition: condition as never,
      categoryId, departmentId, locationId,
      assignedToId: assignedToId ?? null,
      custodian: assignedName || null,
      notes: str(a.notes, 2000) || null,
      ipAddress: str(a.ipAddress, 100) || null,
      macAddress: str(a.macAddress, 100) || null,
      imei: str(a.imei, 100) || null,
    };

    try {
      const existing = await prisma.asset.findUnique({
        where: { organizationId_assetTag: { organizationId: orgId, assetTag } },
        select: { id: true },
      });
      if (existing) {
        await prisma.asset.update({ where: { id: existing.id }, data });
        assetsUpdated++;
      } else {
        const created = await prisma.asset.create({ data: { organizationId: orgId, assetTag, ...data } });
        await prisma.assetHistory.create({
          data: { organizationId: orgId, assetId: created.id, action: "REGISTER", detail: "Inventory ingest (API)" },
        }).catch(() => {});
        assetsCreated++;
      }
    } catch {
      assetErrors.push({ assetTag, error: "upsert_failed" });
    }
  }

  // ---- Licenses (upsert by softwareName) ----
  let licCreated = 0, licUpdated = 0;
  const licErrors: { softwareName: string; error: string }[] = [];
  for (const raw of licensesIn) {
    const l = raw as Record<string, unknown>;
    const softwareName = str(l.softwareName, 300);
    if (!softwareName) { licErrors.push({ softwareName: "(blank)", error: "softwareName required" }); continue; }
    const licenseType = LICENSE_TYPES.has(str(l.licenseType).toUpperCase()) ? str(l.licenseType).toUpperCase() : null;
    const seatsNum = Number(l.totalSeats);
    const totalSeats = Number.isInteger(seatsNum) && seatsNum >= 1 && seatsNum <= 1_000_000 ? seatsNum : 1;
    const vendorId = vendorByName.get(str(l.vendor).toLowerCase()) ?? null;
    const data = { licenseType, totalSeats, vendorId, notes: str(l.notes, 2000) || null };
    try {
      const existing = await prisma.license.findFirst({
        where: { organizationId: orgId, softwareName, deletedAt: null },
        select: { id: true },
      });
      if (existing) { await prisma.license.update({ where: { id: existing.id }, data }); licUpdated++; }
      else { await prisma.license.create({ data: { organizationId: orgId, softwareName, ...data } }); licCreated++; }
    } catch {
      licErrors.push({ softwareName, error: "upsert_failed" });
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      action: "IMPORT",
      entityType: "ASSET",
      detail: {
        via: "inventory-ingest",
        assetsCreated, assetsUpdated, assetsLinked, assetsFailed: assetErrors.length,
        licCreated, licUpdated, licFailed: licErrors.length,
      },
    },
  }).catch(() => {});

  return NextResponse.json({
    assets: { created: assetsCreated, updated: assetsUpdated, linkedToEmployee: assetsLinked, failed: assetErrors.length, errors: assetErrors.slice(0, 100) },
    licenses: { created: licCreated, updated: licUpdated, failed: licErrors.length, errors: licErrors.slice(0, 100) },
  });
}
