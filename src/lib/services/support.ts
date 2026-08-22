/**
 * IT Support / ITSM case engine.
 *
 * One place for: case-number generation, the priority engine (impact +
 * category → P1–P4), SLA due-date calculation (business hours + holidays +
 * pause), auto-assignment strategies, workflow transition guards, work-log,
 * and notification fan-out. Every UI/API entry point goes through here so the
 * rules stay consistent and auditable.
 *
 * Reuses existing infrastructure: Asset / Employee / Department / Location /
 * User / Notification / AuditLog / storage — no duplicate entities.
 */
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { AuthError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { pushLineMessage } from "@/lib/services/notify";
import type {
  CasePriority, CaseImpact, CaseStatus, CaseSource, SupportCase, Prisma,
} from "@prisma/client";

// ---------------- Case number ----------------

/**
 * Format: IT-<PREFIX>-<YEAR>-<000001>, per type prefix, sequential within
 * org+year+prefix. Retries on unique collision.
 */
export async function nextCaseNumber(
  organizationId: string,
  prefix: string,
  year: number
): Promise<string> {
  const like = `IT-${prefix}-${year}-%`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const count = await prisma.supportCase.count({
      where: { organizationId, caseNumber: { startsWith: `IT-${prefix}-${year}-` } },
    });
    const candidate = `IT-${prefix}-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const exists = await prisma.supportCase.findFirst({
      where: { organizationId, caseNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // Fallback: timestamp-based suffix (deterministic order not required)
  void like;
  throw new AuthError("CASE_NUMBER_CONFLICT", 409);
}

// ---------------- Priority engine ----------------

const IMPACT_BASE: Record<CaseImpact, CasePriority> = {
  UNUSABLE: "P1",
  MAJOR: "P2",
  PARTIAL: "P3",
  GENERAL: "P4",
};

const ORDER: CasePriority[] = ["P1", "P2", "P3", "P4"];

function raise(p: CasePriority, steps: number): CasePriority {
  const i = Math.max(0, ORDER.indexOf(p) - steps);
  return ORDER[i];
}

/**
 * Compute priority from user-reported impact, nudged by category signals
 * (Security/Network categories escalate one level). A category's explicit
 * defaultPriority wins when set. IT can still override afterwards.
 */
export function computePriority(
  impact: CaseImpact | null | undefined,
  opts: { categoryName?: string | null; categoryDefault?: CasePriority | null }
): CasePriority {
  if (opts.categoryDefault) return opts.categoryDefault;
  let p = impact ? IMPACT_BASE[impact] : "P3";
  const name = (opts.categoryName ?? "").toLowerCase();
  if (/security|phishing|malware|virus|ransom|compromise/.test(name)) p = raise(p, 1);
  if (/network|internet|firewall|server/.test(name)) p = raise(p, 1);
  return p;
}

// ---------------- SLA calculation ----------------

export interface BusinessHours {
  // 0=Sunday..6=Saturday; each day: [startMinuteOfDay, endMinuteOfDay] or null (closed)
  days: Array<[number, number] | null>;
  timezoneOffsetMinutes: number; // e.g. Asia/Bangkok = 420
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  // Mon–Fri 08:30–17:30
  days: [null, [510, 1050], [510, 1050], [510, 1050], [510, 1050], [510, 1050], null],
  timezoneOffsetMinutes: 420,
};

/**
 * Add `minutes` of SLA time to `from`. When businessHoursOnly, only counts
 * time inside configured business hours and skips holidays; otherwise 24/7.
 */
export function addSlaMinutes(
  from: Date,
  minutes: number,
  businessHoursOnly: boolean,
  bh: BusinessHours,
  holidays: Set<string> // yyyy-mm-dd (local)
): Date {
  if (!businessHoursOnly) return new Date(from.getTime() + minutes * 60_000);

  const tz = bh.timezoneOffsetMinutes;
  let remaining = minutes;
  // Work in local time by shifting
  const cursor = new Date(from.getTime());
  let guard = 0;
  while (remaining > 0 && guard++ < 100_000) {
    const local = new Date(cursor.getTime() + tz * 60_000);
    const dow = local.getUTCDay();
    const dayKey = local.toISOString().slice(0, 10);
    const window = bh.days[dow];
    const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (!window || holidays.has(dayKey)) {
      // jump to next day's start
      advanceToNextDay(cursor, tz);
      continue;
    }
    const [start, end] = window;
    if (minuteOfDay < start) {
      cursor.setTime(cursor.getTime() + (start - minuteOfDay) * 60_000);
      continue;
    }
    if (minuteOfDay >= end) {
      advanceToNextDay(cursor, tz);
      continue;
    }
    const availableToday = end - minuteOfDay;
    if (remaining <= availableToday) {
      cursor.setTime(cursor.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= availableToday;
      advanceToNextDay(cursor, tz);
    }
  }
  return cursor;
}

function advanceToNextDay(cursor: Date, tz: number) {
  const local = new Date(cursor.getTime() + tz * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + 1);
  cursor.setTime(local.getTime() - tz * 60_000);
}

export async function loadSlaContext(organizationId: string) {
  const [policies, holidays, setting] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { organizationId } }),
    prisma.holiday.findMany({ where: { organizationId } }),
    prisma.systemSetting.findFirst({
      where: { organizationId, key: "support.businessHours" },
    }),
  ]);
  const bh =
    (setting?.value as unknown as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const byPriority = new Map(policies.map((p) => [p.priority, p]));
  return { byPriority, bh, holidaySet };
}

// ---------------- Auto assignment ----------------

/**
 * Pick an assignee within a team by strategy. Returns userId or null.
 * ROUND_ROBIN advances the team cursor; LEAST_WORKLOAD counts open cases.
 */
export async function pickAssignee(
  teamId: string,
  strategy: "ROUND_ROBIN" | "LEAST_WORKLOAD"
): Promise<string | null> {
  const members = await prisma.supportTeamMember.findMany({
    where: { teamId },
    select: { userId: true },
    orderBy: { userId: "asc" },
  });
  if (members.length === 0) return null;

  if (strategy === "LEAST_WORKLOAD") {
    const counts = await prisma.supportCase.groupBy({
      by: ["assignedUserId"],
      where: {
        assignedUserId: { in: members.map((m) => m.userId) },
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DUPLICATE"] },
        deletedAt: null,
      },
      _count: true,
    });
    const load = new Map(counts.map((c) => [c.assignedUserId, c._count]));
    let best = members[0].userId;
    let bestLoad = Infinity;
    for (const m of members) {
      const l = load.get(m.userId) ?? 0;
      if (l < bestLoad) { bestLoad = l; best = m.userId; }
    }
    return best;
  }

  // ROUND_ROBIN
  const team = await prisma.supportTeam.findUnique({ where: { id: teamId } });
  const idx = ((team?.lastAssignedIndex ?? 0) + 1) % members.length;
  await prisma.supportTeam.update({
    where: { id: teamId },
    data: { lastAssignedIndex: idx },
  });
  return members[idx].userId;
}

// ---------------- Notifications ----------------

async function notifyUsers(
  organizationId: string,
  userIds: string[],
  n: { type: string; level?: "INFO" | "WARNING" | "CRITICAL"; title: string; body: string; link: string }
) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      organizationId,
      userId,
      type: n.type,
      level: n.level ?? "INFO",
      title: n.title,
      body: n.body,
      link: n.link,
    })),
  });
}

async function teamMemberIds(teamId: string | null | undefined): Promise<string[]> {
  if (!teamId) return [];
  const m = await prisma.supportTeamMember.findMany({
    where: { teamId }, select: { userId: true },
  });
  return m.map((x) => x.userId);
}

// ---------------- Workflow transitions ----------------

// Allowed status transitions (guards enforced separately for special cases).
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ["TRIAGE", "ASSIGNED", "CANCELLED", "DUPLICATE"],
  TRIAGE: ["ASSIGNED", "IN_PROGRESS", "CANCELLED", "DUPLICATE"],
  ASSIGNED: ["IN_PROGRESS", "TRIAGE", "CANCELLED"],
  IN_PROGRESS: ["WAITING_USER", "WAITING_VENDOR", "RESOLVED", "ASSIGNED"],
  WAITING_USER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_VENDOR: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "ASSIGNED"],
  CANCELLED: [],
  DUPLICATE: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

const PAUSED_STATUSES: CaseStatus[] = ["WAITING_USER", "WAITING_VENDOR"];

async function recordEvent(
  caseId: string,
  actorId: string | null,
  action: string,
  extra?: { fromStatus?: CaseStatus; toStatus?: CaseStatus; detail?: object }
) {
  await prisma.caseEvent.create({
    data: {
      caseId,
      actorId,
      action,
      fromStatus: extra?.fromStatus,
      toStatus: extra?.toStatus,
      detail: extra?.detail ? JSON.parse(JSON.stringify(extra.detail)) : undefined,
    },
  });
}

// ---------------- Create ----------------

export interface CreateCaseInput {
  subject: string;
  description: string;
  typeId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  impact?: CaseImpact | null;
  locationId?: string | null;
  assetId?: string | null;
  source?: CaseSource;
  // On-behalf: requester differs from creator (agents only)
  requesterUserId?: string | null;
  // Reporter identity captured on the form (name + staff ID of who reported it)
  reporterName?: string | null;
  reporterEmployeeCode?: string | null;
  attachments?: Array<{ name: string; storagePath: string; contentType?: string; sizeBytes?: number }>;
}

export async function createCase(user: CurrentUser, input: CreateCaseInput) {
  if (!user.permissions.has("support:create")) throw new AuthError("FORBIDDEN", 403);

  // Resolve requester (self, or someone else when on-behalf + privileged)
  let requesterUserId = user.id;
  if (input.requesterUserId && input.requesterUserId !== user.id) {
    if (!user.permissions.has("support:work") && !user.permissions.has("support:manage")) {
      throw new AuthError("FORBIDDEN_ON_BEHALF", 403);
    }
    const target = await prisma.user.findFirst({
      where: { id: input.requesterUserId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (target) requesterUserId = target.id;
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterUserId },
    include: { employee: { select: { id: true, departmentId: true, locationId: true } } },
  });

  // Category + type resolution (org-scoped)
  const category = input.categoryId
    ? await prisma.caseCategory.findFirst({
        where: { id: input.categoryId, organizationId: user.organizationId },
      })
    : null;
  const type = input.typeId
    ? await prisma.caseType.findFirst({
        where: { id: input.typeId, organizationId: user.organizationId },
      })
    : await prisma.caseType.findFirst({
        where: { organizationId: user.organizationId, key: "INCIDENT" },
      });

  // Asset (must belong to org) — pull dept/location context from it if present
  const asset = input.assetId
    ? await prisma.asset.findFirst({
        where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
        select: { id: true, departmentId: true, locationId: true },
      })
    : null;

  const priority = computePriority(input.impact, {
    categoryName: category?.name,
    categoryDefault: category?.defaultPriority ?? null,
  });

  // SLA due dates from creation time
  const sla = await loadSlaContext(user.organizationId);
  const policy = sla.byPriority.get(priority);
  const now = new Date();
  const firstResponseDueAt = policy
    ? addSlaMinutes(now, policy.firstResponseMins, policy.businessHoursOnly, sla.bh, sla.holidaySet)
    : null;
  const resolutionDueAt = policy
    ? addSlaMinutes(now, policy.resolutionMins, policy.businessHoursOnly, sla.bh, sla.holidaySet)
    : null;

  const prefix = type?.prefix ?? "INC";
  const caseNumber = await nextCaseNumber(user.organizationId, prefix, now.getUTCFullYear());

  // Auto-assign by category → team
  let assignedTeamId: string | null = category?.assignTeamId ?? null;
  let assignedUserId: string | null = null;
  if (!assignedTeamId) {
    const defaultTeam = await prisma.supportTeam.findFirst({
      where: { organizationId: user.organizationId, active: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    assignedTeamId = defaultTeam?.id ?? null;
  }
  if (assignedTeamId) {
    assignedUserId = await pickAssignee(assignedTeamId, "LEAST_WORKLOAD");
  }

  const departmentId =
    input.locationId ? undefined : undefined; // placeholder to keep types simple
  void departmentId;

  const created = await prisma.supportCase.create({
    data: {
      organizationId: user.organizationId,
      caseNumber,
      subject: input.subject,
      description: input.description,
      typeId: type?.id ?? null,
      categoryId: category?.id ?? null,
      subcategoryId: input.subcategoryId ?? null,
      impact: input.impact ?? null,
      priority,
      status: assignedUserId ? "ASSIGNED" : "NEW",
      source: input.source ?? "WEB",
      requesterId: requesterUserId,
      requesterEmployeeId: requester?.employee?.id ?? null,
      onBehalf: requesterUserId !== user.id,
      createdById: user.id,
      reporterName: input.reporterName ?? null,
      reporterEmployeeCode: input.reporterEmployeeCode ?? null,
      departmentId: asset?.departmentId ?? requester?.employee?.departmentId ?? null,
      locationId: input.locationId ?? asset?.locationId ?? requester?.employee?.locationId ?? null,
      assetId: asset?.id ?? null,
      assignedTeamId,
      assignedUserId,
      firstResponseDueAt,
      resolutionDueAt,
      attachments: input.attachments?.length
        ? {
            createMany: {
              data: input.attachments.map((a) => ({
                name: a.name,
                storagePath: a.storagePath,
                contentType: a.contentType ?? null,
                sizeBytes: a.sizeBytes ?? null,
                uploadedById: user.id,
              })),
            },
          }
        : undefined,
    },
  });

  await recordEvent(created.id, user.id, "CREATED", { toStatus: created.status, detail: { priority, caseNumber } });
  if (assignedUserId) {
    await recordEvent(created.id, user.id, "ASSIGNED", { detail: { assignedUserId, assignedTeamId } });
  }

  await auditLog(user, {
    action: "CREATE", entityType: "SUPPORT_CASE", entityId: created.id,
    detail: { caseNumber, priority, typeId: type?.id, categoryId: category?.id },
  });

  // Notify requester + queue/assignee
  await notifyUsers(user.organizationId, [requesterUserId], {
    type: "CASE_CREATED", title: `เปิดเคสสำเร็จ / Case created ${caseNumber}`,
    body: `${input.subject} — สถานะ ${created.status}, ความสำคัญ ${priority}`,
    link: `/support/${created.id}`,
  });
  const queueIds = assignedUserId ? [assignedUserId] : await teamMemberIds(assignedTeamId);
  await notifyUsers(user.organizationId, queueIds, {
    type: "CASE_ASSIGNED", level: priority === "P1" ? "CRITICAL" : "INFO",
    title: `เคสใหม่ ${caseNumber} (${priority})`,
    body: input.subject,
    link: `/support/${created.id}`,
  });
  if (priority === "P1") {
    await pushLineMessage(`ITBox: เคสวิกฤต ${caseNumber} — ${input.subject}`);
  }

  return created;
}

// ---------------- Public (anonymous web) intake ----------------

export interface PublicCaseInput {
  reporterName: string;
  reporterEmail: string;
  reporterPhone?: string | null;
  subject: string;
  description: string;
  typeId?: string | null;
  impact?: CaseImpact | null;
}

/**
 * Open a case from the public web-intake form (/report/<org-slug>). No user
 * account is involved: the reporter is captured as free-text contact fields and
 * the case is created with requester/creator = null, source = WEB. It still
 * flows through the same priority/SLA/numbering/auto-assign/notify engine so
 * agents pick it up exactly like any other case.
 *
 * Callers MUST rate-limit and validate input first (see the route action).
 */
export async function createPublicCase(
  organizationId: string,
  input: PublicCaseInput
) {
  // Type: caller-chosen (validated to this org) or the org's INCIDENT default.
  const type = input.typeId
    ? await prisma.caseType.findFirst({
        where: { id: input.typeId, organizationId, active: true, deletedAt: null },
      })
    : await prisma.caseType.findFirst({
        where: { organizationId, key: "INCIDENT" },
      });

  const priority = computePriority(input.impact, { categoryName: null, categoryDefault: null });

  const sla = await loadSlaContext(organizationId);
  const policy = sla.byPriority.get(priority);
  const now = new Date();
  const firstResponseDueAt = policy
    ? addSlaMinutes(now, policy.firstResponseMins, policy.businessHoursOnly, sla.bh, sla.holidaySet)
    : null;
  const resolutionDueAt = policy
    ? addSlaMinutes(now, policy.resolutionMins, policy.businessHoursOnly, sla.bh, sla.holidaySet)
    : null;

  const prefix = type?.prefix ?? "INC";
  const caseNumber = await nextCaseNumber(organizationId, prefix, now.getUTCFullYear());

  // Auto-assign to the default team (public cases carry no category routing).
  const defaultTeam = await prisma.supportTeam.findFirst({
    where: { organizationId, active: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const assignedTeamId = defaultTeam?.id ?? null;
  const assignedUserId = assignedTeamId ? await pickAssignee(assignedTeamId, "LEAST_WORKLOAD") : null;

  const created = await prisma.supportCase.create({
    data: {
      organizationId,
      caseNumber,
      subject: input.subject,
      description: input.description,
      typeId: type?.id ?? null,
      impact: input.impact ?? null,
      priority,
      status: assignedUserId ? "ASSIGNED" : "NEW",
      source: "WEB",
      requesterId: null,
      createdById: null,
      onBehalf: false,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail,
      reporterPhone: input.reporterPhone ?? null,
      assignedTeamId,
      assignedUserId,
      firstResponseDueAt,
      resolutionDueAt,
    },
  });

  await recordEvent(created.id, null, "CREATED", {
    toStatus: created.status,
    detail: { priority, caseNumber, via: "public-web", reporter: input.reporterEmail },
  });
  if (assignedUserId) {
    await recordEvent(created.id, null, "ASSIGNED", { detail: { assignedUserId, assignedTeamId } });
  }

  await auditLog(null, {
    organizationId,
    action: "CREATE",
    entityType: "SUPPORT_CASE",
    entityId: created.id,
    detail: { caseNumber, priority, source: "WEB", reporterEmail: input.reporterEmail },
  });

  // Notify the queue/assignee (there is no internal requester to notify).
  const queueIds = assignedUserId ? [assignedUserId] : await teamMemberIds(assignedTeamId);
  await notifyUsers(organizationId, queueIds, {
    type: "CASE_ASSIGNED",
    level: priority === "P1" ? "CRITICAL" : "INFO",
    title: `เคสใหม่จากเว็บ ${caseNumber} (${priority})`,
    body: `${input.subject} — ผู้แจ้ง ${input.reporterName} <${input.reporterEmail}>`,
    link: `/support/${created.id}`,
  });
  if (priority === "P1") {
    await pushLineMessage(`ITBox: เคสวิกฤต (เว็บ) ${caseNumber} — ${input.subject}`);
  }

  return created;
}

// ---------------- Access ----------------

/** Whether the caller may view a case (requester, assignee, or agent). */
export function canViewCase(user: CurrentUser, c: Pick<SupportCase, "requesterId" | "createdById" | "assignedUserId">): boolean {
  if (user.permissions.has("support:read") || user.permissions.has("support:manage")) return true;
  return c.requesterId === user.id || c.createdById === user.id || c.assignedUserId === user.id;
}

export async function getCaseOrThrow(user: CurrentUser, id: string) {
  const c = await prisma.supportCase.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!c) throw new AuthError("NOT_FOUND", 404);
  if (!canViewCase(user, c)) throw new AuthError("FORBIDDEN", 403);
  return c;
}

// ---------------- Comments / conversation ----------------

export async function addComment(
  user: CurrentUser,
  caseId: string,
  body: string,
  opts: { isInternal?: boolean; attachments?: Array<{ name: string; storagePath: string; contentType?: string; sizeBytes?: number }> } = {}
) {
  const c = await getCaseOrThrow(user, caseId);
  const isAgent = user.permissions.has("support:work") || user.permissions.has("support:manage");
  const isInternal = !!opts.isInternal && isAgent;

  const comment = await prisma.caseComment.create({
    data: {
      caseId: c.id,
      authorId: user.id,
      body,
      isInternal,
      attachments: opts.attachments?.length
        ? {
            createMany: {
              data: opts.attachments.map((a) => ({
                caseId: c.id,
                name: a.name,
                storagePath: a.storagePath,
                contentType: a.contentType ?? null,
                sizeBytes: a.sizeBytes ?? null,
                uploadedById: user.id,
              })),
            },
          }
        : undefined,
    },
  });

  const data: Prisma.SupportCaseUpdateInput = {};
  // First agent public reply satisfies First Response SLA
  if (isAgent && !isInternal && !c.firstRespondedAt) {
    data.firstRespondedAt = new Date();
  }
  // A user reply on a waiting case resumes work
  if (!isAgent && c.status === "WAITING_USER") {
    data.status = "IN_PROGRESS";
    await resumeSla(c);
    await recordEvent(c.id, user.id, "STATUS_CHANGE", { fromStatus: c.status, toStatus: "IN_PROGRESS", detail: { reason: "user_reply" } });
  }
  if (Object.keys(data).length) {
    await prisma.supportCase.update({ where: { id: c.id }, data });
  }
  await recordEvent(c.id, user.id, "COMMENT", { detail: { isInternal } });

  // Notify the other party (public comments only)
  if (!isInternal) {
    const recipients = isAgent
      ? [c.requesterId].filter(Boolean) as string[]
      : [c.assignedUserId, ...(await teamMemberIds(c.assignedTeamId))].filter(Boolean) as string[];
    await notifyUsers(user.organizationId, recipients, {
      type: "CASE_COMMENT", title: `ข้อความใหม่ในเคส ${c.caseNumber}`,
      body: body.slice(0, 120), link: `/support/${c.id}`,
    });
  }
  await auditLog(user, { action: "COMMENT", entityType: "SUPPORT_CASE", entityId: c.id, detail: { isInternal } });
  return comment;
}

// ---------------- SLA pause/resume ----------------

async function pauseSla(c: SupportCase) {
  if (c.slaPausedAt) return;
  await prisma.supportCase.update({ where: { id: c.id }, data: { slaPausedAt: new Date() } });
}

async function resumeSla(c: SupportCase) {
  if (!c.slaPausedAt) return;
  const pausedMs = Date.now() - c.slaPausedAt.getTime();
  // Shift due dates forward by the paused duration
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + pausedMs) : null);
  await prisma.supportCase.update({
    where: { id: c.id },
    data: {
      slaPausedAt: null,
      slaPausedMs: c.slaPausedMs + BigInt(pausedMs),
      firstResponseDueAt: c.firstRespondedAt ? c.firstResponseDueAt : shift(c.firstResponseDueAt),
      resolutionDueAt: shift(c.resolutionDueAt),
    },
  });
}

// ---------------- Transition (agents) ----------------

export async function transitionCase(
  user: CurrentUser,
  caseId: string,
  to: CaseStatus,
  opts: { resolutionNote?: string; reason?: string } = {}
) {
  if (!user.permissions.has("support:work") && !user.permissions.has("support:manage")) {
    throw new AuthError("FORBIDDEN", 403);
  }
  const c = await getCaseOrThrow(user, caseId);
  if (!canTransition(c.status, to)) {
    throw new AuthError(`INVALID_TRANSITION:${c.status}->${to}`, 400);
  }
  // Guard: P1 cannot be RESOLVED/CLOSED without a resolution note
  if ((to === "RESOLVED" || to === "CLOSED") && c.priority === "P1" && !opts.resolutionNote && !c.resolutionNote) {
    throw new AuthError("RESOLUTION_NOTE_REQUIRED", 400);
  }
  // Only managers may reopen a CLOSED case
  if (c.status === "CLOSED" && to === "REOPENED" && !user.permissions.has("support:manage")) {
    throw new AuthError("FORBIDDEN_REOPEN", 403);
  }

  const data: Prisma.SupportCaseUpdateInput = { status: to };
  const now = new Date();

  if (to === "RESOLVED") {
    data.resolvedAt = now;
    if (opts.resolutionNote) data.resolutionNote = opts.resolutionNote;
    if (c.slaPausedAt) await resumeSla(c);
  }
  if (to === "CLOSED") {
    data.closedAt = now;
    if (opts.resolutionNote) data.resolutionNote = opts.resolutionNote;
  }
  if (to === "REOPENED") {
    data.reopenCount = { increment: 1 };
    data.resolvedAt = null;
    data.closedAt = null;
  }
  // Pause/resume SLA on waiting states
  if (PAUSED_STATUSES.includes(to)) {
    await pauseSla(c);
  } else if (PAUSED_STATUSES.includes(c.status) && !PAUSED_STATUSES.includes(to)) {
    await resumeSla(c);
  }

  const updated = await prisma.supportCase.update({ where: { id: c.id }, data });
  await recordEvent(c.id, user.id, "STATUS_CHANGE", { fromStatus: c.status, toStatus: to, detail: { reason: opts.reason } });
  await auditLog(user, { action: "UPDATE", entityType: "SUPPORT_CASE", entityId: c.id, detail: { status: to } });

  // Notify requester on user-visible transitions
  const notifyStatuses: CaseStatus[] = ["WAITING_USER", "RESOLVED", "CLOSED", "REOPENED", "IN_PROGRESS"];
  if (c.requesterId && notifyStatuses.includes(to)) {
    await notifyUsers(user.organizationId, [c.requesterId], {
      type: "CASE_STATUS",
      level: to === "WAITING_USER" ? "WARNING" : "INFO",
      title: `เคส ${c.caseNumber}: ${to.replaceAll("_", " ")}`,
      body:
        to === "WAITING_USER" ? "IT Support ต้องการข้อมูลเพิ่มเติมจากคุณ"
        : to === "RESOLVED" ? "เคสได้รับการแก้ไขแล้ว กรุณายืนยัน"
        : to === "CLOSED" ? "เคสถูกปิดแล้ว"
        : `สถานะเปลี่ยนเป็น ${to.replaceAll("_", " ")}`,
      link: `/support/${c.id}`,
    });
  }
  return updated;
}

// ---------------- Assignment (agents) ----------------

export async function assignCase(
  user: CurrentUser,
  caseId: string,
  input: { teamId?: string | null; userId?: string | null }
) {
  if (!user.permissions.has("support:work") && !user.permissions.has("support:manage")) {
    throw new AuthError("FORBIDDEN", 403);
  }
  const c = await getCaseOrThrow(user, caseId);
  // Non-managers can only self-assign
  if (!user.permissions.has("support:manage") && input.userId && input.userId !== user.id) {
    throw new AuthError("FORBIDDEN_ASSIGN_OTHER", 403);
  }
  const data: Prisma.SupportCaseUpdateInput = {};
  if (input.teamId !== undefined) {
    data.assignedTeam = input.teamId ? { connect: { id: input.teamId } } : { disconnect: true };
  }
  if (input.userId !== undefined) {
    data.assignedUser = input.userId ? { connect: { id: input.userId } } : { disconnect: true };
  }
  if (c.status === "NEW" || c.status === "TRIAGE") data.status = "ASSIGNED";
  const updated = await prisma.supportCase.update({ where: { id: c.id }, data });
  await recordEvent(c.id, user.id, "ASSIGNED", { detail: { teamId: input.teamId, userId: input.userId } });
  await auditLog(user, { action: "ASSIGN", entityType: "SUPPORT_CASE", entityId: c.id, detail: { teamId: input.teamId, userId: input.userId } });
  if (input.userId) {
    await notifyUsers(user.organizationId, [input.userId], {
      type: "CASE_ASSIGNED", title: `คุณได้รับมอบหมายเคส ${c.caseNumber}`,
      body: c.subject, link: `/support/${c.id}`,
    });
  }
  return updated;
}

/** Agent overrides priority (recomputes SLA due dates from now). */
export async function overridePriority(user: CurrentUser, caseId: string, priority: CasePriority, reason?: string) {
  if (!user.permissions.has("support:work") && !user.permissions.has("support:manage")) {
    throw new AuthError("FORBIDDEN", 403);
  }
  const c = await getCaseOrThrow(user, caseId);
  const sla = await loadSlaContext(user.organizationId);
  const policy = sla.byPriority.get(priority);
  const now = new Date();
  await prisma.supportCase.update({
    where: { id: c.id },
    data: {
      priority,
      priorityOverridden: true,
      firstResponseDueAt: c.firstRespondedAt
        ? c.firstResponseDueAt
        : policy ? addSlaMinutes(now, policy.firstResponseMins, policy.businessHoursOnly, sla.bh, sla.holidaySet) : c.firstResponseDueAt,
      resolutionDueAt: policy
        ? addSlaMinutes(now, policy.resolutionMins, policy.businessHoursOnly, sla.bh, sla.holidaySet)
        : c.resolutionDueAt,
    },
  });
  await recordEvent(c.id, user.id, "PRIORITY_CHANGE", { detail: { from: c.priority, to: priority, reason } });
  await auditLog(user, { action: "UPDATE", entityType: "SUPPORT_CASE", entityId: c.id, detail: { priority, reason } });
}

// ---------------- User confirm / reopen / CSAT ----------------

export async function confirmResolution(user: CurrentUser, caseId: string, satisfied: boolean, reason?: string) {
  const c = await getCaseOrThrow(user, caseId);
  if (c.requesterId !== user.id) throw new AuthError("FORBIDDEN", 403);
  if (c.status !== "RESOLVED") throw new AuthError("NOT_RESOLVED", 400);

  if (satisfied) {
    await prisma.supportCase.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await recordEvent(c.id, user.id, "STATUS_CHANGE", { fromStatus: "RESOLVED", toStatus: "CLOSED", detail: { by: "user_confirm" } });
  } else {
    await prisma.supportCase.update({
      where: { id: c.id },
      data: { status: "REOPENED", reopenCount: { increment: 1 }, resolvedAt: null },
    });
    await recordEvent(c.id, user.id, "REOPENED", { fromStatus: "RESOLVED", toStatus: "REOPENED", detail: { reason } });
    const agents = [c.assignedUserId, ...(await teamMemberIds(c.assignedTeamId))].filter(Boolean) as string[];
    await notifyUsers(user.organizationId, agents, {
      type: "CASE_REOPENED", level: "WARNING",
      title: `เคส ${c.caseNumber} ถูกเปิดใหม่`, body: reason ?? "ผู้ใช้แจ้งว่ายังแก้ไม่สำเร็จ",
      link: `/support/${c.id}`,
    });
  }
  await auditLog(user, { action: "UPDATE", entityType: "SUPPORT_CASE", entityId: c.id, detail: { confirm: satisfied } });
}

export async function submitSatisfaction(user: CurrentUser, caseId: string, rating: number, comment?: string) {
  const c = await getCaseOrThrow(user, caseId);
  if (c.requesterId !== user.id) throw new AuthError("FORBIDDEN", 403);
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  await prisma.caseSatisfaction.upsert({
    where: { caseId: c.id },
    update: { rating: r, comment: comment ?? null },
    create: { caseId: c.id, rating: r, comment: comment ?? null },
  });
  await recordEvent(c.id, user.id, "CSAT", { detail: { rating: r } });
}

// ---------------- SLA sweep (cron) ----------------

/**
 * Called by the daily/periodic cron: flag SLA warnings/breaches and escalate.
 * Returns count of notifications sent.
 */
export async function runSlaSweep(): Promise<number> {
  const now = new Date();
  let sent = 0;
  const orgs = await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const org of orgs) {
    const openCases = await prisma.supportCase.findMany({
      where: {
        organizationId: org.id,
        deletedAt: null,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DUPLICATE"] },
        slaPausedAt: null,
      },
      select: {
        id: true, caseNumber: true, subject: true, priority: true, assignedUserId: true,
        assignedTeamId: true, resolutionDueAt: true, resolutionBreached: true,
        firstResponseDueAt: true, firstRespondedAt: true, firstResponseBreached: true,
      },
      take: 1000,
    });
    const managers = await prisma.user.findMany({
      where: {
        organizationId: org.id, deletedAt: null, status: "ACTIVE",
        userRoles: { some: { role: { key: { in: ["IT_MANAGER", "SUPER_ADMIN", "ADMIN"] } } } },
      },
      select: { id: true },
    });
    const managerIds = managers.map((m) => m.id);

    for (const c of openCases) {
      // First response breach
      if (!c.firstRespondedAt && !c.firstResponseBreached && c.firstResponseDueAt && c.firstResponseDueAt < now) {
        await prisma.supportCase.update({ where: { id: c.id }, data: { firstResponseBreached: true } });
        await recordEvent(c.id, null, "SLA_BREACH", { detail: { kind: "first_response" } });
        const ids = [c.assignedUserId, ...managerIds].filter(Boolean) as string[];
        await notifyUsers(org.id, ids, {
          type: "SLA_BREACH", level: "CRITICAL",
          title: `SLA เกินกำหนด (First Response) — ${c.caseNumber}`, body: c.subject,
          link: `/support/${c.id}`,
        });
        sent += ids.length;
      }
      // Resolution breach
      if (!c.resolutionBreached && c.resolutionDueAt && c.resolutionDueAt < now) {
        await prisma.supportCase.update({ where: { id: c.id }, data: { resolutionBreached: true } });
        await recordEvent(c.id, null, "SLA_BREACH", { detail: { kind: "resolution" } });
        const ids = [c.assignedUserId, ...managerIds].filter(Boolean) as string[];
        await notifyUsers(org.id, ids, {
          type: "SLA_BREACH", level: "CRITICAL",
          title: `SLA เกินกำหนด (Resolution) — ${c.caseNumber}`, body: c.subject,
          link: `/support/${c.id}`,
        });
        sent += ids.length;
      }
    }
  }
  return sent;
}

export const PRIORITY_LABEL: Record<CasePriority, { th: string; en: string }> = {
  P1: { th: "วิกฤต", en: "Critical" },
  P2: { th: "สูง", en: "High" },
  P3: { th: "ปกติ", en: "Normal" },
  P4: { th: "ต่ำ", en: "Low" },
};

export const IMPACT_LABEL: Record<CaseImpact, { th: string; en: string; icon: string }> = {
  UNUSABLE: { th: "ใช้งานไม่ได้เลย", en: "Cannot work at all", icon: "🔴" },
  MAJOR: { th: "งานสำคัญได้รับผลกระทบ", en: "Major impact", icon: "🟠" },
  PARTIAL: { th: "ใช้งานได้บางส่วน", en: "Partial impact", icon: "🟡" },
  GENERAL: { th: "ขอความช่วยเหลือทั่วไป", en: "General request", icon: "🟢" },
};
