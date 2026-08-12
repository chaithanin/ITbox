import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const TAKE = 10;

function str(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s ?? "";
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({count})
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่พบข้อมูล / No results</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">{children}</CardContent>
        </Card>
      )}
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();

  const canReadEmployees = user.permissions.has("employee:read");
  const canReadVault = user.permissions.has("vault:read");

  const hasQuery = q.length >= 2;
  const orgId = user.organizationId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [assets, employees, licenses, vendors, vaultItems] = hasQuery
    ? await Promise.all([
        prisma.asset.findMany({
          where: {
            organizationId: orgId,
            deletedAt: null,
            OR: [{ assetTag: contains }, { serialNumber: contains }, { name: contains }],
          },
          select: { id: true, assetTag: true, name: true, serialNumber: true, status: true },
          take: TAKE,
        }),
        canReadEmployees
          ? prisma.employee.findMany({
              where: {
                organizationId: orgId,
                deletedAt: null,
                OR: [
                  { firstName: contains },
                  { lastName: contains },
                  { employeeCode: contains },
                  { email: contains },
                ],
              },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                email: true,
                position: true,
              },
              take: TAKE,
            })
          : Promise.resolve([]),
        prisma.license.findMany({
          where: { organizationId: orgId, deletedAt: null, softwareName: contains },
          select: { id: true, softwareName: true, licenseType: true, expiresAt: true },
          take: TAKE,
        }),
        prisma.vendor.findMany({
          where: { organizationId: orgId, deletedAt: null, name: contains },
          select: { id: true, name: true, category: true, phone: true },
          take: TAKE,
        }),
        canReadVault
          ? // METADATA ONLY — encrypted fields are never selected
            prisma.vaultItem.findMany({
              where: {
                organizationId: orgId,
                deletedAt: null,
                OR: [{ name: contains }, { username: contains }, { host: contains }],
              },
              select: {
                id: true,
                name: true,
                type: true,
                classification: true,
                username: true,
                host: true,
              },
              take: TAKE,
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  const totalResults =
    assets.length + employees.length + licenses.length + vendors.length + vaultItems.length;

  return (
    <div>
      <PageHeader
        title="ค้นหา / Global Search"
        description="ค้นหาทรัพย์สิน พนักงาน ไลเซนส์ ผู้ขาย และรายการ Vault / Search assets, employees, licenses, vendors and vault items"
      />

      <form action="/search" method="get" className="mb-6 flex max-w-xl items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร / Type at least 2 characters..."
            className="pl-9"
            autoFocus
          />
        </div>
        <Button type="submit" variant="secondary">
          ค้นหา / Search
        </Button>
      </form>

      {!hasQuery ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            พิมพ์คำค้นหาอย่างน้อย 2 ตัวอักษรเพื่อเริ่มค้นหา / Enter at least 2 characters to search.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            พบ {totalResults.toLocaleString()} รายการสำหรับ &quot;{q}&quot; / {totalResults.toLocaleString()}{" "}
            results for &quot;{q}&quot; (สูงสุด {TAKE} ต่อหมวด / max {TAKE} per section)
          </p>

          <Section title="ทรัพย์สิน / Assets" count={assets.length}>
            {assets.map((a) => (
              <Link
                key={a.id}
                href={`/assets/${a.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-muted-foreground">{a.assetTag}</span>{" "}
                  <span className="font-medium">{a.name}</span>
                  {a.serialNumber && (
                    <span className="text-muted-foreground"> · SN: {a.serialNumber}</span>
                  )}
                </span>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </Section>

          {canReadEmployees && (
            <Section title="พนักงาน / Employees" count={employees.length}>
              {employees.map((e) => (
                <Link
                  key={e.id}
                  href={`/employees/${e.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{e.employeeCode}</span>{" "}
                    <span className="font-medium">
                      {e.firstName} {e.lastName}
                    </span>
                    {e.position && <span className="text-muted-foreground"> · {e.position}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.email ?? ""}</span>
                </Link>
              ))}
            </Section>
          )}

          <Section title="ไลเซนส์ / Licenses" count={licenses.length}>
            {licenses.map((l) => (
              <Link
                key={l.id}
                href={`/licenses/${l.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate font-medium">{l.softwareName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {l.licenseType ?? ""}
                </span>
              </Link>
            ))}
          </Section>

          <Section title="ผู้ขาย / Vendors" count={vendors.length}>
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/vendors/${v.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate font-medium">{v.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {v.category ?? v.phone ?? ""}
                </span>
              </Link>
            ))}
          </Section>

          {canReadVault && (
            <Section title="รายการ Vault / Vault Items" count={vaultItems.length}>
              {vaultItems.map((v) => (
                <Link
                  key={v.id}
                  href={`/vault/${v.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{v.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {v.type.replaceAll("_", " ")}
                      {v.username ? ` · ${v.username}` : ""}
                      {v.host ? ` @ ${v.host}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={v.classification} />
                </Link>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
