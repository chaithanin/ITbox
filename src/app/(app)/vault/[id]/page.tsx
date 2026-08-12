import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Star, Trash2, Server, ShieldAlert } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getVaultAccess } from "@/lib/services/vault";
import { auditLog } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime } from "@/lib/utils";
import { RevealPanel } from "./reveal-panel";
import {
  deleteSecretAction, toggleFavoriteAction, shareSecretAction,
  revokeShareAction, markRotationAction, requestEmergencyAction,
  linkAssetAction, unlinkAssetAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function SecretDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("vault:read");
  const { id } = await params;

  const item = await prisma.vaultItem.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      category: true,
      department: true,
      owner: { select: { id: true, name: true, email: true } },
      assetLinks: { include: { asset: { select: { id: true, assetTag: true, name: true, status: true } } } },
      shares: {
        where: { revokedAt: null },
        include: {
          user: { select: { name: true, email: true } },
          role: { select: { name: true, key: true } },
          department: { select: { name: true } },
          sharedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      rotationLogs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!item) notFound();

  const access = await getVaultAccess(user, item);
  if (access.level < 1) {
    // Not visible to this user at all — do not confirm existence details
    await auditLog(user, {
      action: "VIEW_SECRET", entityType: "VAULT_ITEM", entityId: id, result: "DENIED",
    });
    notFound();
  }

  // Metadata view audit (VIEW_SECRET — metadata only, no decryption)
  await prisma.vaultAccessLog.create({
    data: {
      organizationId: user.organizationId,
      vaultItemId: item.id,
      userId: user.id,
      action: "VIEW_SECRET",
      result: "SUCCESS",
      ip: user.ip,
      userAgent: user.userAgent,
    },
  });

  const [favorite, accessLogs, passkeyCount] = await Promise.all([
    prisma.vaultFavorite.findUnique({
      where: { userId_vaultItemId: { userId: user.id, vaultItemId: item.id } },
    }),
    user.permissions.has("vault:audit") || access.isOwner
      ? prisma.vaultAccessLog.findMany({
          where: { vaultItemId: item.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.webAuthnCredential.count({ where: { userId: user.id } }),
  ]);

  const logUsers = accessLogs.length
    ? new Map(
        (
          await prisma.user.findMany({
            where: { id: { in: [...new Set(accessLogs.map((l) => l.userId))] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name])
      )
    : new Map<string, string>();

  const canEdit = access.level >= 4 && user.permissions.has("vault:update");
  const canDelete = (access.isOwner || access.viaManage) && user.permissions.has("vault:delete");
  const canShare = access.level >= 5 && user.permissions.has("vault:share");
  const canReveal = access.level >= 2 && user.permissions.has("vault:reveal");
  const canCopy = access.level >= 2 && user.permissions.has("vault:copy");
  const canRotate = access.level >= 4 && user.permissions.has("vault:rotate");

  const [shareUsers, shareRoles, shareDepts] = canShare
    ? await Promise.all([
        prisma.user.findMany({
          where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
          take: 200,
        }),
        prisma.role.findMany({
          where: { organizationId: user.organizationId, deletedAt: null },
          orderBy: { key: "asc" },
        }),
        prisma.department.findMany({
          where: { organizationId: user.organizationId, deletedAt: null },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], [], []];

  const shareWithId = shareSecretAction.bind(null, item.id);
  const deleteWithId = deleteSecretAction.bind(null, item.id);
  const favWithId = toggleFavoriteAction.bind(null, item.id);
  const rotateWithId = markRotationAction.bind(null, item.id);
  const linkWithId = linkAssetAction.bind(null, item.id);

  const linkedIds = new Set(item.assetLinks.map((l) => l.assetId));
  const linkableAssets = canEdit
    ? (
        await prisma.asset.findMany({
          where: { organizationId: user.organizationId, deletedAt: null },
          select: { id: true, assetTag: true, name: true },
          orderBy: { assetTag: "asc" },
          take: 300,
        })
      ).filter((a) => !linkedIds.has(a.id))
    : [];

  return (
    <div>
      <PageHeader title={item.name} description={item.category?.name ?? item.type}>
        <form action={favWithId}>
          <Button variant="outline" size="icon" title="รายการโปรด / Favorite">
            <Star className={favorite ? "fill-amber-400 text-amber-400" : ""} />
          </Button>
        </form>
        {canEdit && (
          <Button variant="outline" asChild>
            <Link href={`/vault/${item.id}/edit`}><Pencil className="h-4 w-4" /> แก้ไข / Edit</Link>
          </Button>
        )}
        {canDelete && (
          <form action={deleteWithId}>
            <ConfirmButton variant="destructive" confirmText="ยืนยันการลบรายการนี้? / Delete this secret?">
              <Trash2 className="h-4 w-4" /> ลบ / Delete
            </ConfirmButton>
          </form>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>ข้อมูลลับ / Secret</CardTitle>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.classification} />
                {item.requireApprovalToReveal && (
                  <Badge variant="warning">ต้องอนุมัติ / Approval required</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <RevealPanel
                itemId={item.id}
                classification={item.classification}
                requireMfa={
                  item.requireMfaToReveal ||
                  item.classification === "HIGH" ||
                  item.classification === "CRITICAL"
                }
                requireApproval={item.requireApprovalToReveal}
                canReveal={canReveal}
                canCopy={canCopy}
                hasPasskey={passkeyCount > 0}
              />
              {item.requireApprovalToReveal && (
                <form action={requestEmergencyAction} className="mt-4 space-y-2 rounded-md border border-dashed p-3">
                  <input type="hidden" name="vaultItemId" value={item.id} />
                  <Label htmlFor="reason" className="flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    ขอสิทธิ์เข้าถึงฉุกเฉิน / Request emergency access
                  </Label>
                  <Textarea id="reason" name="reason" required minLength={5} rows={2}
                    placeholder="เหตุผลความจำเป็น / Reason" />
                  <Button type="submit" variant="outline" size="sm">ส่งคำขอ / Submit request</Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>รายละเอียด / Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ["ประเภท / Type", item.type.replaceAll("_", " ")],
                  ["Username", item.username],
                  ["URL", item.url],
                  ["Host / IP", item.host],
                  ["Port", item.port?.toString()],
                  ["Protocol", item.protocol],
                  ["Environment", item.environment],
                  ["แผนก / Department", item.department?.name],
                  ["เจ้าของ / Owner", item.owner?.name],
                  ["หมดอายุ / Expires", item.expiresAt ? formatDate(item.expiresAt) : null],
                  ["เปลี่ยนรหัสล่าสุด / Last rotated", item.lastRotatedAt ? formatDate(item.lastRotatedAt) : null],
                  ["รอบถัดไป / Next rotation", item.nextRotationAt ? formatDate(item.nextRotationAt) : null],
                  ["อัลกอริทึม / Encryption", item.encryptionAlgorithm],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-4 border-b border-dashed py-1 last:border-0">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>
              {item.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}
              {item.notes && <p className="mt-3 text-sm text-muted-foreground">{item.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>ทรัพย์สินที่เชื่อมโยง / Linked Assets</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {item.assetLinks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  ยังไม่เชื่อมโยงกับทรัพย์สิน / Not linked to any asset
                </p>
              )}
              {item.assetLinks.map((l) => {
                const unlink = unlinkAssetAction.bind(null, item.id, l.asset.id);
                return (
                  <div
                    key={l.assetId}
                    className="flex items-center justify-between rounded-md border p-2.5 text-sm"
                  >
                    <Link href={`/assets/${l.asset.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                      <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{l.asset.assetTag}</span>
                      <span className="truncate text-muted-foreground">{l.asset.name}</span>
                      {l.label && <Badge variant="outline">{l.label}</Badge>}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={l.asset.status} />
                      {canEdit && (
                        <form action={unlink}>
                          <ConfirmButton variant="ghost" size="sm" confirmText="ยกเลิกการเชื่อมโยง? / Unlink?">
                            ยกเลิก
                          </ConfirmButton>
                        </form>
                      )}
                    </span>
                  </div>
                );
              })}
              {canEdit && linkableAssets.length > 0 && (
                <form action={linkWithId} className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Select name="assetId" required className="min-w-[14rem] flex-1">
                    <option value="">— เลือกทรัพย์สิน / Select asset —</option>
                    {linkableAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>
                    ))}
                  </Select>
                  <Input name="label" placeholder="ป้ายกำกับ เช่น iDRAC / Label" className="w-40" />
                  <Button type="submit" size="sm">เชื่อมโยง / Link</Button>
                </form>
              )}
            </CardContent>
          </Card>

          {accessLogs.length > 0 && (
            <Card>
              <CardHeader><CardTitle>การเข้าถึงล่าสุด / Recent Access</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {accessLogs.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5 last:border-0">
                      <span>
                        <span className="font-medium">{logUsers.get(l.userId) ?? "?"}</span>{" "}
                        <span className="text-muted-foreground">{l.action}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <StatusBadge status={l.result} />
                        {formatDateTime(l.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {canRotate && (
            <Card>
              <CardHeader><CardTitle>เปลี่ยนรหัส / Rotation</CardTitle></CardHeader>
              <CardContent>
                <form action={rotateWithId} className="space-y-2">
                  <Select name="status" defaultValue="ROTATED">
                    <option value="ROTATED">เปลี่ยนแล้ว / Rotated</option>
                    <option value="VERIFIED">ตรวจสอบแล้ว / Verified</option>
                    <option value="SKIPPED">ข้าม (ระบุเหตุผล) / Skipped</option>
                  </Select>
                  <Input name="newPassword" type="password" autoComplete="off"
                    placeholder="รหัสผ่านใหม่ (ถ้าเปลี่ยน) / New password (optional)" className="font-mono" />
                  <Input name="reason" placeholder="เหตุผล / Reason" />
                  <Button type="submit" size="sm" className="w-full">บันทึก / Save</Button>
                </form>
                {item.rotationLogs.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {item.rotationLogs.map((r) => (
                      <li key={r.id}>{formatDate(r.createdAt)} — {r.status}{r.reason ? ` (${r.reason})` : ""}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>การแชร์ / Shares</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {item.shares.length === 0 && (
                <p className="text-sm text-muted-foreground">ยังไม่มีการแชร์ / Not shared</p>
              )}
              {item.shares.map((s) => {
                const target = s.user
                  ? `${s.user.name}`
                  : s.role
                    ? `Role: ${s.role.name}`
                    : s.department
                      ? `Dept: ${s.department.name}`
                      : "?";
                const expired = s.expiresAt && s.expiresAt < new Date();
                const revokeAction = revokeShareAction.bind(null, item.id, s.id);
                return (
                  <div key={s.id} className="rounded-md border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{target}</span>
                      <Badge variant={expired ? "secondary" : "default"}>{s.permission}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {s.expiresAt
                          ? `${expired ? "หมดอายุ / expired" : "ถึง / until"} ${formatDateTime(s.expiresAt)}`
                          : "ไม่มีวันหมดอายุ / no expiry"}
                      </span>
                      {canShare && (
                        <form action={revokeAction}>
                          <ConfirmButton variant="ghost" size="sm" confirmText="ยกเลิกการแชร์? / Revoke share?">
                            เพิกถอน / Revoke
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}

              {canShare && (
                <form action={shareWithId} className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">แชร์ให้ / Share with</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select name="targetType" defaultValue="user">
                      <option value="user">ผู้ใช้ / User</option>
                      <option value="role">บทบาท / Role</option>
                      <option value="department">แผนก / Department</option>
                    </Select>
                    <Select name="permission" defaultValue="REVEAL">
                      <option value="VIEW">VIEW</option>
                      <option value="REVEAL">REVEAL</option>
                      <option value="COPY">COPY</option>
                      <option value="EDIT">EDIT</option>
                      <option value="SHARE">SHARE</option>
                    </Select>
                  </div>
                  <Select name="targetId" required>
                    <option value="">— เลือกเป้าหมาย / Select target —</option>
                    <optgroup label="Users">
                      {shareUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Roles">
                      {shareRoles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Departments">
                      {shareDepts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </optgroup>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Select name="expiresIn" defaultValue="7d">
                      <option value="1h">1 ชั่วโมง / 1 hour</option>
                      <option value="1d">1 วัน / 1 day</option>
                      <option value="7d">7 วัน / 7 days</option>
                      <option value="30d">30 วัน / 30 days</option>
                      <option value="never">ไม่หมดอายุ / Never</option>
                    </Select>
                    <Input name="startsAt" type="datetime-local" title="เริ่มเมื่อ (Temporary access)" />
                  </div>
                  <Input name="reason" placeholder="เหตุผล / Reason" />
                  <Button type="submit" size="sm" className="w-full">แชร์ / Share</Button>
                  <p className="text-xs text-muted-foreground">
                    กำหนดเวลาเริ่ม-สิ้นสุดเพื่อให้สิทธิ์ชั่วคราว สิทธิ์จะถูกเพิกถอนอัตโนมัติเมื่อหมดเวลา
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
