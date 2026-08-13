import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { MessageBanner } from "../message-banner";
import { createTeam, deleteTeam, addTeamMember, removeTeamMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const [teams, users] = await Promise.all([
    prisma.supportTeam.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="ทีมและการมอบหมาย / Teams & Auto-Assignment" description="สร้างทีมและกำหนดสมาชิก ระบบกระจายงานตามหมวดหมู่ → ทีม → ผู้ที่งานน้อยสุด">
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <Card className="mb-4">
        <CardHeader><CardTitle>สร้างทีม / Create team</CardTitle></CardHeader>
        <CardContent>
          <form action={createTeam} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อทีม (EN)</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameTh">ชื่อทีม (ไทย)</Label>
              <Input id="nameTh" name="nameTh" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">สร้าง / Create</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        กลยุทธ์การมอบหมาย: Manual · Round Robin · Least Workload · By Category — ปัจจุบันระบบกระจายอัตโนมัติตาม
        หมวดหมู่ → ทีมที่กำหนด แล้วเลือกสมาชิกที่มีงานค้างน้อยที่สุด (Least Workload)
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {teams.map((t) => {
          const addMember = addTeamMember.bind(null, t.id);
          const del = deleteTeam.bind(null, t.id);
          const memberIds = new Set(t.members.map((m) => m.userId));
          return (
            <Card key={t.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  {t.nameTh ?? t.name}
                  {!t.active && <Badge variant="secondary">ปิด</Badge>}
                </CardTitle>
                <form action={del}>
                  <ConfirmButton variant="ghost" size="sm" confirmText="ลบทีมนี้? / Delete team?">ลบ</ConfirmButton>
                </form>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {t.members.length === 0 && <span className="text-sm text-muted-foreground">ยังไม่มีสมาชิก / No members</span>}
                  {t.members.map((m) => {
                    const rm = removeTeamMember.bind(null, t.id, m.userId);
                    return (
                      <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                        {m.user.name}
                        <form action={rm}>
                          <button className="ml-0.5 text-muted-foreground hover:text-destructive" title="นำออก">✕</button>
                        </form>
                      </span>
                    );
                  })}
                </div>
                <form action={addMember} className="flex gap-2">
                  <Select name="userId" required className="flex-1">
                    <option value="">— เพิ่มสมาชิก / Add member —</option>
                    {users.filter((u) => !memberIds.has(u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">เพิ่ม</Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
