/**
 * Centralized reporting/aggregation service — the single source of truth for
 * every IT-asset dashboard, on-screen report and export. Previously these
 * aggregates were re-implemented inline in the export route and in each
 * dashboard (3× duplication), which risked inconsistent numbers. Everything
 * here reads live data from Prisma, scoped by organization and soft-delete;
 * nothing is mocked or hard-coded.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, BorrowRequestStatus, PurchaseStatus } from "@prisma/client";
import { currentBookValue, daysUntil } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Filters shared by the executive dashboard and the Asset report
// ---------------------------------------------------------------------------
export interface AssetFilters {
  departmentId?: string;
  locationId?: string;
  categoryId?: string;
  status?: string;
  condition?: string;
}

export function assetWhere(orgId: string, f: AssetFilters = {}): Prisma.AssetWhereInput {
  return {
    organizationId: orgId,
    deletedAt: null,
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.status ? { status: f.status as Prisma.EnumAssetStatusFilter["equals"] } : {}),
    ...(f.condition ? { condition: f.condition as Prisma.EnumAssetConditionFilter["equals"] } : {}),
  };
}

export interface NamedCount { id: string | null; name: string; value: number }

// ---------------------------------------------------------------------------
// Asset summary — status/category/department/location/condition + costs
// ---------------------------------------------------------------------------
export async function getAssetSummary(orgId: string, f: AssetFilters = {}) {
  const where = assetWhere(orgId, f);
  const [byStatus, byCategory, byDepartment, byLocation, byCondition, valueRows] = await Promise.all([
    prisma.asset.groupBy({ by: ["status"], where, _count: true }),
    prisma.asset.groupBy({ by: ["categoryId"], where, _count: true }),
    prisma.asset.groupBy({ by: ["departmentId"], where, _count: true }),
    prisma.asset.groupBy({ by: ["locationId"], where, _count: true }),
    prisma.asset.groupBy({ by: ["condition"], where, _count: true }),
    prisma.asset.findMany({ where, select: { purchasePrice: true, currentValue: true, purchaseDate: true, depreciationMonths: true } }),
  ]);

  const status: Record<string, number> = {};
  let total = 0;
  for (const r of byStatus) { status[r.status] = r._count; total += r._count; }

  const condition: Record<string, number> = {};
  for (const r of byCondition) condition[r.condition] = r._count;

  // Resolve human names for the grouped foreign keys.
  const [cats, depts, locs] = await Promise.all([
    prisma.assetCategory.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c.name]));
  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const named = (
    rows: { _count: number }[],
    key: string,
    map: Map<string, string>,
    noneLabel: string
  ): NamedCount[] =>
    rows
      .map((r) => {
        const id = (r as Record<string, unknown>)[key] as string | null;
        return { id, name: id ? map.get(id) ?? "—" : noneLabel, value: r._count };
      })
      .sort((a, b) => b.value - a.value);

  const totalPurchaseCost = valueRows.reduce((s, a) => s + (a.purchasePrice ? Number(a.purchasePrice) : 0), 0);
  const currentValue = valueRows.reduce((s, a) => s + currentBookValue(a), 0);

  return {
    total,
    status,
    condition,
    byCategory: named(byCategory, "categoryId", catMap, "ไม่ระบุ / Uncategorized"),
    byDepartment: named(byDepartment, "departmentId", deptMap, "ไม่ระบุ / No dept"),
    byLocation: named(byLocation, "locationId", locMap, "ไม่ระบุ / No location"),
    totalPurchaseCost,
    currentValue,
    // Convenience KPI shortcuts
    inUse: (status.IN_USE ?? 0) + (status.ASSIGNED ?? 0),
    available: status.AVAILABLE ?? 0,
    assigned: status.ASSIGNED ?? 0,
    inRepair: status.IN_REPAIR ?? 0,
    lost: (status.LOST ?? 0) + (status.STOLEN ?? 0),
    retired: (status.RETIRED ?? 0) + (status.DISPOSED ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Department overview (per-dept utilization)
// ---------------------------------------------------------------------------
export async function getDepartmentOverview(orgId: string) {
  const rows = await prisma.asset.groupBy({
    by: ["departmentId", "status"],
    where: { organizationId: orgId, deletedAt: null },
    _count: true,
  });
  const depts = await prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true } });
  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const agg = new Map<string, { id: string | null; name: string; total: number; inUse: number; available: number; assigned: number; repair: number; lost: number }>();
  for (const r of rows) {
    const id = r.departmentId;
    const key = id ?? "__none__";
    const cur = agg.get(key) ?? { id, name: id ? deptMap.get(id) ?? "—" : "ไม่ระบุ / No dept", total: 0, inUse: 0, available: 0, assigned: 0, repair: 0, lost: 0 };
    cur.total += r._count;
    if (r.status === "IN_USE") cur.inUse += r._count;
    if (r.status === "AVAILABLE") cur.available += r._count;
    if (r.status === "ASSIGNED") cur.assigned += r._count;
    if (r.status === "IN_REPAIR") cur.repair += r._count;
    if (r.status === "LOST" || r.status === "STOLEN") cur.lost += r._count;
    agg.set(key, cur);
  }
  return [...agg.values()]
    .map((d) => ({ ...d, utilization: d.total > 0 ? Math.round(((d.inUse + d.assigned) / d.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Warranty buckets (Expired / ≤30 / 31–90 / >90)
// ---------------------------------------------------------------------------
export async function getWarranty(orgId: string) {
  const rows = await prisma.asset.findMany({
    where: { organizationId: orgId, deletedAt: null, warrantyEnd: { not: null }, status: { notIn: ["DISPOSED", "RETIRED"] } },
    select: {
      id: true, assetTag: true, name: true, warrantyStart: true, warrantyEnd: true,
      department: { select: { name: true } }, vendor: { select: { name: true } },
    },
  });
  let expired = 0, within30 = 0, within90 = 0, beyond90 = 0;
  const enriched = rows.map((a) => {
    const daysLeft = daysUntil(a.warrantyEnd) ?? 0;
    if (daysLeft < 0) expired++;
    else if (daysLeft <= 30) within30++;
    else if (daysLeft <= 90) within90++;
    else beyond90++;
    return {
      id: a.id, assetTag: a.assetTag, name: a.name,
      department: a.department?.name ?? "-", vendor: a.vendor?.name ?? "-",
      warrantyStart: a.warrantyStart, warrantyEnd: a.warrantyEnd, daysLeft,
    };
  });
  enriched.sort((a, b) => a.daysLeft - b.daysLeft);
  return {
    counts: { expired, within30, within90, beyond90, total: rows.length },
    // actionable list: expired or expiring within 90 days, soonest first
    actionable: enriched.filter((a) => a.daysLeft <= 90),
    all: enriched,
  };
}

// ---------------------------------------------------------------------------
// Borrowing (utilization + overdue + requests merged)
// ---------------------------------------------------------------------------
const BORROW_ACTIVE: BorrowRequestStatus[] = ["ISSUED", "PARTIALLY_RETURNED"];
const BORROW_PENDING: BorrowRequestStatus[] = ["PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT"];

export async function getBorrowing(orgId: string) {
  const now = new Date();
  const [active, returned, pending, totalRequests, overdueRows] = await Promise.all([
    prisma.borrowRequest.count({ where: { organizationId: orgId, status: { in: BORROW_ACTIVE } } }),
    prisma.borrowRequest.count({ where: { organizationId: orgId, status: { in: ["RETURNED", "CLOSED"] } } }),
    prisma.borrowRequest.count({ where: { organizationId: orgId, status: { in: BORROW_PENDING } } }),
    prisma.borrowRequest.count({ where: { organizationId: orgId } }),
    prisma.borrowRequest.findMany({
      where: { organizationId: orgId, status: { in: BORROW_ACTIVE }, dueDate: { lt: now } },
      select: {
        id: true, refNo: true, requesterName: true, departmentId: true, borrowDate: true, dueDate: true, status: true,
        department: { select: { name: true } },
        items: { where: { status: "ISSUED" }, select: { asset: { select: { assetTag: true, name: true } } } },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const overdue = overdueRows.map((r) => ({
    id: r.id, refNo: r.refNo,
    borrower: r.requesterName ?? "-",
    department: r.department?.name ?? "-",
    borrowDate: r.borrowDate, dueDate: r.dueDate,
    daysOverdue: r.dueDate ? Math.max(0, Math.floor((now.getTime() - r.dueDate.getTime()) / 86_400_000)) : 0,
    assets: r.items.map((i) => i.asset?.assetTag).filter(Boolean).join(", "),
    status: r.status,
  })).sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { active, returned, pending, totalRequests, overdue, overdueCount: overdue.length };
}

// ---------------------------------------------------------------------------
// Software licenses (utilization)
// ---------------------------------------------------------------------------
export async function getLicenses(orgId: string) {
  const rows = await prisma.license.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true, softwareName: true, licenseType: true, totalSeats: true, cost: true, renewalCost: true,
      expiresAt: true, vendor: { select: { name: true } },
      _count: { select: { assignments: { where: { revokedAt: null } } } },
    },
  });
  let assigned = 0, totalSeats = 0, expired = 0;
  const enriched = rows.map((l) => {
    const used = l._count.assignments;
    assigned += used;
    totalSeats += l.totalSeats;
    const daysLeft = daysUntil(l.expiresAt);
    if (daysLeft != null && daysLeft < 0) expired++;
    const utilization = l.totalSeats > 0 ? Math.round((used / l.totalSeats) * 100) : 0;
    let flag: "OK" | "UNDERUTILIZED" | "FULL" | "EXPIRED" = "OK";
    if (daysLeft != null && daysLeft < 0) flag = "EXPIRED";
    else if (utilization >= 100) flag = "FULL";
    else if (utilization < 50) flag = "UNDERUTILIZED";
    return {
      id: l.id, softwareName: l.softwareName, licenseType: l.licenseType ?? "-",
      vendor: l.vendor?.name ?? "-", used, totalSeats: l.totalSeats, available: Math.max(0, l.totalSeats - used),
      utilization, cost: l.cost ? Number(l.cost) : 0, renewalCost: l.renewalCost ? Number(l.renewalCost) : 0,
      expiresAt: l.expiresAt, daysLeft, flag,
    };
  });
  enriched.sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
  return {
    totalLicenses: rows.length,
    totalSeats, assigned, available: Math.max(0, totalSeats - assigned), expired,
    utilization: totalSeats > 0 ? Math.round((assigned / totalSeats) * 100) : 0,
    rows: enriched,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions (renewal tracking)
// ---------------------------------------------------------------------------
function annualize(cost: number, cycle: string | null): number {
  const c = (cycle ?? "").toUpperCase();
  if (c.startsWith("MONTH")) return cost * 12;
  if (c.startsWith("QUART")) return cost * 4;
  if (c.startsWith("WEEK")) return cost * 52;
  return cost; // YEARLY / unknown → treat as annual
}

export async function getSubscriptions(orgId: string) {
  const rows = await prisma.subscription.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true, serviceName: true, plan: true, quantity: true, cost: true, billingCycle: true,
      startDate: true, renewalDate: true, status: true, vendor: { select: { name: true } },
    },
  });
  let annualCost = 0, active = 0, expiringSoon = 0;
  const enriched = rows.map((s) => {
    const cost = s.cost ? Number(s.cost) : 0;
    const annual = annualize(cost, s.billingCycle);
    if (s.status === "ACTIVE") annualCost += annual;
    if (s.status === "ACTIVE") active++;
    const daysLeft = daysUntil(s.renewalDate);
    if (daysLeft != null && daysLeft >= 0 && daysLeft <= 30 && s.status === "ACTIVE") expiringSoon++;
    return {
      id: s.id, serviceName: s.serviceName, plan: s.plan ?? "-", vendor: s.vendor?.name ?? "-",
      quantity: s.quantity, cost, billingCycle: s.billingCycle ?? "-", startDate: s.startDate,
      renewalDate: s.renewalDate, daysLeft, status: s.status,
    };
  });
  enriched.sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
  return {
    total: rows.length, active, expiringSoon,
    annualCost, monthlyEquivalent: Math.round((annualCost / 12) * 100) / 100,
    rows: enriched,
  };
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
export async function getMaintenance(orgId: string) {
  const rows = await prisma.maintenanceTicket.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true, ticketNumber: true, problem: true, priority: true, status: true, repairCost: true,
      createdAt: true, startedAt: true, completedAt: true,
      asset: { select: { assetTag: true, name: true, departmentId: true } },
      vendor: { select: { name: true } },
    },
  });
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let totalCost = 0, resolvedCount = 0, resolutionMsSum = 0;
  const monthCost = new Map<string, number>();
  const perAsset = new Map<string, { label: string; value: number }>();
  for (const t of rows) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    const cost = t.repairCost ? Number(t.repairCost) : 0;
    totalCost += cost;
    if (t.completedAt) {
      resolvedCount++;
      resolutionMsSum += t.completedAt.getTime() - t.createdAt.getTime();
      const mk = `${t.completedAt.getFullYear()}-${String(t.completedAt.getMonth() + 1).padStart(2, "0")}`;
      monthCost.set(mk, (monthCost.get(mk) ?? 0) + cost);
    }
    if (t.asset && cost > 0) {
      const key = t.asset.assetTag;
      const cur = perAsset.get(key) ?? { label: `${t.asset.assetTag} · ${t.asset.name}`, value: 0 };
      cur.value += cost;
      perAsset.set(key, cur);
    }
  }
  const open = (byStatus.OPEN ?? 0);
  const inProgress = (byStatus.IN_PROGRESS ?? 0) + (byStatus.WAITING_PART ?? 0) + (byStatus.WAITING_VENDOR ?? 0);
  const completed = (byStatus.COMPLETED ?? 0);
  const highPriority = (byPriority.HIGH ?? 0) + (byPriority.URGENT ?? 0);
  const avgResolutionHours = resolvedCount > 0 ? Math.round((resolutionMsSum / resolvedCount / 3_600_000) * 10) / 10 : 0;
  const costByMonth = [...monthCost.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, value]) => ({ month, value }));
  const topAssets = [...perAsset.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  return {
    total: rows.length, open, inProgress, completed, highPriority, totalCost, avgResolutionHours,
    byStatus, byPriority, costByMonth, topAssets,
  };
}

// ---------------------------------------------------------------------------
// Procurement
// ---------------------------------------------------------------------------
const PROC_APPROVED: PurchaseStatus[] = ["APPROVED", "ORDERED", "RECEIVED", "REGISTERED"];
const PROC_PENDING: PurchaseStatus[] = ["PENDING_MANAGER", "PENDING_IT", "PENDING_FINANCE"];

export async function getProcurement(orgId: string) {
  const rows = await prisma.purchaseRequest.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true, requestNumber: true, status: true, totalEstimated: true, createdAt: true,
      department: { select: { name: true } }, vendor: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  let estimatedBudget = 0, approvedBudget = 0, pending = 0, approved = 0, rejected = 0;
  for (const r of rows) {
    const est = r.totalEstimated ? Number(r.totalEstimated) : 0;
    estimatedBudget += est;
    if (PROC_APPROVED.includes(r.status)) { approvedBudget += est; approved++; }
    if (PROC_PENDING.includes(r.status)) pending++;
    if (r.status === "REJECTED") rejected++;
  }
  const pendingList = rows
    .filter((r) => PROC_PENDING.includes(r.status))
    .map((r) => ({
      id: r.id, requestNumber: r.requestNumber, status: r.status,
      department: r.department?.name ?? "-", vendor: r.vendor?.name ?? "-",
      items: r._count.items, estimated: r.totalEstimated ? Number(r.totalEstimated) : 0, createdAt: r.createdAt,
    }));
  return { total: rows.length, pending, approved, rejected, estimatedBudget, approvedBudget, pendingList };
}

// ---------------------------------------------------------------------------
// Vault access audit (metadata only — never secret values)
// ---------------------------------------------------------------------------
export async function getVaultAudit(orgId: string, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await prisma.vaultAccessLog.findMany({
    where: { organizationId: orgId, createdAt: { gte: since } },
    select: { id: true, action: true, result: true, ip: true, userId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const byAction: Record<string, number> = {};
  let success = 0, failed = 0;
  const byIp = new Map<string, number>();
  const offHours: typeof rows = [];
  for (const r of rows) {
    byAction[r.action] = (byAction[r.action] ?? 0) + 1;
    if (r.result === "SUCCESS") success++; else failed++;
    if (r.ip) byIp.set(r.ip, (byIp.get(r.ip) ?? 0) + 1);
    const h = r.createdAt.getHours();
    if (h < 7 || h >= 20) offHours.push(r);
  }
  const topIps = [...byIp.entries()].map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  return {
    total: rows.length, success, failed, byAction,
    createSecret: (byAction.CREATE_SECRET ?? 0) + (byAction.CREATE ?? 0),
    readSecret: (byAction.REVEAL_SECRET ?? 0) + (byAction.VIEW_SECRET ?? 0) + (byAction.COPY_SECRET ?? 0),
    updateSecret: (byAction.UPDATE_SECRET ?? 0) + (byAction.ROTATE_SECRET ?? 0) + (byAction.UPDATE ?? 0),
    deleteSecret: (byAction.DELETE_SECRET ?? 0) + (byAction.DELETE ?? 0),
    topIps, offHoursCount: offHours.length,
  };
}

// ---------------------------------------------------------------------------
// Duplicate assets (same serial number, count > 1)
// ---------------------------------------------------------------------------
export async function getDuplicateAssets(orgId: string) {
  const groups = await prisma.asset.groupBy({
    by: ["serialNumber"],
    where: { organizationId: orgId, deletedAt: null, serialNumber: { not: null } },
    _count: true,
    having: { serialNumber: { _count: { gt: 1 } } },
  });
  const serials = groups.map((g) => g.serialNumber).filter((s): s is string => !!s);
  if (serials.length === 0) return { groups: [], count: 0 };
  const assets = await prisma.asset.findMany({
    where: { organizationId: orgId, deletedAt: null, serialNumber: { in: serials } },
    select: { id: true, assetTag: true, name: true, serialNumber: true, status: true, department: { select: { name: true } } },
    orderBy: [{ serialNumber: "asc" }, { assetTag: "asc" }],
  });
  const bySerial = new Map<string, typeof assets>();
  for (const a of assets) {
    const k = a.serialNumber!;
    (bySerial.get(k) ?? bySerial.set(k, []).get(k)!).push(a);
  }
  const grouped = [...bySerial.entries()].map(([serialNumber, items]) => ({ serialNumber, items }));
  return { groups: grouped, count: grouped.length };
}

// ---------------------------------------------------------------------------
// Access Review — periodic certification of access-request DOCUMENTS.
//
// This is a document-only feature: it reviews the access-request paperwork
// (form 4.A) that has been recorded, it does NOT read or change any real
// system permission. Policy: an access-request document is valid for up to
// 1 year (per the form footer), so it is "due for review" one year after its
// effective date (or, if set, on its stated expiry date). This lets a manager
// certify / re-submit the paperwork on schedule instead of any auto-revoke.
// ---------------------------------------------------------------------------
export type ReviewBucket = "overdue" | "dueSoon" | "ok" | "draft" | "closed";

export interface AccessReviewRow {
  id: string;
  refNo: string | null;
  employeeId: string | null;
  employeeCode: string;
  name: string;
  department: string;
  position: string;
  status: string;
  itemCount: number;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  reviewDue: Date | null;
  daysToReview: number | null;
  bucket: ReviewBucket;
}

const YEAR_MS = 365 * 86_400_000;

export async function getAccessReview(orgId: string) {
  const [requests, activeEmployees] = await Promise.all([
    prisma.accessRequest.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true, refNo: true, employeeId: true, employeeCode: true, nameTh: true, nameEn: true,
        department: true, position: true, status: true, effectiveDate: true, expiryDate: true,
        createdAt: true,
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } }, position: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: { organizationId: orgId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, position: true, department: { select: { name: true } } },
      orderBy: [{ employeeCode: "asc" }],
    }),
  ]);

  const rows: AccessReviewRow[] = requests.map((r) => {
    const name = r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : (r.nameTh || r.nameEn || "—");
    const base = r.effectiveDate ?? r.createdAt;
    // Review-due = stated expiry, else 1 year after the effective/created date.
    const reviewDue = r.expiryDate ?? (base ? new Date(base.getTime() + YEAR_MS) : null);
    const daysToReview = daysUntil(reviewDue);
    let bucket: ReviewBucket;
    if (r.status === "DRAFT") bucket = "draft";
    else if (r.status === "REJECTED" || r.status === "REVOKED") bucket = "closed";
    else if (daysToReview !== null && daysToReview < 0) bucket = "overdue";
    else if (daysToReview !== null && daysToReview <= 30) bucket = "dueSoon";
    else bucket = "ok";
    return {
      id: r.id, refNo: r.refNo, employeeId: r.employeeId,
      employeeCode: r.employee?.employeeCode ?? r.employeeCode ?? "—",
      name,
      department: r.employee?.department?.name ?? r.department ?? "—",
      position: r.employee?.position ?? r.position ?? "—",
      status: r.status, itemCount: r._count.items,
      effectiveDate: r.effectiveDate, expiryDate: r.expiryDate,
      reviewDue, daysToReview, bucket,
    };
  });

  // Sort: overdue first (most overdue first), then due-soon, then the rest.
  const order: Record<ReviewBucket, number> = { overdue: 0, dueSoon: 1, ok: 2, draft: 3, closed: 4 };
  rows.sort((a, b) =>
    order[a.bucket] - order[b.bucket] ||
    ((a.daysToReview ?? Infinity) - (b.daysToReview ?? Infinity)));

  // Active employees that have NO access-request document at all → nothing to
  // review yet, but flagged so a document can be created for them.
  const withDoc = new Set(requests.map((r) => r.employeeId).filter((v): v is string => !!v));
  const noDoc = activeEmployees
    .filter((e) => !withDoc.has(e.id))
    .map((e) => ({
      id: e.id, employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}`,
      department: e.department?.name ?? "—", position: e.position ?? "—",
    }));

  const counts = {
    totalDocs: rows.length,
    overdue: rows.filter((r) => r.bucket === "overdue").length,
    dueSoon: rows.filter((r) => r.bucket === "dueSoon").length,
    ok: rows.filter((r) => r.bucket === "ok").length,
    draft: rows.filter((r) => r.bucket === "draft").length,
    closed: rows.filter((r) => r.bucket === "closed").length,
    activeEmployees: activeEmployees.length,
    employeesWithDoc: withDoc.size,
    employeesNoDoc: noDoc.length,
  };

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  return { rows, noDoc, counts, byStatus };
}
