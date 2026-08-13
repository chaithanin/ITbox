"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

/**
 * IT Support settings — admin server actions.
 * Every entry point is gated by `support:settings`, org-scoped, audited and
 * revalidates its page. Validation failures redirect with ?error= (never 500).
 */

// ---------------- helpers ----------------

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
const ROLE_KEYS = ["IT_MANAGER", "SECURITY_ADMIN", "ADMIN"] as const;

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}
/** "" / invalid → null, else the string. */
function nullableStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// ============================================================
// Case types
// ============================================================

const caseTypeSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  name: z.string().min(1).max(120),
  nameTh: z.string().max(120).nullable(),
  prefix: z.string().regex(/^[A-Z]{2,4}$/),
  description: z.string().max(500).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

export async function createCaseType(formData: FormData) {
  const user = await requirePermission("support:settings");
  const parsed = caseTypeSchema.safeParse({
    key: str(formData.get("key")).toUpperCase(),
    name: str(formData.get("name")),
    nameTh: nullableStr(formData.get("nameTh")),
    prefix: str(formData.get("prefix")).toUpperCase(),
    description: nullableStr(formData.get("description")),
    sortOrder: Number(str(formData.get("sortOrder")) || "0"),
    active: bool(formData.get("active")),
  });
  if (!parsed.success) redirect("/settings/support/types?error=invalid-input");
  const input = parsed.data;

  const dup = await prisma.caseType.findFirst({
    where: { organizationId: user.organizationId, key: input.key },
    select: { id: true },
  });
  if (dup) redirect("/settings/support/types?error=key-exists");

  const row = await prisma.caseType.create({
    data: { ...input, organizationId: user.organizationId },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "CASE_TYPE",
    entityId: row.id,
    detail: { key: input.key, prefix: input.prefix },
  });
  revalidatePath("/settings/support/types");
  redirect("/settings/support/types?ok=type-created");
}

export async function updateCaseType(id: string, formData: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.caseType.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/types?error=not-found");

  const parsed = caseTypeSchema.safeParse({
    key: str(formData.get("key")).toUpperCase(),
    name: str(formData.get("name")),
    nameTh: nullableStr(formData.get("nameTh")),
    prefix: str(formData.get("prefix")).toUpperCase(),
    description: nullableStr(formData.get("description")),
    sortOrder: Number(str(formData.get("sortOrder")) || "0"),
    active: bool(formData.get("active")),
  });
  if (!parsed.success) redirect(`/settings/support/types/${id}/edit?error=invalid-input`);
  const input = parsed.data;

  // System types cannot change their key
  const key = existing!.isSystem ? existing!.key : input.key;
  if (!existing!.isSystem && key !== existing!.key) {
    const dup = await prisma.caseType.findFirst({
      where: { organizationId: user.organizationId, key, id: { not: id } },
      select: { id: true },
    });
    if (dup) redirect(`/settings/support/types/${id}/edit?error=key-exists`);
  }

  await prisma.caseType.update({
    where: { id },
    data: {
      key,
      name: input.name,
      nameTh: input.nameTh,
      prefix: input.prefix,
      description: input.description,
      sortOrder: input.sortOrder,
      active: input.active,
    },
  });
  await auditLog(user, { action: "UPDATE", entityType: "CASE_TYPE", entityId: id, detail: { key } });
  revalidatePath("/settings/support/types");
  redirect("/settings/support/types?ok=type-updated");
}

export async function toggleCaseType(id: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.caseType.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/types?error=not-found");
  await prisma.caseType.update({ where: { id }, data: { active: !existing!.active } });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "CASE_TYPE",
    entityId: id,
    detail: { active: !existing!.active },
  });
  revalidatePath("/settings/support/types");
  redirect("/settings/support/types?ok=type-updated");
}

export async function deleteCaseType(id: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.caseType.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/types?error=not-found");
  if (existing!.isSystem) redirect("/settings/support/types?error=system-type");
  await prisma.caseType.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await auditLog(user, { action: "DELETE", entityType: "CASE_TYPE", entityId: id });
  revalidatePath("/settings/support/types");
  redirect("/settings/support/types?ok=type-deleted");
}

// ============================================================
// Categories
// ============================================================

const categorySchema = z.object({
  name: z.string().min(1).max(120),
  nameTh: z.string().max(120).nullable(),
  parentId: z.string().uuid().nullable(),
  assignTeamId: z.string().uuid().nullable(),
  defaultPriority: z.enum(PRIORITIES).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

function readCategory(formData: FormData) {
  const dp = str(formData.get("defaultPriority"));
  return categorySchema.safeParse({
    name: str(formData.get("name")),
    nameTh: nullableStr(formData.get("nameTh")),
    parentId: nullableStr(formData.get("parentId")),
    assignTeamId: nullableStr(formData.get("assignTeamId")),
    defaultPriority: dp === "" ? null : dp,
    sortOrder: Number(str(formData.get("sortOrder")) || "0"),
    active: bool(formData.get("active")),
  });
}

/** Verify optional parent / team belong to the org. Returns false if invalid. */
async function validateCategoryRefs(
  organizationId: string,
  parentId: string | null,
  assignTeamId: string | null,
  selfId?: string
): Promise<boolean> {
  if (parentId) {
    if (parentId === selfId) return false;
    const parent = await prisma.caseCategory.findFirst({
      where: { id: parentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) return false;
  }
  if (assignTeamId) {
    const team = await prisma.supportTeam.findFirst({
      where: { id: assignTeamId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!team) return false;
  }
  return true;
}

export async function createCategory(formData: FormData) {
  const user = await requirePermission("support:settings");
  const parsed = readCategory(formData);
  if (!parsed.success) redirect("/settings/support/categories?error=invalid-input");
  const input = parsed.data;
  const ok = await validateCategoryRefs(user.organizationId, input.parentId, input.assignTeamId);
  if (!ok) redirect("/settings/support/categories?error=invalid-ref");

  const row = await prisma.caseCategory.create({
    data: { ...input, organizationId: user.organizationId },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "CASE_CATEGORY",
    entityId: row.id,
    detail: { name: input.name, parentId: input.parentId },
  });
  revalidatePath("/settings/support/categories");
  redirect("/settings/support/categories?ok=category-created");
}

export async function updateCategory(id: string, formData: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.caseCategory.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/categories?error=not-found");
  const parsed = readCategory(formData);
  if (!parsed.success) redirect(`/settings/support/categories/${id}/edit?error=invalid-input`);
  const input = parsed.data;
  const ok = await validateCategoryRefs(user.organizationId, input.parentId, input.assignTeamId, id);
  if (!ok) redirect(`/settings/support/categories/${id}/edit?error=invalid-ref`);

  await prisma.caseCategory.update({ where: { id }, data: { ...input } });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "CASE_CATEGORY",
    entityId: id,
    detail: { name: input.name },
  });
  revalidatePath("/settings/support/categories");
  redirect("/settings/support/categories?ok=category-updated");
}

export async function deleteCategory(id: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.caseCategory.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/categories?error=not-found");
  await prisma.caseCategory.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
  await auditLog(user, { action: "DELETE", entityType: "CASE_CATEGORY", entityId: id });
  revalidatePath("/settings/support/categories");
  redirect("/settings/support/categories?ok=category-deleted");
}

// ============================================================
// SLA policies (per priority)
// ============================================================

const slaSchema = z.object({
  priority: z.enum(PRIORITIES),
  firstResponseMins: z.number().int().min(1).max(1_000_000),
  resolutionMins: z.number().int().min(1).max(1_000_000),
  warnBeforeMins: z.number().int().min(0).max(1_000_000),
  pauseOnWaitingUser: z.boolean(),
  pauseOnWaitingVendor: z.boolean(),
  businessHoursOnly: z.boolean(),
  escalateToRoleKey: z.enum(ROLE_KEYS).nullable(),
});

export async function upsertSlaPolicy(formData: FormData) {
  const user = await requirePermission("support:settings");
  const role = str(formData.get("escalateToRoleKey"));
  const parsed = slaSchema.safeParse({
    priority: str(formData.get("priority")),
    firstResponseMins: Number(str(formData.get("firstResponseMins"))),
    resolutionMins: Number(str(formData.get("resolutionMins"))),
    warnBeforeMins: Number(str(formData.get("warnBeforeMins")) || "15"),
    pauseOnWaitingUser: bool(formData.get("pauseOnWaitingUser")),
    pauseOnWaitingVendor: bool(formData.get("pauseOnWaitingVendor")),
    businessHoursOnly: bool(formData.get("businessHoursOnly")),
    escalateToRoleKey: role === "" ? null : role,
  });
  if (!parsed.success) redirect("/settings/support/sla?error=invalid-input");
  const input = parsed.data;

  await prisma.slaPolicy.upsert({
    where: { organizationId_priority: { organizationId: user.organizationId, priority: input.priority } },
    update: {
      firstResponseMins: input.firstResponseMins,
      resolutionMins: input.resolutionMins,
      warnBeforeMins: input.warnBeforeMins,
      pauseOnWaitingUser: input.pauseOnWaitingUser,
      pauseOnWaitingVendor: input.pauseOnWaitingVendor,
      businessHoursOnly: input.businessHoursOnly,
      escalateToRoleKey: input.escalateToRoleKey,
    },
    create: { ...input, organizationId: user.organizationId },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SLA_POLICY",
    detail: { priority: input.priority },
  });
  revalidatePath("/settings/support/sla");
  redirect("/settings/support/sla?ok=sla-saved");
}

// ============================================================
// Business hours + holidays
// ============================================================

export async function saveBusinessHours(formData: FormData) {
  const user = await requirePermission("support:settings");
  const days: Array<[number, number] | null> = [];
  for (let d = 0; d < 7; d++) {
    if (!bool(formData.get(`day-${d}-enabled`))) {
      days.push(null);
      continue;
    }
    const start = toMinutes(str(formData.get(`day-${d}-start`)));
    const end = toMinutes(str(formData.get(`day-${d}-end`)));
    if (start === null || end === null || end <= start) {
      redirect("/settings/support/hours?error=invalid-hours");
    }
    days.push([start!, end!]);
  }
  const tz = Number(str(formData.get("timezoneOffsetMinutes")) || "420");
  if (!Number.isInteger(tz) || tz < -720 || tz > 840) {
    redirect("/settings/support/hours?error=invalid-tz");
  }

  const value: Prisma.InputJsonValue = { days, timezoneOffsetMinutes: tz };
  await prisma.systemSetting.upsert({
    where: {
      organizationId_key: { organizationId: user.organizationId, key: "support.businessHours" },
    },
    update: { value },
    create: { organizationId: user.organizationId, key: "support.businessHours", value },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_SETTINGS",
    detail: { key: "support.businessHours", timezoneOffsetMinutes: tz },
  });
  revalidatePath("/settings/support/hours");
  redirect("/settings/support/hours?ok=hours-saved");
}

const holidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().min(1).max(120),
});

export async function addHoliday(formData: FormData) {
  const user = await requirePermission("support:settings");
  const parsed = holidaySchema.safeParse({
    date: str(formData.get("date")),
    name: str(formData.get("name")),
  });
  if (!parsed.success) redirect("/settings/support/hours?error=invalid-holiday");
  const { date, name } = parsed.data;
  // Normalize to UTC midnight (@db.Date)
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dup = await prisma.holiday.findFirst({
    where: { organizationId: user.organizationId, date: day },
    select: { id: true },
  });
  if (dup) redirect("/settings/support/hours?error=holiday-exists");
  const row = await prisma.holiday.create({
    data: { organizationId: user.organizationId, date: day, name },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "HOLIDAY",
    entityId: row.id,
    detail: { date: day.toISOString().slice(0, 10), name },
  });
  revalidatePath("/settings/support/hours");
  redirect("/settings/support/hours?ok=holiday-added");
}

export async function deleteHoliday(id: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.holiday.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) redirect("/settings/support/hours?error=not-found");
  await prisma.holiday.delete({ where: { id } });
  await auditLog(user, { action: "DELETE", entityType: "HOLIDAY", entityId: id });
  revalidatePath("/settings/support/hours");
  redirect("/settings/support/hours?ok=holiday-deleted");
}

// ============================================================
// Teams + members
// ============================================================

const teamSchema = z.object({
  name: z.string().min(1).max(120),
  nameTh: z.string().max(120).nullable(),
  description: z.string().max(500).nullable(),
  active: z.boolean(),
});

export async function createTeam(formData: FormData) {
  const user = await requirePermission("support:settings");
  const parsed = teamSchema.safeParse({
    name: str(formData.get("name")),
    nameTh: nullableStr(formData.get("nameTh")),
    description: nullableStr(formData.get("description")),
    active: formData.has("active") ? bool(formData.get("active")) : true,
  });
  if (!parsed.success) redirect("/settings/support/teams?error=invalid-input");
  const row = await prisma.supportTeam.create({
    data: { ...parsed.data, organizationId: user.organizationId },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "SUPPORT_TEAM",
    entityId: row.id,
    detail: { name: parsed.data.name },
  });
  revalidatePath("/settings/support/teams");
  redirect("/settings/support/teams?ok=team-created");
}

export async function updateTeam(id: string, formData: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.supportTeam.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/teams?error=not-found");
  const parsed = teamSchema.safeParse({
    name: str(formData.get("name")),
    nameTh: nullableStr(formData.get("nameTh")),
    description: nullableStr(formData.get("description")),
    active: bool(formData.get("active")),
  });
  if (!parsed.success) redirect("/settings/support/teams?error=invalid-input");
  await prisma.supportTeam.update({ where: { id }, data: { ...parsed.data } });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_TEAM",
    entityId: id,
    detail: { name: parsed.data.name },
  });
  revalidatePath("/settings/support/teams");
  redirect("/settings/support/teams?ok=team-updated");
}

export async function deleteTeam(id: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const existing = await prisma.supportTeam.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) redirect("/settings/support/teams?error=not-found");
  await prisma.supportTeam.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
  await auditLog(user, { action: "DELETE", entityType: "SUPPORT_TEAM", entityId: id });
  revalidatePath("/settings/support/teams");
  redirect("/settings/support/teams?ok=team-deleted");
}

export async function addTeamMember(teamId: string, formData: FormData) {
  const user = await requirePermission("support:settings");
  const userId = str(formData.get("userId"));
  const team = await prisma.supportTeam.findFirst({
    where: { id: teamId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!team) redirect("/settings/support/teams?error=not-found");
  const member = await prisma.user.findFirst({
    where: { id: userId, organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) redirect("/settings/support/teams?error=invalid-user");
  await prisma.supportTeamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId },
    update: {},
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_TEAM",
    entityId: teamId,
    detail: { event: "MEMBER_ADDED", userId },
  });
  revalidatePath("/settings/support/teams");
  redirect("/settings/support/teams?ok=member-added");
}

export async function removeTeamMember(teamId: string, userId: string, _formData?: FormData) {
  const user = await requirePermission("support:settings");
  const team = await prisma.supportTeam.findFirst({
    where: { id: teamId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!team) redirect("/settings/support/teams?error=not-found");
  await prisma.supportTeamMember.deleteMany({ where: { teamId, userId } });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_TEAM",
    entityId: teamId,
    detail: { event: "MEMBER_REMOVED", userId },
  });
  revalidatePath("/settings/support/teams");
  redirect("/settings/support/teams?ok=member-removed");
}

// ============================================================
// Case-creation policy + notification events (stored settings)
// ============================================================

export async function saveCasePolicy(formData: FormData) {
  const user = await requirePermission("support:settings");
  const value: Prisma.InputJsonValue = {
    channels: {
      web: bool(formData.get("channel-web")),
      email: bool(formData.get("channel-email")),
      line: bool(formData.get("channel-line")),
      mobile: bool(formData.get("channel-mobile")),
      monitoring: bool(formData.get("channel-monitoring")),
    },
    allowOnBehalf: bool(formData.get("allowOnBehalf")),
    requiredFields: {
      subject: bool(formData.get("req-subject")),
      description: bool(formData.get("req-description")),
      category: bool(formData.get("req-category")),
      location: bool(formData.get("req-location")),
      asset: bool(formData.get("req-asset")),
      impact: bool(formData.get("req-impact")),
    },
    whoCanCreate: formData.getAll("whoCanCreate").map(String),
  };
  await prisma.systemSetting.upsert({
    where: {
      organizationId_key: { organizationId: user.organizationId, key: "support.casePolicy" },
    },
    update: { value },
    create: { organizationId: user.organizationId, key: "support.casePolicy", value },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_SETTINGS",
    detail: { key: "support.casePolicy" },
  });
  revalidatePath("/settings/support/creation");
  redirect("/settings/support/creation?ok=policy-saved");
}

const NOTIFY_EVENTS = [
  "case_created",
  "assigned",
  "status_change",
  "sla_warning",
  "sla_breach",
  "resolved",
  "closed",
  "reopened",
] as const;
const NOTIFY_CHANNELS = ["in_app", "email", "line"] as const;

export async function saveNotificationPolicy(formData: FormData) {
  const user = await requirePermission("support:settings");
  const events: Record<string, Record<string, boolean>> = {};
  for (const ev of NOTIFY_EVENTS) {
    const channels: Record<string, boolean> = {};
    for (const ch of NOTIFY_CHANNELS) {
      channels[ch] = bool(formData.get(`${ev}-${ch}`));
    }
    events[ev] = channels;
  }
  const value = events as Prisma.InputJsonValue;
  await prisma.systemSetting.upsert({
    where: {
      organizationId_key: { organizationId: user.organizationId, key: "support.notifications" },
    },
    update: { value },
    create: { organizationId: user.organizationId, key: "support.notifications", value },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUPPORT_SETTINGS",
    detail: { key: "support.notifications" },
  });
  revalidatePath("/settings/support/notifications");
  redirect("/settings/support/notifications?ok=notifications-saved");
}
