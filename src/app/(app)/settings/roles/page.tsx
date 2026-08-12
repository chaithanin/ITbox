import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const admin = await requirePermission("role:manage");
  const roles = await prisma.role.findMany({
    where: { organizationId: admin.organizationId, deletedAt: null },
    include: {
      _count: { select: { userRoles: true, rolePermissions: true } },
    },
    orderBy: { key: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="บทบาทและสิทธิ์ / Roles & Permissions"
        description="RBAC — คลิกที่บทบาทเพื่อแก้ไขสิทธิ์"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>บทบาท / Role</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>ผู้ใช้ / Users</TableHead>
            <TableHead>สิทธิ์ / Permissions</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.nameTh ?? r.name}
                {r.isSystem && <Badge variant="secondary" className="ml-2">System</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.key}</TableCell>
              <TableCell>{r._count.userRoles}</TableCell>
              <TableCell>{r._count.rolePermissions}</TableCell>
              <TableCell>
                <Link href={`/settings/roles/${r.id}`} className="text-sm text-primary hover:underline">
                  แก้ไขสิทธิ์ / Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
