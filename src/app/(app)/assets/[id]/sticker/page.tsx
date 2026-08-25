import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./print-button";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssetStickerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true, name: true, serialNumber: true },
  });
  if (!asset) notFound();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 print:hidden">
        <PrintButton />
        <Button variant="outline" asChild>
          <Link href={`/assets/${asset.id}`}>กลับ / Back</Link>
        </Button>
      </div>

      {/* Sticker: fixed white card so it prints identically in dark mode */}
      <div className="flex w-72 flex-col items-center gap-2 rounded-lg border border-neutral-300 bg-white p-4 text-center text-neutral-900 shadow-sm print:border-black print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/assets/${asset.id}/qr`} alt={`QR ${asset.assetTag}`} className="h-40 w-40" />
        <p className="text-lg font-bold tracking-wide">{asset.assetTag}</p>
        <p className="text-sm">{asset.name}</p>
        {asset.serialNumber && <p className="text-xs text-neutral-500">S/N: {asset.serialNumber}</p>}
        <p className="text-[10px] uppercase tracking-widest text-neutral-400">TECHCORE Asset</p>
      </div>
    </div>
  );
}
