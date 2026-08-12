import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = apiHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const asset = await prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const url = `${process.env.AUTH_URL ?? ""}/scan/${asset.id}`;
    const buffer = await QRCode.toBuffer(url, { width: 512 });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
);
