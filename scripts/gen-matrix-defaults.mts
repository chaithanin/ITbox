/**
 * One-off generator: builds src/lib/documents/matrix-default-profiles.ts from the
 * recommended RBAC matrix workbook (exported to scratchpad JSON) + the real
 * access-catalog. Emits, per profile, the exact set of form checkbox NAMES to
 * tick so the access-request form can pre-fill a recommended default.
 *
 * Run:  npx tsx scripts/gen-matrix-defaults.mts <matrix.json> <profiles.json> <out.ts>
 */
import fs from "node:fs";
import {
  ERP_MODULES, MARKETING_GROUPS, SALES_ROLES, RENTAL_ROLES,
} from "../src/lib/documents/access-catalog";

const [matrixPath, profilesPath, outPath] = process.argv.slice(2);
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
  profiles: string[];
  rows: { module: string; section: string; item: string; perm: Record<string, string> }[];
};
const profileMeta = JSON.parse(fs.readFileSync(profilesPath, "utf8")) as {
  code: string; name: string; department: string; scope: string; principle: string;
}[];

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9฀-๿]+/g, "");
// English portion before the first slash, normalized — best key for ERP items.
const engKey = (s: string) => norm((s || "").split("/")[0]);

// ---- module number ("01".."15") -> catalog code, by ERP_MODULES order ----
const moduleByNum = new Map<string, (typeof ERP_MODULES)[number]>();
ERP_MODULES.forEach((m, i) => moduleByNum.set(String(i + 1).padStart(2, "0"), m));
const flatItems = (m: (typeof ERP_MODULES)[number]) => m.sections.flatMap((s) => s.items);

function modNum(moduleLabel: string): string | null {
  const mm = moduleLabel.match(/^(\d{2})\b/);
  return mm ? mm[1] : null;
}

const ERP_FLAG = (code: string): string[] => {
  switch (code) {
    case "V": return ["enabled", "readOnly"];
    case "E": case "A": case "T": return ["enabled"];
    default: return [];
  }
};
const MKT_COL = (code: string): string | null => {
  switch (code) {
    case "A": case "T": return "admin";
    case "E": return "editor";
    case "V": return "viewer";
    default: return null;
  }
};

// Group xlsx rows by module label (preserve order).
const byModule = new Map<string, typeof matrix.rows>();
for (const r of matrix.rows) (byModule.get(r.module) ?? byModule.set(r.module, []).get(r.module)!).push(r);

// Marketing catalog flattened with group/row indices.
const mktFlat: { gi: number; ri: number; group: string; label: string }[] = [];
MARKETING_GROUPS.forEach((g, gi) => g.rows.forEach((row, ri) =>
  mktFlat.push({ gi, ri, group: g.title, label: row.label })));

const salesIdx = new Map<string, number>();
SALES_ROLES.forEach((r, i) => salesIdx.set(norm(r), i));
const rentalIdx = new Map<string, number>();
RENTAL_ROLES.forEach((r, i) => rentalIdx.set(engKey(r), i));

const warnings: string[] = [];
const result: Record<string, string[]> = {};
for (const p of matrix.profiles) result[p] = [];

// Marketing group order in the workbook == catalog group order (13 groups); the
// group boundary is the xlsx "section". Build an ordered list of group titles as
// they appear, mapped to catalog group index by position.
const mktSectionsSeen: string[] = [];
for (const r of matrix.rows) {
  if (!/Online Marketing/i.test(r.module)) continue;
  if (!mktSectionsSeen.includes(r.section)) mktSectionsSeen.push(r.section);
}

for (const [moduleLabel, rows] of byModule) {
  // ---- ERP modules 01..15 ----
  const num = modNum(moduleLabel);
  const erpMod = num ? moduleByNum.get(num) : undefined;
  if (erpMod) {
    const items = flatItems(erpMod);
    // Try label match; fall back to positional (counts are equal & same source).
    rows.forEach((r, pos) => {
      let idx = items.findIndex((it) => engKey(it) === engKey(r.item));
      if (idx < 0) idx = items.findIndex((it) => norm(it).startsWith(engKey(r.item)) || engKey(it).startsWith(engKey(r.item)));
      if (idx < 0) { idx = pos; warnings.push(`ERP ${erpMod.code} positional fallback: "${r.item.slice(0, 30)}"`); }
      for (const [prof, code] of Object.entries(r.perm)) {
        const flags = ERP_FLAG(code);
        if (!flags.length) continue;
        for (const f of flags) result[prof].push(`erp:${erpMod.code}:${idx}:${f}`);
      }
    });
    // module:{code} when the profile has any non-N menu in this module.
    for (const prof of matrix.profiles) {
      if (rows.some((r) => ["V", "E", "A", "T"].includes(r.perm[prof]))) {
        result[prof].push(`module:${erpMod.code}`);
      }
    }
    continue;
  }

  // ---- 16 Online Marketing ----
  if (/Online Marketing/i.test(moduleLabel)) {
    for (const r of rows) {
      const gi = mktSectionsSeen.indexOf(r.section);
      // Match within the catalog group by normalized label.
      const cand = mktFlat.filter((m) => m.gi === gi);
      let hit = cand.find((m) => norm(m.label) === norm(r.item));
      if (!hit) hit = cand.find((m) => norm(m.label).includes(norm(r.item)) || norm(r.item).includes(norm(m.label)));
      if (!hit) { warnings.push(`MKT no match g${gi} "${r.item.slice(0, 30)}"`); continue; }
      for (const [prof, code] of Object.entries(r.perm)) {
        const col = MKT_COL(code);
        if (col) result[prof].push(`mkt:${hit.gi}:${hit.ri}:${col}`);
      }
    }
    continue;
  }

  // ---- 17 Sales (Venio) / 18 Rental (Horganice): "R" assigns the role ----
  const isSales = /Sales Permission|Venio/i.test(moduleLabel);
  const isRental = /Rental Permission|Horganice/i.test(moduleLabel);
  if (isSales || isRental) {
    for (const r of rows) {
      const ri = isSales ? salesIdx.get(norm(r.item)) : rentalIdx.get(engKey(r.item));
      if (ri === undefined) { warnings.push(`${isSales ? "SALES" : "RENTAL"} no role match "${r.item}"`); continue; }
      const isAdminRole = /^(admin|management)$/i.test(r.item.trim());
      const col = isAdminRole ? "admin" : "editor";
      const prefix = isSales ? "sales" : "rental";
      for (const [prof, code] of Object.entries(r.perm)) {
        if (code === "R") result[prof].push(`${prefix}:${ri}:${col}`);
      }
    }
    continue;
  }

  warnings.push(`Unmapped module: ${moduleLabel}`);
}

// De-dup + stable order.
for (const k of Object.keys(result)) result[k] = [...new Set(result[k])].sort();

const profilesOut = profileMeta.map((p) => ({
  code: p.code, name: p.name, department: p.department, scope: p.scope,
}));

const header = `/**
 * Recommended DEFAULT permission profiles for the Information-System Access
 * Request form (form 4.A). GENERATED from GTG_Permission_Matrix_Recommended.xlsx
 * by scripts/gen-matrix-defaults.mts — do not edit by hand; re-run the generator.
 *
 * Each profile maps to the exact set of form checkbox names to tick. This is a
 * DOCUMENT default only (pre-fills the request form); it grants no real access.
 * Access codes were mapped: V→Enabled+ReadOnly, E/A/T→Enabled (ERP);
 * A/T→Admin, E→Editor, V→Viewer (Marketing); R→role (Venio/Horganice).
 */

export interface MatrixProfile { code: string; name: string; department: string; scope: string }

export const MATRIX_PROFILES: MatrixProfile[] = ${JSON.stringify(profilesOut, null, 2)};

/** profile code → list of form checkbox \`name\`s to check. */
export const PROFILE_DEFAULT_SELECTIONS: Record<string, string[]> = ${JSON.stringify(result, null, 0)};
`;

fs.writeFileSync(outPath, header);
console.log("WROTE", outPath);
console.log("profiles:", profilesOut.length);
for (const p of matrix.profiles) console.log("  ", p, "→", result[p].length, "checkboxes");
if (warnings.length) {
  console.log("\nWARNINGS (", warnings.length, "):");
  for (const w of [...new Set(warnings)]) console.log("  -", w);
} else {
  console.log("\nNo warnings — every row matched by label.");
}
