/**
 * Decode the ERP access-matrix form's native checkboxes into a structured,
 * "selected only" shape shared by the submit action and the PDF export.
 */
import {
  ERP_MODULES, ERP_FLAGS, MARKETING_GROUPS, MARKETING_COLS, ROLE_COLS, SALES_ROLES, RENTAL_ROLES, TOP_DEPARTMENTS,
} from "./access-catalog";

const FLAG_LABEL: Record<string, string> = {
  enabled: "Enabled", notPrintable: "Not Printable", readOnly: "Read Only", notSaveAs: "Not Save As",
  admin: "Admin", editor: "Editor", viewer: "Viewer", createNew: "Create New Account",
};

export interface MatrixMenu { label: string; flags: string[] }
export interface MatrixModule { code: string; title: string; moduleAccess: boolean; menus: MatrixMenu[] }
export interface MatrixRoleRow { label: string; cols: string[] }
export interface DecodedMatrix {
  requester: Record<string, string>;
  departments: string[];
  modules: MatrixModule[];
  marketing: MatrixRoleRow[];
  sales: MatrixRoleRow[];
  rental: MatrixRoleRow[];
  hasAny: boolean;
}

export function decodeMatrix(fd: FormData): DecodedMatrix {
  const on = (k: string) => fd.get(k) === "on";
  const str = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };

  const requester: Record<string, string> = {};
  for (const k of ["refNo", "employeeCode", "startWork", "nameTh", "nameEn", "nickName", "phone", "email", "position", "department", "note"]) {
    requester[k] = str(k);
  }

  const departments = TOP_DEPARTMENTS.filter((_, i) => fd.getAll("departments").includes(TOP_DEPARTMENTS[i]));

  const modules: MatrixModule[] = [];
  for (const m of ERP_MODULES) {
    const items = m.sections.flatMap((s) => s.items);
    const menus: MatrixMenu[] = [];
    items.forEach((label, i) => {
      const flags = ERP_FLAGS.map((f) => f.key).filter((f) => on(`erp:${m.code}:${i}:${f}`)).map((f) => FLAG_LABEL[f]);
      if (flags.length) menus.push({ label, flags });
    });
    const moduleAccess = on(`module:${m.code}`);
    if (moduleAccess || menus.length) modules.push({ code: m.code, title: m.title, moduleAccess, menus });
  }

  const marketing: MatrixRoleRow[] = [];
  MARKETING_GROUPS.forEach((g, gi) => {
    g.rows.forEach((r, ri) => {
      const cols = MARKETING_COLS.map((c) => c.key).filter((c) => on(`mkt:${gi}:${ri}:${c}`)).map((c) => FLAG_LABEL[c]);
      if (cols.length) marketing.push({ label: `${g.title} — ${r.label}`, cols });
    });
  });

  const sales: MatrixRoleRow[] = [];
  SALES_ROLES.forEach((role, ri) => {
    const cols = ROLE_COLS.map((c) => c.key).filter((c) => on(`sales:${ri}:${c}`)).map((c) => FLAG_LABEL[c]);
    if (cols.length) sales.push({ label: role, cols });
  });

  const rental: MatrixRoleRow[] = [];
  RENTAL_ROLES.forEach((role, ri) => {
    const cols = ROLE_COLS.map((c) => c.key).filter((c) => on(`rental:${ri}:${c}`)).map((c) => FLAG_LABEL[c]);
    if (cols.length) rental.push({ label: role, cols });
  });

  const hasAny = modules.length > 0 || marketing.length > 0 || sales.length > 0 || rental.length > 0 || departments.length > 0;
  return { requester, departments, modules, marketing, sales, rental, hasAny };
}
