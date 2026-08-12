import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushLineMessage } from "@/lib/services/notify";

export const dynamic = "force-dynamic";

/**
 * Scheduled checks (call daily via Cloud Scheduler → Cloud Run):
 *   - warranty expiring in 30/14/7 days
 *   - licenses expiring / subscriptions renewing in 30 days
 *   - vault rotation due / secrets expired
 *   - vault shares past expiry are already excluded by queries (auto-revoked
 *     logically); this job stamps revokedAt for hygiene.
 *
 * Protected by CRON_SECRET (Authorization: Bearer <secret>). Idempotent per
 * day: skips notifications already created today for the same entity.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
  let created = 0;

  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const org of orgs) {
    // Users to notify (IT managers + admins)
    const recipients = await prisma.user.findMany({
      where: {
        organizationId: org.id, deletedAt: null, status: "ACTIVE",
        userRoles: { some: { role: { key: { in: ["SUPER_ADMIN", "ADMIN", "IT_MANAGER"] } } } },
      },
      select: { id: true },
    });
    const notify = async (
      type: string, entityId: string, level: "INFO" | "WARNING" | "CRITICAL",
      title: string, body: string, link: string
    ) => {
      const exists = await prisma.notification.findFirst({
        where: { organizationId: org.id, type, body, createdAt: { gte: startOfDay } },
        select: { id: true },
      });
      if (exists) return;
      await prisma.notification.createMany({
        data: recipients.map((r) => ({
          organizationId: org.id, userId: r.id, type, level, title, body, link,
        })),
      });
      created += recipients.length;
    };

    // Warranty expiring (30/14/7 days)
    for (const days of [30, 14, 7]) {
      const assets = await prisma.asset.findMany({
        where: {
          organizationId: org.id, deletedAt: null,
          status: { notIn: ["RETIRED", "DISPOSED"] },
          warrantyEnd: { gte: inDays(days - 1), lt: inDays(days) },
        },
        select: { id: true, assetTag: true, name: true },
        take: 100,
      });
      for (const a of assets) {
        await notify(
          "WARRANTY_EXPIRING", a.id, "WARNING",
          "ประกันใกล้หมดอายุ / Warranty expiring",
          `${a.assetTag} ${a.name} — ประกันหมดใน ${days} วัน`,
          `/assets/${a.id}`
        );
      }
    }

    // Licenses expiring in 30 days
    const licenses = await prisma.license.findMany({
      where: {
        organizationId: org.id, deletedAt: null,
        expiresAt: { gte: now, lt: inDays(30) },
      },
      select: { id: true, softwareName: true, expiresAt: true },
      take: 100,
    });
    for (const l of licenses) {
      await notify(
        "LICENSE_EXPIRING", l.id, "WARNING",
        "ไลเซนส์ใกล้หมดอายุ / License expiring",
        `${l.softwareName} หมดอายุ ${l.expiresAt?.toISOString().slice(0, 10)}`,
        "/licenses"
      );
    }

    // Subscriptions renewing in 30 days
    const subs = await prisma.subscription.findMany({
      where: {
        organizationId: org.id, deletedAt: null, status: "ACTIVE",
        renewalDate: { gte: now, lt: inDays(30) },
      },
      select: { id: true, serviceName: true, renewalDate: true },
      take: 100,
    });
    for (const s of subs) {
      await notify(
        "SUBSCRIPTION_RENEWAL", s.id, "INFO",
        "บริการใกล้ต่ออายุ / Subscription renewal",
        `${s.serviceName} ต่ออายุ ${s.renewalDate?.toISOString().slice(0, 10)}`,
        "/subscriptions"
      );
    }

    // Vault rotation due / expired (metadata only — no secret values)
    const dueItems = await prisma.vaultItem.findMany({
      where: {
        organizationId: org.id, deletedAt: null, nextRotationAt: { lt: now },
      },
      select: { id: true, name: true },
      take: 100,
    });
    for (const v of dueItems) {
      await notify(
        "PASSWORD_ROTATION", v.id, "WARNING",
        "ถึงรอบเปลี่ยนรหัสผ่าน / Password rotation due",
        `"${v.name}" เลยกำหนดเปลี่ยนรหัสผ่าน`,
        `/vault/${v.id}`
      );
    }

    // Hygiene: stamp revokedAt on shares past their expiry
    await prisma.vaultShare.updateMany({
      where: {
        revokedAt: null, expiresAt: { lt: now },
        vaultItem: { organizationId: org.id },
      },
      data: { revokedAt: now },
    });
  }

  if (created > 0) {
    await pushLineMessage(
      `ITBox: มีการแจ้งเตือนใหม่ ${created} รายการ (ประกัน/ไลเซนส์/รอบเปลี่ยนรหัสผ่าน) — เข้าสู่ระบบเพื่อตรวจสอบ`
    );
  }

  return NextResponse.json({ ok: true, notificationsCreated: created });
}
