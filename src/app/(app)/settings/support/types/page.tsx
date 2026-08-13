import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ConfirmButton } from "@/components/confirm-button";
import { createCaseType, toggleCaseType, deleteCaseType } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  "type-created": "สร้างประเภทเคสแล้ว / Case type created",
  "type-updated": "บันทึกแล้ว / Saved",
  "type-deleted": "ลบแล้ว / Deleted",
};
const ERR: Record<string, string> = {
  "invalid-input": "ข้อมูลไม่ถูกต้อง (key ต้องเป็นตัวพิมพ์ใหญ่, prefix 2-4 ตัวอักษร) / Invalid input",
  "key-exists": "มี key นี้อยู่แล้ว / Key already exists",
  "not-found": "ไม่พบรายการ / Not found",
  "system-type": "ประเภทของระบบลบไม่ได้ (ปิดใช้งานได้เท่านั้น) / System type cannot be deleted",
};

export default async function CaseTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;

  const types = await prisma.caseType.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="ประเภทเคส / Case Types"
        description="INCIDENT, SERVICE_REQUEST, ACCESS... รหัสนำหน้าใช้สร้างเลขเคส (IT-INC-2026-000001)"
      >
        <Button asChild variant="outline">
          <Link href="/settings/support">← กลับ / Back</Link>
        </Button>
      </PageHeader>

      {sp.ok && OK[sp.ok] && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {OK[sp.ok]}
        </div>
      )}
      {sp.error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERR[sp.error] ?? sp.error}
        </div>
      )}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="text-base">เพิ่มประเภทเคส / Add case type</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCaseType} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="key">Key (ตัวพิมพ์ใหญ่)</Label>
              <Input id="key" name="key" placeholder="INCIDENT" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prefix">Prefix (2-4 ตัว)</Label>
              <Input id="prefix" name="prefix" placeholder="INC" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">ลำดับ / Sort</Label>
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} min={0} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameTh">ชื่อ (ไทย) / Name TH</Label>
              <Input id="nameTh" name="nameTh" placeholder="เหตุขัดข้อง" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ (อังกฤษ) / Name EN</Label>
              <Input id="name" name="name" placeholder="Incident" required />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked
                  className="h-4 w-4 rounded border-input"
                />
                ใช้งาน / Active
              </label>
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="description">คำอธิบาย / Description</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit">เพิ่ม / Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prefix</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>ลำดับ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                ยังไม่มีประเภทเคส / No case types yet
              </TableCell>
            </TableRow>
          )}
          {types.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <span className="font-mono text-xs font-semibold">{t.prefix}</span>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {t.key}
                {t.isSystem && (
                  <Badge variant="secondary" className="ml-2">
                    ระบบ / System
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium">{t.nameTh ?? t.name}</div>
                {t.nameTh && <div className="text-xs text-muted-foreground">{t.name}</div>}
              </TableCell>
              <TableCell className="tabular-nums">{t.sortOrder}</TableCell>
              <TableCell>
                {t.active ? (
                  <Badge variant="success">ใช้งาน / Active</Badge>
                ) : (
                  <Badge variant="secondary">ปิด / Inactive</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/settings/support/types/${t.id}/edit`}>แก้ไข / Edit</Link>
                  </Button>
                  <form action={toggleCaseType.bind(null, t.id)}>
                    <Button size="sm" variant="ghost" type="submit">
                      {t.active ? "ปิด / Disable" : "เปิด / Enable"}
                    </Button>
                  </form>
                  {!t.isSystem && (
                    <form action={deleteCaseType.bind(null, t.id)}>
                      <ConfirmButton
                        size="sm"
                        variant="destructive"
                        confirmText="ลบประเภทเคสนี้? / Delete this case type?"
                      >
                        ลบ / Delete
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
