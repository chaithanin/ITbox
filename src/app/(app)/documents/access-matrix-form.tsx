import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaffIdField } from "./staff-id-field";
import { MatrixPresets } from "./matrix-presets";
import { MatrixProfilePicker } from "./matrix-profile-picker";
import { MatrixPrintFilter } from "./matrix-print-filter";
import { submitAccessMatrix } from "./access-actions";
import {
  ERP_MODULES, ERP_FLAGS, TOP_DEPARTMENTS,
  MARKETING_GROUPS, MARKETING_COLS, ROLE_COLS, SALES_ROLES, RENTAL_ROLES,
} from "@/lib/documents/access-catalog";

const th = "border px-2 py-1 text-center text-[11px] font-semibold";
const td = "border px-2 py-1 align-top text-xs";
const cbCell = "border px-2 py-1 text-center";

function Field({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input name={name} placeholder={placeholder} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}

export function AccessMatrixForm({ defaults }: { defaults?: { name?: string } }) {
  return (
    <form action={submitAccessMatrix} className="space-y-4">
      <MatrixPrintFilter />
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-sm text-muted-foreground">กรอกข้อมูลผู้ขอ เลือกสิทธิ์รายเมนู แล้วกด “พิมพ์ / Print” หรือ “ส่งคำขอ” — เอกสารที่พิมพ์จะแสดงเฉพาะสิทธิ์ที่เลือก</p>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" formAction="/api/doc-forms/access-matrix-pdf" formMethod="post" formTarget="_blank">บันทึก PDF (เฉพาะที่เลือก)</Button>
          <Button type="submit" formAction="/api/doc-forms/access-matrix-pdf" formMethod="post" formTarget="_blank">พิมพ์ / Print</Button>
          <Button type="submit">ส่งคำขอ / Submit</Button>
        </div>
      </div>

      {/* Requester info (from master form 4.A) */}
      <Card className="print-avoid-break">
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold">1. สำหรับผู้ขอสิทธิ์ / Requester Information</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field name="refNo" label="Ref No" />
            <StaffIdField name="employeeCode" label="รหัสพนักงาน / Staff ID" />
            <Field name="startWork" label="เริ่มงาน / Start work (dd/mm/yyyy)" />
            <Field name="nameTh" label="ชื่อ-สกุลภาษาไทย (นาย/นาง/นางสาว)" />
            <Field name="nameEn" label="ชื่อ-สกุลภาษาอังกฤษ (Mr./Mrs./Ms.)" />
            <Field name="nickName" label="ชื่อเล่น / Nickname" />
            <Field name="phone" label="เบอร์โทรศัพท์ / Phone No" />
            <Field name="email" label="อีเมล / Email" />
            <Field name="position" label="ตำแหน่ง / Position" />
            <Field name="department" label="แผนก / Department" />
            <label className="text-xs sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-muted-foreground">หมายเหตุ / Note</span>
              <input name="note" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs text-muted-foreground">แผนกที่เกี่ยวข้อง / Departments</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {TOP_DEPARTMENTS.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="departments" value={d} className="h-3.5 w-3.5" /> {d}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ERP modules */}
      <p className="text-sm font-semibold">สิทธิ์การใช้งานรายเมนู (ERP) / Per-menu Permissions</p>
      <MatrixProfilePicker />
      <MatrixPresets />
      {ERP_MODULES.map((m) => {
        let idx = -1;
        return (
          <details key={m.code} className="rounded-lg border bg-card print-avoid-break" open>
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm font-semibold">
              <span>{m.title}</span>
              <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <input type="checkbox" name={`module:${m.code}`} className="h-4 w-4" /> เข้าใช้งาน Module นี้
              </label>
            </summary>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>เมนูการใช้งาน / Menu</th>
                    {ERP_FLAGS.map((f) => <th key={f.key} className={th}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {m.sections.map((s) => (
                    <>
                      <tr key={`${m.code}-${s.title}`}>
                        <td className="border bg-muted/40 px-2 py-1 text-[11px] font-semibold" colSpan={1 + ERP_FLAGS.length}>{s.title}</td>
                      </tr>
                      {s.items.map((item) => {
                        idx++;
                        const i = idx;
                        return (
                          <tr key={`${m.code}-${i}`}>
                            <td className={td}>{item}</td>
                            {ERP_FLAGS.map((f) => (
                              <td key={f.key} className={cbCell}><input type="checkbox" name={`erp:${m.code}:${i}:${f.key}`} className="h-4 w-4" /></td>
                            ))}
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      {/* Online Marketing */}
      <details className="rounded-lg border bg-card print-avoid-break" open>
        <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">Online Marketing Permission / สิทธิ์การตลาดออนไลน์</summary>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} text-left`}>เมนูการใช้งาน / Menu</th>
                {MARKETING_COLS.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {MARKETING_GROUPS.map((g, gi) => (
                <>
                  <tr key={`mg-${gi}`}><td className="border bg-muted/40 px-2 py-1 text-[11px] font-semibold" colSpan={1 + MARKETING_COLS.length}>{g.title}</td></tr>
                  {g.rows.map((r, ri) => (
                    <tr key={`mr-${gi}-${ri}`}>
                      <td className={td}>{r.label}</td>
                      {MARKETING_COLS.map((c) => (
                        <td key={c.key} className={cbCell}>
                          {c.key === "createNew" && r.noCreate ? <span className="text-muted-foreground">–</span> : <input type="checkbox" name={`mkt:${gi}:${ri}:${c.key}`} className="h-4 w-4" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Sales (Venio) + Rental (Horganice) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <details className="rounded-lg border bg-card print-avoid-break" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">Sales Permission / Venio CRM</summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full border-collapse">
              <thead><tr><th className={`${th} text-left`}>บทบาท / Role</th>{ROLE_COLS.map((c) => <th key={c.key} className={th}>{c.label}</th>)}</tr></thead>
              <tbody>
                {SALES_ROLES.map((role, ri) => (
                  <tr key={`s-${ri}`}><td className={td}>{role}</td>{ROLE_COLS.map((c) => <td key={c.key} className={cbCell}><input type="checkbox" name={`sales:${ri}:${c.key}`} className="h-4 w-4" /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="rounded-lg border bg-card print-avoid-break" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">Rental Permission / Horganice</summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full border-collapse">
              <thead><tr><th className={`${th} text-left`}>บทบาท / Role</th>{ROLE_COLS.map((c) => <th key={c.key} className={th}>{c.label}</th>)}</tr></thead>
              <tbody>
                {RENTAL_ROLES.map((role, ri) => (
                  <tr key={`r-${ri}`}><td className={td}>{role}</td>{ROLE_COLS.map((c) => <td key={c.key} className={cbCell}><input type="checkbox" name={`rental:${ri}:${c.key}`} className="h-4 w-4" /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Signatures (matches master form) */}
      <Card className="print-avoid-break">
        <CardContent className="grid gap-8 p-6 sm:grid-cols-2">
          <div className="text-center text-xs">
            <p>ลงชื่อ /Sign ..............................................</p>
            <p className="mt-3">(........................................................)</p>
            <p className="mt-2 text-muted-foreground">DD/MM/YYYY .............................</p>
            <p className="mt-1 font-medium">ผู้ขอสิทธิ์ใช้งาน / License Requester</p>
          </div>
          <div className="text-center text-xs">
            <p>ลงชื่อ /Sign ..............................................</p>
            <p className="mt-3">(........................................................)</p>
            <p className="mt-2 text-muted-foreground">DD/MM/YYYY .............................</p>
            <p className="mt-1 font-medium">ผู้จัดการแผนก / Department Manager</p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p>(1) ผู้ดูแลระบบจะตรวจสอบและเปิดสิทธิ์ภายใน 3 วันทำการ / The administrator will verify and activate within 3 working days.</p>
        <p>(2) ผู้ขอสิทธิ์ต้องยืนยันตัวตนก่อนการเข้าใช้งานทุกครั้ง / The requester must verify identity before each access.</p>
        <p>(3) สิทธิ์ใช้งานมีอายุไม่เกิน 1 ปีนับจากวันยื่นขอ หากต้องการใช้ต่อกรุณายื่นใหม่ / Access is valid up to 1 year; re-apply to continue.</p>
      </div>

      <div className="flex justify-end gap-2 no-print">
        <Button type="submit" variant="outline" formAction="/api/doc-forms/access-matrix-pdf" formMethod="post" formTarget="_blank">พิมพ์ / บันทึก PDF (เฉพาะที่เลือก)</Button>
        <Button type="submit">ส่งคำขอ / Submit</Button>
      </div>
      {defaults?.name && <input type="hidden" value={defaults.name} readOnly name="_requestedBy" />}
    </form>
  );
}
