import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, Power, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { accessSystems } from "@/lib/documents/access-profile";
import { ProfileFields } from "../profile-fields";
import { ProfileItemsEditor } from "../items-editor";
import { updateProfile, duplicateProfile, toggleProfile, deleteProfile } from "../actions";

export default async function EditProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("permprofile:manage");
  const { id } = await params;
  const sp = await searchParams;

  const [profile, departments] = await Promise.all([
    prisma.permissionProfile.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, include: { items: true } }),
    prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!profile) notFound();
  const systems = accessSystems();

  const update = updateProfile.bind(null, id);
  const dup = duplicateProfile.bind(null, id);
  const toggle = toggleProfile.bind(null, id);
  const del = deleteProfile.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/settings/permission-profiles"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title={profile.name} description={`${profile.department ?? "ทุกแผนก"}${profile.position ? ` · ${profile.position}` : ""}${profile.jobLevel ? ` · ${profile.jobLevel}` : ""}`}>
        <form action={dup}><Button type="submit" variant="outline"><Copy className="h-4 w-4" /> ทำสำเนา / Duplicate</Button></form>
        <form action={toggle}>
          <input type="hidden" name="active" value={profile.isActive ? "false" : "true"} />
          <Button type="submit" variant="outline"><Power className="h-4 w-4" /> {profile.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}</Button>
        </form>
        <form action={del}><ConfirmButton type="submit" variant="destructive" confirmText="ลบโปรไฟล์นี้? / Delete this profile?"><Trash2 className="h-4 w-4" /> ลบ</ConfirmButton></form>
      </PageHeader>

      {sp.ok === "saved" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">บันทึกเรียบร้อย / Saved</div>}

      <form action={update} className="space-y-4">
        <Card><CardContent className="pt-4"><ProfileFields departments={departments} d={{
          name: profile.name, company: profile.company, department: profile.department, position: profile.position,
          jobLevel: profile.jobLevel, isActive: profile.isActive,
          requiresManagerApproval: profile.requiresManagerApproval, requiresSystemOwnerApproval: profile.requiresSystemOwnerApproval,
          requiresItManagerApproval: profile.requiresItManagerApproval, requiresManagementApproval: profile.requiresManagementApproval, notes: profile.notes,
        }} /></CardContent></Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">สิทธิ์มาตรฐาน / Default permissions</CardTitle></CardHeader>
          <CardContent><ProfileItemsEditor systems={systems} initial={profile.items.map((i) => ({ system: i.system, resource: i.resource, permissionLevel: i.permissionLevel, defaultStatus: i.defaultStatus, requiresApproval: i.requiresApproval }))} /></CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
      </form>
    </div>
  );
}
