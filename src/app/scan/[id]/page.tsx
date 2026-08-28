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
 * PUBLIC asset lookup page (QR scan target). No auth, so it must expose only
 * non-identifying fields. Deliberately NObody's name, department, or physical
 * location here — that PII is available only to authenticated users on the
 * internal asset page. Anyone holding the QR URL sees just tag/status/warranty.
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
          status: true,
          condition: true,
          warrantyEnd: true,
        },
      })
    : null;

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/40 p-4 pt-10 sm:pt-16">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Box className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">TECHCORE</span>
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
                <Row label="สถานะ / Status" value={asset.status} />
                <Row label="สภาพ / Condition" value={asset.condition} />
                <Row label="หมดประกัน / Warranty End" value={formatDate(asset.warrantyEnd)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                เข้าสู่ระบบเพื่อดูผู้ถือครอง แผนก และสถานที่ / Sign in for holder, department &amp; location
              </p>
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
