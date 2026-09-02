import Link from "next/link";
import { Box, ExternalLink, HandHelping, PackageCheck, Undo2, History } from "lucide-react";
import type { BorrowRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
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

// Non-terminal borrow states — an asset is "in a live loan" while in any of these.
const ACTIVE_REQUEST_STATUSES: BorrowRequestStatus[] = [
  "PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT", "APPROVED",
  "READY_TO_ISSUE", "ISSUED", "PARTIALLY_RETURNED",
];

/**
 * Asset lookup page (QR scan target). Anonymous scans see only non-identifying
 * fields (tag / status / warranty). A signed-in staff member additionally gets
 * mobile-friendly quick actions — Borrow, Issue/Return the live request, View,
 * History — resolved from the asset's current state and their permissions.
 */
export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const valid = UUID_RE.test(id);

  const asset = valid
    ? await prisma.asset.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true, name: true, assetTag: true, status: true, condition: true,
          warrantyEnd: true, organizationId: true,
        },
      })
    : null;

  const user = await getCurrentUser();
  // Only expose actions for an asset in the viewer's own organization.
  const sameOrg = !!user && !!asset && user.organizationId === asset.organizationId;

  const activeRequest = sameOrg
    ? await prisma.borrowRequest.findFirst({
        where: {
          organizationId: asset!.organizationId,
          deletedAt: null,
          status: { in: ACTIVE_REQUEST_STATUSES },
          items: { some: { assetId: asset!.id } },
        },
        select: { id: true, refNo: true, status: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const has = (p: string) => !!user && user.permissions.has(p);

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/40 p-4 pt-8 sm:pt-14">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Box className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">TECHCORE</span>
        </div>

        <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          {!asset ? (
            <p className="py-8 text-center text-muted-foreground">ไม่พบทรัพย์สิน / Asset not found</p>
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
                {activeRequest && (
                  <Row
                    label="คำขอยืมล่าสุด / Active loan"
                    value={<Link href={`/borrow/${activeRequest.id}`} className="text-primary hover:underline">{activeRequest.refNo}</Link>}
                  />
                )}
              </div>

              {sameOrg ? (
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {has("borrow:create") && asset.status === "AVAILABLE" && (
                    <QuickAction href={`/borrow/new?assetId=${asset.id}`} icon={<HandHelping className="h-4 w-4" />} label="ขอยืม / Borrow" primary />
                  )}
                  {activeRequest && (activeRequest.status === "READY_TO_ISSUE" || activeRequest.status === "APPROVED") && has("borrow:issue") && (
                    <QuickAction href={`/borrow/${activeRequest.id}`} icon={<PackageCheck className="h-4 w-4" />} label="จ่าย-รับมอบ / Issue" primary />
                  )}
                  {activeRequest && (activeRequest.status === "ISSUED" || activeRequest.status === "PARTIALLY_RETURNED") && has("borrow:return") && (
                    <QuickAction href={`/borrow/${activeRequest.id}`} icon={<Undo2 className="h-4 w-4" />} label="รับคืน / Return" primary />
                  )}
                  {has("asset:read") && (
                    <QuickAction href={`/assets/${asset.id}`} icon={<ExternalLink className="h-4 w-4" />} label="รายละเอียดทรัพย์สิน / View asset" />
                  )}
                  {has("asset:read") && (
                    <QuickAction href={`/assets/${asset.id}#history`} icon={<History className="h-4 w-4" />} label="ประวัติ / History" />
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  เข้าสู่ระบบเพื่อดูผู้ถือครอง แผนก และดำเนินการยืม-คืน / Sign in for holder, department &amp; borrow actions
                </p>
              )}
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

function QuickAction({ href, icon, label, primary }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        "flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors " +
        (primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-card hover:bg-accent")
      }
    >
      {icon}
      {label}
    </Link>
  );
}
