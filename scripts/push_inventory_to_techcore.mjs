#!/usr/bin/env node
/**
 * Push the mapped IT asset register into TECHCORE via the inventory ingest API.
 * =============================================================================
 * Run this from a machine that can reach the TECHCORE service (your network).
 * It reads the two mapped workbooks and POSTs them, in batches, to
 * /api/inventory/ingest — authenticated by your org collector API key.
 *
 * The endpoint UPSERTS (assets by assetTag, licenses by softwareName), so this
 * script is idempotent: run it as many times as you like. Changed rows update
 * in place; unchanged rows stay put; new rows are created.
 *
 * Usage:
 *   TECHCORE_URL=https://<techcore-host>/api/inventory/ingest \
 *   TECHCORE_KEY=tck_xxxxxxxx \
 *   node scripts/push_inventory_to_techcore.mjs \
 *     TECHCORE_assets_import.xlsx TECHCORE_licenses_import.xlsx
 *
 * Defaults: URL -> https://itbox-ppjbzqdu3q-as.a.run.app/api/inventory/ingest
 *           files -> TECHCORE_assets_import.xlsx / TECHCORE_licenses_import.xlsx
 *           in the current directory.
 *
 * Requires: Node 18+ (global fetch) and the `exceljs` package
 *   (npm i exceljs   — or run from inside the TECHCORE repo, which has it).
 */
import ExcelJS from "exceljs";

const URL = process.env.TECHCORE_URL || "https://itbox-ppjbzqdu3q-as.a.run.app/api/inventory/ingest";
const KEY = process.env.TECHCORE_KEY;
const [assetsFile = "TECHCORE_assets_import.xlsx", licensesFile = "TECHCORE_licenses_import.xlsx"] = process.argv.slice(2);
const BATCH = 400;

if (!KEY) { console.error("ERROR: set TECHCORE_KEY (your org collector API key, tck_...)"); process.exit(1); }

async function readSheet(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = ws.getRow(1).values.slice(1).map((h) => String(h ?? "").trim());
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    const obj = {};
    let any = false;
    headers.forEach((h, i) => {
      let v = vals[i + 1];
      if (v && typeof v === "object" && "text" in v) v = v.text;
      if (v && typeof v === "object" && "result" in v) v = v.result;
      v = v == null ? "" : String(v).trim();
      if (v) any = true;
      obj[h] = v;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

async function post(payload) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

async function main() {
  const assetRows = await readSheet(assetsFile).catch((e) => { console.error(`Could not read ${assetsFile}: ${e.message}`); return []; });
  const licRows = await readSheet(licensesFile).catch(() => []);
  console.log(`Loaded ${assetRows.length} assets, ${licRows.length} licenses. Target: ${URL}`);

  const assets = assetRows.map((r) => ({
    assetTag: r.assetTag, name: r.name, serialNumber: r.serialNumber, brand: r.brand, model: r.model,
    specification: r.specification, category: r.category, department: r.department, location: r.location,
    status: r.status, condition: r.condition, notes: r.notes, assignedToName: r.assignedToName,
    ipAddress: r.ipAddress,
  }));
  const licenses = licRows.map((r) => ({
    softwareName: r.softwareName, licenseType: r.licenseType, totalSeats: Number(r.totalSeats) || 1,
    vendor: r.vendor, notes: r.notes,
  }));

  const totals = { aCreated: 0, aUpdated: 0, aLinked: 0, aFailed: 0, lCreated: 0, lUpdated: 0, lFailed: 0 };
  const batches = chunk(assets, BATCH);
  for (let i = 0; i < batches.length; i++) {
    // Send licenses with the first batch only.
    const payload = { assets: batches[i], licenses: i === 0 ? licenses : [], autoCreate: true };
    const res = await post(payload);
    totals.aCreated += res.assets.created; totals.aUpdated += res.assets.updated;
    totals.aLinked += res.assets.linkedToEmployee; totals.aFailed += res.assets.failed;
    if (i === 0 && res.licenses) { totals.lCreated += res.licenses.created; totals.lUpdated += res.licenses.updated; totals.lFailed += res.licenses.failed; }
    console.log(`batch ${i + 1}/${batches.length}: assets +${res.assets.created} ~${res.assets.updated} (linked ${res.assets.linkedToEmployee}, failed ${res.assets.failed})`);
    if (res.assets.errors?.length) console.log("  sample errors:", res.assets.errors.slice(0, 5));
  }
  if (batches.length === 0 && licenses.length) {
    const res = await post({ assets: [], licenses, autoCreate: true });
    totals.lCreated += res.licenses.created; totals.lUpdated += res.licenses.updated; totals.lFailed += res.licenses.failed;
  }

  console.log("\n==== DONE ====");
  console.log(`Assets:   created ${totals.aCreated}, updated ${totals.aUpdated}, linked-to-employee ${totals.aLinked}, failed ${totals.aFailed}`);
  console.log(`Licenses: created ${totals.lCreated}, updated ${totals.lUpdated}, failed ${totals.lFailed}`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
