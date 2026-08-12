import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setRolePermissionsAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RoleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePermission("role:manage");
  const { id } = await params;
  const role = await prisma.role.findFirst({
    where: { id, organizationId: admin.organizationId, deletedAt: null },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) notFound();

  const granted = new Set(role.rolePermissions.map((rp) => rp.permission.key));
  const groups = new Map<string, string[]>();
  for (const p of PERMISSIONS) {
    const [resource] = p.split(":");
    groups.set(resource, [...(groups.get(resource) ?? []), p]);
  }
  const locked = role.key === "SUPER_ADMIN";
  const action = setRolePermissionsAction.bind(null, role.id);

  return (
    <div>
      <PageHeader
        title={`สิทธิ์ของบทบาท / Role: ${role.nameTh ?? role.name}`}
        description={locked ? "SUPER_ADMIN ถูกล็อก แก้ไขไม่ได้ / locked" : `key: ${role.key}`}
      />
      <form action={action}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...groups.entries()].map(([resource, perms]) => (
            <Card key={resource}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wide">{resource}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {perms.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="perms"
                      value={p}
                      defaultChecked={granted.has(p)}
                      disabled={locked}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="font-mono text-xs">{p}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        {!locked && (
          <div className="mt-4">
            <Button type="submit">บันทึกสิทธิ์ / Save permissions</Button>
          </div>
        )}
      </form>
    </div>
  );
}
