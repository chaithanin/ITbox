import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/confirm-button";
import type { CompanyLink } from "@/lib/signature";
import {
  createTemplateAction, updateTemplateAction, duplicateTemplateAction,
  setDefaultTemplateAction, deleteTemplateAction,
} from "./actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  created: { text: "สร้างเทมเพลตแล้ว / Template created" },
  updated: { text: "บันทึกการแก้ไขแล้ว / Template updated" },
  duplicated: { text: "ทำสำเนาแล้ว / Template duplicated" },
  default: { text: "ตั้งเป็นค่าเริ่มต้นแล้ว / Default set" },
  deleted: { text: "ลบเทมเพลตแล้ว / Template deleted" },
  invalid: { text: "ข้อมูลไม่ถูกต้อง / Invalid input", error: true },
  logo: { text: "Logo URL ไม่ถูกต้อง / Invalid logo URL", error: true },
  notfound: { text: "ไม่พบเทมเพลต / Not found", error: true },
};

function linksToText(links: unknown): string {
  if (!Array.isArray(links)) return "";
  return (links as CompanyLink[]).map((l) => `${l.name}|${l.url}`).join("\n");
}

export default async function SignatureAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requirePermission("support:settings");
  const sp = await searchParams;
  const msg = MESSAGES[sp.ok ?? sp.error ?? ""];

  const templates = await prisma.signatureTemplate.findMany({
    where: { organizationId: admin.organizationId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const editing = sp.edit ? templates.find((t) => t.id === sp.edit) ?? null : null;
  const formAction = editing ? updateTemplateAction.bind(null, editing.id) : createTemplateAction;

  return (
    <div>
      <PageHeader
        title="จัดการลายเซ็นอีเมล / Signature Management"
        description="สร้างและตั้งค่าเทมเพลต Branding สำหรับลายเซ็นอีเมลของทั้งองค์กร"
      />
      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      <Card className="mb-5">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">{editing ? `แก้ไข: ${editing.name}` : "สร้างเทมเพลตใหม่ / New Template"}</CardTitle>
          {editing && <Link href="/settings/signature" className="text-xs text-primary hover:underline">+ สร้างใหม่แทน / New instead</Link>}
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" key={editing?.id ?? "new"}>
            <div><Label htmlFor="name">ชื่อเทมเพลต / Name *</Label><Input id="name" name="name" required className="mt-1" defaultValue={editing?.name ?? "Chaithanin Executive"} /></div>
            <div><Label htmlFor="companyName">ชื่อบริษัท / Company</Label><Input id="companyName" name="companyName" className="mt-1" defaultValue={editing?.companyName ?? "Chaithanin Co.,Ltd."} /></div>
            <div><Label htmlFor="logoUrl">โลโก้ (URL)</Label><Input id="logoUrl" name="logoUrl" className="mt-1" placeholder="https://.../logo.png (เว้นว่าง = ใช้อักษรย่อ CHTNN)" defaultValue={editing?.logoUrl ?? ""} /></div>
            <div><Label htmlFor="primaryColor">สีหลัก / Primary</Label><Input id="primaryColor" name="primaryColor" className="mt-1" defaultValue={editing?.primaryColor ?? "#6E4030"} /></div>
            <div><Label htmlFor="secondaryColor">สีรอง / Secondary</Label><Input id="secondaryColor" name="secondaryColor" className="mt-1" defaultValue={editing?.secondaryColor ?? "#8B7B6E"} /></div>
            <div><Label htmlFor="fontFamily">ฟอนต์ / Font</Label><Input id="fontFamily" name="fontFamily" className="mt-1" defaultValue={editing?.fontFamily ?? "Arial, Helvetica, sans-serif"} /></div>
            <div><Label htmlFor="fontSize">ขนาดฟอนต์ / Size</Label><Input id="fontSize" name="fontSize" type="number" min={9} max={20} className="mt-1" defaultValue={editing?.fontSize ?? 13} /></div>
            <div>
              <Label htmlFor="dividerStyle">เส้นคั่น / Divider</Label>
              <Select id="dividerStyle" name="dividerStyle" className="mt-1" defaultValue={editing?.dividerStyle ?? "solid"}>
                <option value="solid">solid</option>
                <option value="dashed">dashed</option>
                <option value="none">none</option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={editing?.isDefault ?? false} /> ตั้งเป็นค่าเริ่มต้น / Default</label>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="defaultLinks">ลิงก์บริษัทเริ่มต้น / Default links (บรรทัดละ 1: ชื่อ|URL)</Label>
              <Textarea id="defaultLinks" name="defaultLinks" rows={4} className="mt-1 font-mono text-xs" defaultValue={editing ? linksToText(editing.defaultLinks) : "Marina Golden Bay Victoria Co.,Ltd.|https://chaithanin.com/properties/marina-golden-bay/\nMarina Golden Bay Elya Co., Ltd.|https://chaithanin.com/properties/marina-golden-bay/\nHarmonia City Garden Co.,Ltd.|https://chaithanin.com/properties/harmonia-city-garden/\nGlobal Top Group Co.,Ltd.|https://chaithanin.com/"} placeholder={"Global Top Group Co.,Ltd.|https://example.com (URL ไม่บังคับ)"} />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">{editing ? "บันทึกการแก้ไข / Save" : "สร้างเทมเพลต / Create"}</Button>
              {editing && <Button variant="outline" asChild><Link href="/settings/signature">ยกเลิก / Cancel</Link></Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เทมเพลต / Template</TableHead>
            <TableHead>สี / Colors</TableHead>
            <TableHead>ลิงก์ / Links</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">ยังไม่มีเทมเพลต — สร้างด้านบน (หน้าลายเซ็นของผู้ใช้จะใช้ค่าเริ่มต้นอัตโนมัติ)</TableCell></TableRow>
          )}
          {templates.map((t) => {
            const links = Array.isArray(t.defaultLinks) ? t.defaultLinks.length : 0;
            const setDef = setDefaultTemplateAction.bind(null, t.id);
            const dup = duplicateTemplateAction.bind(null, t.id);
            const del = deleteTemplateAction.bind(null, t.id);
            return (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.companyName ?? "-"} · {t.fontFamily.split(",")[0]} {t.fontSize}px</p>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: t.primaryColor }} /> {t.primaryColor}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{links} ลิงก์</TableCell>
                <TableCell>{t.isDefault ? <Badge variant="success">ค่าเริ่มต้น / Default</Badge> : <Badge variant="secondary">—</Badge>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" asChild><Link href={`/settings/signature?edit=${t.id}`}>แก้ไข</Link></Button>
                    <form action={dup}><Button type="submit" variant="outline" size="sm">ทำสำเนา</Button></form>
                    {!t.isDefault && (
                      <form action={setDef}><Button type="submit" variant="outline" size="sm">ตั้งค่าเริ่มต้น</Button></form>
                    )}
                    <form action={del}>
                      <ConfirmButton variant="outline" size="sm" confirmText="ลบเทมเพลตนี้?">ลบ</ConfirmButton>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
