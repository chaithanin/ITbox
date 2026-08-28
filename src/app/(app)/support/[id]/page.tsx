import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, Star } from "lucide-react";
import type { CaseStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";
import {
  getCaseOrThrow,
  canTransition,
  IMPACT_LABEL,
  PRIORITY_LABEL,
} from "@/lib/services/support";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  addCommentAction,
  confirmResolutionAction,
  submitSatisfactionAction,
  transitionAction,
  assignToMeAction,
  overridePriorityAction,
  majorIncidentAction,
} from "../actions";

const ALL_STATUSES: CaseStatus[] = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
  "DUPLICATE",
];

function slaTone(
  due: Date | null,
  breached: boolean,
  done: Date | null
): "danger" | "warning" | "default" {
  if (done) return "default";
  if (breached) return "danger";
  if (due) {
    const diff = due.getTime() - Date.now();
    if (diff < 0) return "danger";
    if (diff < 3_600_000) return "warning";
  }
  return "default";
}

const TONE_CLASS: Record<string, string> = {
  danger: "text-destructive dark:text-red-400 font-semibold",
  warning: "text-amber-600 dark:text-amber-400 font-semibold",
  default: "text-foreground",
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  try {
    await getCaseOrThrow(user, id);
  } catch (e) {
    if (e instanceof AuthError && e.status === 404) notFound();
    if (e instanceof AuthError && e.status === 403) {
      return (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          คุณไม่มีสิทธิ์ดูเคสนี้ / You do not have access to this case.
        </div>
      );
    }
    throw e;
  }

  const c = await prisma.supportCase.findUnique({
    where: { id },
    include: {
      type: { select: { name: true, nameTh: true } },
      category: { select: { name: true, nameTh: true } },
      subcategory: { select: { name: true, nameTh: true } },
      requester: { select: { id: true, name: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
      asset: { select: { id: true, assetTag: true, name: true, warrantyEnd: true } },
      assignedUser: { select: { name: true } },
      assignedTeam: { select: { name: true, nameTh: true } },
      incidentCommander: { select: { name: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { name: true } },
          attachments: { select: { id: true, name: true } },
        },
      },
      events: { orderBy: { createdAt: "desc" }, take: 20 },
      satisfaction: true,
    },
  });
  if (!c) notFound();

  const isAgent =
    user.permissions.has("support:read") || user.permissions.has("support:manage");
  const canWork =
    user.permissions.has("support:work") || user.permissions.has("support:manage");
  const isRequester = c.requesterId === user.id;

  // Actor names for the timeline.
  const actorIds = [...new Set(c.events.map((e) => e.actorId).filter((v): v is string => !!v))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds }, organizationId: user.organizationId },
        select: { id: true, name: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.name]));

  const visibleComments = c.comments.filter((cm) => isAgent || !cm.isInternal);
  const conversationClosed = c.status === "CLOSED" || c.status === "CANCELLED";
  const allowedTransitions = ALL_STATUSES.filter((s) => canTransition(c.status, s));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`${c.caseNumber}`} description={c.subject}>
        <StatusBadge status={c.status} />
        <StatusBadge status={c.priority} label={`${c.priority} · ${PRIORITY_LABEL[c.priority].th}`} />
        <Button variant="outline" asChild>
          <Link href="/support">กลับ / Back</Link>
        </Button>
      </PageHeader>

      {/* ---- Major Incident ---- */}
      {c.isMajorIncident ? (
        <div className="mb-4 rounded-lg border-2 border-red-500/50 bg-red-500/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">🚨 MAJOR INCIDENT</span>
            <span className="text-sm text-muted-foreground">Incident Commander: {c.incidentCommander?.name ?? "—"}</span>
            {canWork && (
              <form action={majorIncidentAction.bind(null, c.id)} className="ml-auto">
                <input type="hidden" name="op" value="standdown" />
                <Button type="submit" size="sm" variant="outline">Stand down</Button>
              </form>
            )}
          </div>
          {c.commsLog && <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/60 p-2 font-mono text-xs">{c.commsLog}</pre>}
          {canWork && (
            <form action={majorIncidentAction.bind(null, c.id)} className="mt-2 flex gap-2">
              <input type="hidden" name="op" value="comms" />
              <input name="entry" required maxLength={1000} placeholder="อัปเดตสถานการณ์ / Comms update…" className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" />
              <Button type="submit" size="sm" variant="outline" className="h-8">บันทึก timeline</Button>
            </form>
          )}
        </div>
      ) : canWork ? (
        <form action={majorIncidentAction.bind(null, c.id)} className="mb-4">
          <input type="hidden" name="op" value="declare" />
          <Button type="submit" variant="outline" size="sm" className="text-red-600">🚨 ประกาศเป็น Major Incident</Button>
        </form>
      ) : null}

      {sp.created === "1" && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            เปิดเคสสำเร็จ / Case created
          </p>
          <p className="mt-1 text-muted-foreground">
            ทีม IT ได้รับเคสของคุณแล้ว / Our IT team has received your case.
          </p>
          <ul className="mt-2 space-y-0.5 text-muted-foreground">
            <li>
              ตอบกลับครั้งแรกภายใน / First response due: {formatDateTime(c.firstResponseDueAt)}
            </li>
            <li>แก้ไขภายใน / Resolution due: {formatDateTime(c.resolutionDueAt)}</li>
          </ul>
        </div>
      )}

      {sp.error === "resolution-note" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ต้องระบุบันทึกการแก้ไขก่อน / A resolution note is required first.
        </div>
      )}
      {sp.error === "invalid-transition" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ไม่สามารถเปลี่ยนสถานะแบบนี้ได้ / That status change is not allowed.
        </div>
      )}

      {/* Resolved → requester confirmation */}
      {c.status === "RESOLVED" && isRequester && (
        <Card className="mb-4 border-emerald-500/40">
          <CardHeader>
            <CardTitle>เคสได้รับการแก้ไขแล้ว / Case resolved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {c.resolutionNote && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-muted-foreground">บันทึกการแก้ไข / Resolution note</p>
                <p className="whitespace-pre-wrap">{c.resolutionNote}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              กรุณายืนยันว่าปัญหาได้รับการแก้ไขแล้วหรือไม่ / Please confirm whether the issue is
              resolved.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <form action={confirmResolutionAction.bind(null, c.id)}>
                <input type="hidden" name="satisfied" value="yes" />
                <Button type="submit">ยืนยันว่าแก้ไขแล้ว / Confirm resolved</Button>
              </form>
              <form
                action={confirmResolutionAction.bind(null, c.id)}
                className="flex flex-1 flex-col gap-2 sm:flex-row"
              >
                <input type="hidden" name="satisfied" value="no" />
                <Input
                  name="reason"
                  maxLength={1000}
                  placeholder="ยังพบปัญหาอะไร / What is still wrong?"
                  className="sm:flex-1"
                />
                <Button type="submit" variant="destructive">
                  ยังแก้ไม่สำเร็จ / Not resolved
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closed → CSAT survey */}
      {c.status === "CLOSED" && isRequester && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>ความพึงพอใจ / Satisfaction</CardTitle>
          </CardHeader>
          <CardContent>
            {c.satisfaction ? (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">คะแนนของคุณ / Your rating:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-5 w-5",
                      n <= c.satisfaction!.rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    )}
                  />
                ))}
                {c.satisfaction.comment && (
                  <span className="ml-2 text-muted-foreground">
                    “{c.satisfaction.comment}”
                  </span>
                )}
              </div>
            ) : (
              <form
                action={submitSatisfactionAction.bind(null, c.id)}
                className="space-y-3"
              >
                <div>
                  <Label>ให้คะแนนการบริการ / Rate the service *</Label>
                  <div className="mt-2 flex gap-4">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="flex cursor-pointer flex-col items-center gap-1 text-sm">
                        <input type="radio" name="rating" value={n} required />
                        <span>{n}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">1 = แย่มาก / Poor · 5 = ดีมาก / Excellent</p>
                </div>
                <div>
                  <Label htmlFor="comment">ความคิดเห็น / Comment</Label>
                  <Textarea id="comment" name="comment" rows={2} maxLength={1000} className="mt-1" />
                </div>
                <Button type="submit">ส่งแบบประเมิน / Submit rating</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Case info */}
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลเคส / Case info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <InfoRow label="ประเภท / Type" value={c.type ? c.type.nameTh ?? c.type.name : "-"} />
              <InfoRow
                label="หมวดหมู่ / Category"
                value={
                  c.category
                    ? `${c.category.nameTh ?? c.category.name}${
                        c.subcategory ? ` / ${c.subcategory.nameTh ?? c.subcategory.name}` : ""
                      }`
                    : "-"
                }
              />
              <InfoRow
                label="ผู้แจ้ง / Requester"
                value={
                  c.reporterName ??
                  c.requester?.name ??
                  "-"
                }
              />
              {c.reporterEmployeeCode && (
                <InfoRow label="รหัสพนักงาน / Staff ID" value={c.reporterEmployeeCode} />
              )}
              {c.reporterEmail && (
                <InfoRow
                  label="อีเมลผู้แจ้ง / Reporter email"
                  value={
                    <a href={`mailto:${c.reporterEmail}`} className="text-primary hover:underline">
                      {c.reporterEmail}
                    </a>
                  }
                />
              )}
              {c.reporterPhone && (
                <InfoRow
                  label="เบอร์ผู้แจ้ง / Reporter phone"
                  value={
                    <a href={`tel:${c.reporterPhone}`} className="text-primary hover:underline">
                      {c.reporterPhone}
                    </a>
                  }
                />
              )}
              <InfoRow label="แผนก / Department" value={c.department?.name ?? "-"} />
              <InfoRow label="สถานที่ / Location" value={c.location?.name ?? "-"} />
              <InfoRow
                label="อุปกรณ์ / Asset"
                value={
                  c.asset ? (
                    <Link href={`/assets/${c.asset.id}`} className="text-primary hover:underline">
                      {c.asset.assetTag} — {c.asset.name}
                      {c.asset.warrantyEnd
                        ? ` (ประกันถึง ${formatDate(c.asset.warrantyEnd)})`
                        : ""}
                    </Link>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="ผู้รับผิดชอบ / Assignee"
                value={
                  c.assignedUser?.name ??
                  (c.assignedTeam ? `ทีม ${c.assignedTeam.nameTh ?? c.assignedTeam.name}` : "-")
                }
              />
              <InfoRow label="ช่องทาง / Source" value={c.source} />
              <InfoRow
                label="ระดับผลกระทบ / Impact"
                value={
                  c.impact
                    ? `${IMPACT_LABEL[c.impact].icon} ${IMPACT_LABEL[c.impact].th}`
                    : "-"
                }
              />
              <InfoRow label="เปิดเมื่อ / Created" value={formatDateTime(c.createdAt)} />
              <InfoRow label="อัปเดต / Updated" value={formatDateTime(c.updatedAt)} />
            </dl>
            <div className="mt-4 border-t pt-3 text-sm">
              <p className="mb-1 text-muted-foreground">รายละเอียด / Description</p>
              <p className="whitespace-pre-wrap">{c.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* SLA */}
        <Card>
          <CardHeader>
            <CardTitle>SLA</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">ตอบกลับครั้งแรก / First response due</dt>
                <dd
                  className={cn(
                    "text-right",
                    TONE_CLASS[slaTone(c.firstResponseDueAt, c.firstResponseBreached, c.firstRespondedAt)]
                  )}
                >
                  {formatDateTime(c.firstResponseDueAt)}
                </dd>
              </div>
              {c.firstRespondedAt && (
                <InfoRow
                  label="ตอบกลับแล้วเมื่อ / First responded"
                  value={formatDateTime(c.firstRespondedAt)}
                />
              )}
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">แก้ไขภายใน / Resolution due</dt>
                <dd
                  className={cn(
                    "text-right",
                    TONE_CLASS[slaTone(c.resolutionDueAt, c.resolutionBreached, c.resolvedAt)]
                  )}
                >
                  {formatDateTime(c.resolutionDueAt)}
                </dd>
              </div>
              {c.resolvedAt && (
                <InfoRow label="แก้ไขแล้วเมื่อ / Resolved" value={formatDateTime(c.resolvedAt)} />
              )}
              {(c.firstResponseBreached || c.resolutionBreached) && (
                <p className="rounded-md bg-destructive/10 p-2 text-destructive">
                  เกิน SLA / SLA breached
                </p>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Agent controls */}
      {canWork && (
        <Card className="mt-4 border-primary/30">
          <CardHeader>
            <CardTitle>เครื่องมือเจ้าหน้าที่ / Agent controls</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <form
              action={transitionAction.bind(null, c.id)}
              className="flex flex-col gap-2 sm:col-span-1"
            >
              <Label htmlFor="to">เปลี่ยนสถานะ / Change status</Label>
              <Select id="to" name="to" defaultValue="" disabled={allowedTransitions.length === 0}>
                <option value="" disabled>
                  — เลือก / Select —
                </option>
                {allowedTransitions.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
              <Input name="resolutionNote" placeholder="บันทึกการแก้ไข / Resolution note" />
              <Button type="submit" variant="secondary" disabled={allowedTransitions.length === 0}>
                อัปเดตสถานะ / Update
              </Button>
            </form>

            <form
              action={overridePriorityAction.bind(null, c.id)}
              className="flex flex-col gap-2"
            >
              <Label htmlFor="priority">ปรับความเร่งด่วน / Override priority</Label>
              <Select id="priority" name="priority" defaultValue={c.priority}>
                {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                  <option key={p} value={p}>
                    {p} · {PRIORITY_LABEL[p].th}
                  </option>
                ))}
              </Select>
              <Input name="reason" placeholder="เหตุผล / Reason" />
              <Button type="submit" variant="secondary">
                บันทึก / Apply
              </Button>
            </form>

            <div className="flex flex-col gap-2">
              <Label>มอบหมาย / Assignment</Label>
              <form action={assignToMeAction.bind(null, c.id)}>
                <Button type="submit" variant="outline" className="w-full">
                  รับเคสนี้ / Assign to me
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversation */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>การสนทนา / Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {visibleComments.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่มีข้อความ / No messages yet.</p>
          )}
          {visibleComments.map((cm) => (
            <div key={cm.id} className="rounded-lg border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{cm.author?.name ?? "ระบบ / System"}</span>
                {cm.isInternal && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                    ภายใน / Internal
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(cm.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{cm.body}</p>
              {cm.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cm.attachments.map((a) => (
                    <Link
                      key={a.id}
                      href={`/api/support/attachments/${a.id}`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-primary hover:underline"
                    >
                      <Paperclip className="h-3 w-3" /> {a.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {!conversationClosed && (
            <form
              action={addCommentAction.bind(null, c.id)}
              className="space-y-2 border-t pt-4"
            >
              <Label htmlFor="body">ตอบกลับ / Reply</Label>
              <Textarea id="body" name="body" required rows={3} maxLength={5000} />
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  name="file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="max-w-xs"
                />
                {canWork && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="isInternal" /> บันทึกภายใน / Internal note
                  </label>
                )}
                <Button type="submit" className="ml-auto">
                  ส่ง / Send
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>ประวัติการทำงาน / Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {c.events.length === 0 && (
              <li className="text-muted-foreground">ไม่มีประวัติ / No activity.</li>
            )}
            {c.events.map((ev) => (
              <li key={ev.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                <div>
                  <span className="font-medium">{ev.action.replaceAll("_", " ")}</span>
                  {ev.fromStatus && ev.toStatus && (
                    <span className="text-muted-foreground">
                      {" "}
                      {ev.fromStatus} → {ev.toStatus}
                    </span>
                  )}
                  {ev.actorId && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {actorMap.get(ev.actorId) ?? "—"}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(ev.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
