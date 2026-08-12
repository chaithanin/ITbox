import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";
import { createLocation, softDeleteLocation } from "./actions";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("location:read");
  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);
  const q = sp.q?.trim() || undefined;
  const canManage = user.permissions.has("location:manage");

  const where: Prisma.LocationWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { building: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: {
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            assets: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.location.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader title="สถานที่ / Locations" description={`ทั้งหมด ${total} แห่ง / ${total} locations`} />

      {canManage && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>เพิ่มสถานที่ / New Location</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createLocation} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">รหัส / Code *</Label>
                <Input id="code" name="code" required maxLength={50} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">ชื่อ / Name *</Label>
                <Input id="name" name="name" required maxLength={200} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">ที่อยู่ / Address</Label>
                <Input id="address" name="address" maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="building">อาคาร / Building</Label>
                <Input id="building" name="building" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor">ชั้น / Floor</Label>
                <Input id="floor" name="floor" maxLength={50} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room">ห้อง / Room</Label>
                <Input id="room" name="room" maxLength={50} />
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  เพิ่ม / Add
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <SearchFilterBar action="/locations" q={sp.q} placeholder="ค้นหาสถานที่ / Search locations..." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส / Code</TableHead>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>อาคาร / Building</TableHead>
            <TableHead>ชั้น / Floor</TableHead>
            <TableHead>ห้อง / Room</TableHead>
            <TableHead className="text-right">พนักงาน / Employees</TableHead>
            <TableHead className="text-right">ทรัพย์สิน / Assets</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No locations found
              </TableCell>
            </TableRow>
          )}
          {rows.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-mono text-xs">{l.code}</TableCell>
              <TableCell className="font-medium">{l.name}</TableCell>
              <TableCell>{l.building ?? "-"}</TableCell>
              <TableCell>{l.floor ?? "-"}</TableCell>
              <TableCell>{l.room ?? "-"}</TableCell>
              <TableCell className="text-right">{l._count.employees}</TableCell>
              <TableCell className="text-right">{l._count.assets}</TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/locations/${l.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5" />
                        แก้ไข / Edit
                      </Link>
                    </Button>
                    {l._count.employees === 0 && (
                      <form action={softDeleteLocation}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmButton
                          variant="outline"
                          size="sm"
                          confirmText={`ลบสถานที่ ${l.name}? / Delete location ${l.name}?`}
                        >
                          ลบ / Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/locations" searchParams={sp} />
    </div>
  );
}
