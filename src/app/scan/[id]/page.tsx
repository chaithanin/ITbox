import { Box } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "-"}</span>
    </div>
  );
}

/**
 * PUBLIC asset lookup page (QR scan target). No auth — shows only
 * non-sensitive identification fields. No prices, notes, or vault data.
 */
export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const asset = UUID_RE.test(id)
    ? await prisma.asset.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          name: true,
          assetTag: true,
          serialNumber: true,
          status: true,
          condition: true,
          warrantyEnd: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
          assignments: {
            where: { status: "CHECKED_OUT" },
            orderBy: { assignedAt: "desc" },
            take: 1,
            select: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
      })
    : null;

  const holder = asset?.assignments[0]?.employee;

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/40 p-4 pt-10 sm:pt-16">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Box className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">ITBox</span>
        </div>

        <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          {!asset ? (
            <p className="py-8 text-center text-muted-foreground">
              ไม่พบทรัพย์สิน / Asset not found
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold leading-tight">{asset.name}</h1>
                  <p className="text-sm text-muted-foreground">{asset.assetTag}</p>
                </div>
                <StatusBadge status={asset.status} />
              </div>
              <div>
                <Row label="ซีเรียล / Serial" value={asset.serialNumber} />
                <Row label="แผนก / Department" value={asset.department?.name} />
                <Row label="สถานที่ / Location" value={asset.location?.name} />
                <Row label="สภาพ / Condition" value={asset.condition} />
                <Row label="หมดประกัน / Warranty End" value={formatDate(asset.warrantyEnd)} />
                <Row
                  label="ผู้ถือครอง / Assigned To"
                  value={holder ? `${holder.firstName} ${holder.lastName}` : null}
                />
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          ระบบบริหารจัดการไอที / Enterprise IT Management
        </p>
      </div>
    </main>
  );
}
