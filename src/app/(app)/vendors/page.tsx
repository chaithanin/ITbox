import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex items-center gap-0.5" title={`${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < value
              ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
              : "h-3.5 w-3.5 text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("vendor:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { contactName: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
    }),
    prisma.vendor.count({ where }),
  ]);

  const canManage = user.permissions.has("vendor:manage");
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="ผู้จำหน่าย / Vendors"
        description="จัดการข้อมูลผู้จำหน่ายและผู้ให้บริการ / Manage vendors and service providers"
      >
        {canManage && (
          <Button asChild>
            <Link href="/vendors/new">
              <Plus className="h-4 w-4" /> เพิ่มผู้จำหน่าย / New Vendor
            </Link>
          </Button>
        )}
      </PageHeader>

      <SearchFilterBar action="/vendors" q={q} placeholder="ค้นหาผู้จำหน่าย / Search vendors..." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>หมวดหมู่ / Category</TableHead>
            <TableHead>ผู้ติดต่อ / Contact</TableHead>
            <TableHead>โทรศัพท์ / Phone</TableHead>
            <TableHead>อีเมล / Email</TableHead>
            <TableHead>คะแนน / Rating</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No vendors found
              </TableCell>
            </TableRow>
          )}
          {vendors.map((v) => (
            <TableRow key={v.id}>
              <TableCell>
                <Link href={`/vendors/${v.id}`} className="font-medium text-primary hover:underline">
                  {v.name}
                </Link>
              </TableCell>
              <TableCell>{v.category ?? "-"}</TableCell>
              <TableCell>{v.contactName ?? "-"}</TableCell>
              <TableCell>{v.phone ?? "-"}</TableCell>
              <TableCell>{v.email ?? "-"}</TableCell>
              <TableCell>
                <Rating value={v.rating} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/vendors" searchParams={sp} />
    </div>
  );
}
