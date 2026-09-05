import { prisma } from "@/lib/prisma";
import type { JobLevel, PermissionDefaultStatus } from "@prisma/client";
import { getForm } from "@/lib/documents/forms";

/**
 * The systems an admin can configure in a profile — derived from the
 * access-request form definition so the matrix always matches the form.
 * Each system carries its permission levels and optional sub-resources.
 */
export interface AccessSystem { key: string; label: string; section: string; levels: string[]; resources: string[] }

export function accessSystems(): AccessSystem[] {
  const form = getForm("access-request");
  if (!form) return [];
  const out: AccessSystem[] = [];
  for (const section of form.sections) {
    for (const g of section.groups ?? []) {
      const levels = (g.levels ?? []).map((l) => l.th);
      const fallback = levels.length ? levels : ["Admin Permission", "Editor Permission", "Viewer Permission"];
      out.push({ key: g.name, label: g.th || g.name, section: section.title ?? "Permissions", levels: fallback, resources: g.options.map((o) => o.th) });
    }
  }
  return out;
}

// Job levels (label per the spec). Order matters for the dropdown.
export const JOB_LEVELS: { value: JobLevel; th: string; en: string }[] = [
  { value: "L0", th: "L0 · เอาต์ซอร์ส/ชั่วคราว", en: "L0 · Outsource / Temporary" },
  { value: "L1", th: "L1 · พนักงาน/เจ้าหน้าที่", en: "L1 · Staff / Officer" },
  { value: "L2", th: "L2 · อาวุโส/ผู้บริหารระดับต้น", en: "L2 · Senior / Executive" },
  { value: "L3", th: "L3 · หัวหน้างาน", en: "L3 · Supervisor" },
  { value: "L4", th: "L4 · ผู้ช่วยผู้จัดการ", en: "L4 · Assistant Manager" },
  { value: "L5", th: "L5 · ผู้จัดการ/หัวหน้าแผนก", en: "L5 · Manager / Dept Head" },
  { value: "L6", th: "L6 · ผู้อำนวยการ/ผู้บริหารสูงสุด", en: "L6 · Director / C-Level" },
  { value: "IT_ADMIN", th: "IT-ADMIN · ผู้ดูแลระบบ", en: "IT-ADMIN · System Administrator" },
];

export interface ResolvedItem {
  system: string;
  resource: string | null;
  permissionLevel: string;
  defaultStatus: PermissionDefaultStatus;
  requiresApproval: boolean;
}

export interface ResolvedProfile {
  matched: boolean;
  matchLevel: string; // which fallback tier matched
  profileId: string | null;
  profileName: string | null;
  items: ResolvedItem[];
  approval: {
    manager: boolean;
    systemOwner: boolean;
    itManager: boolean;
    management: boolean;
  };
}

interface Criteria {
  company?: string | null;
  department?: string | null;
  position?: string | null;
  jobLevel?: JobLevel | null;
}

const ci = (v?: string | null) => (v && v.trim() ? { equals: v.trim(), mode: "insensitive" as const } : undefined);

/**
 * Resolve the best-matching active permission profile using the fallback
 * priority: (1) company+dept+position+level, (2) company+dept+position,
 * (3) dept+level, (4) dept default. Returns matched:false when none exists.
 */
export async function resolveAccessProfile(orgId: string, c: Criteria): Promise<ResolvedProfile> {
  const base = { organizationId: orgId, deletedAt: null, isActive: true };
  const tiers: { label: string; where: Record<string, unknown> }[] = [
    { label: "company+department+position+level", where: { company: ci(c.company), department: ci(c.department), position: ci(c.position), jobLevel: c.jobLevel ?? undefined } },
    { label: "company+department+position", where: { company: ci(c.company), department: ci(c.department), position: ci(c.position) } },
    { label: "department+level", where: { department: ci(c.department), jobLevel: c.jobLevel ?? undefined } },
    { label: "department default", where: { department: ci(c.department) } },
  ];

  for (const tier of tiers) {
    // Only try a tier when its distinguishing fields are actually provided.
    if (tier.label.includes("position") && !c.position) continue;
    if (tier.label.includes("level") && !c.jobLevel) continue;
    if (tier.label.includes("company") && !c.company) continue;
    if (!c.department) continue;

    const profile = await prisma.permissionProfile.findFirst({
      where: { ...base, ...cleanWhere(tier.where) },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    });
    if (profile) {
      return {
        matched: true,
        matchLevel: tier.label,
        profileId: profile.id,
        profileName: profile.name,
        items: profile.items.map((i) => ({ system: i.system, resource: i.resource, permissionLevel: i.permissionLevel, defaultStatus: i.defaultStatus, requiresApproval: i.requiresApproval })),
        approval: {
          manager: profile.requiresManagerApproval,
          systemOwner: profile.requiresSystemOwnerApproval,
          itManager: profile.requiresItManagerApproval,
          management: profile.requiresManagementApproval,
        },
      };
    }
  }

  return { matched: false, matchLevel: "none", profileId: null, profileName: null, items: [], approval: { manager: true, systemOwner: false, itManager: false, management: false } };
}

// Drop undefined criteria so an unset tier field is not matched as NULL.
function cleanWhere(w: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Compute the approval chain from profile flags plus whether the request
 * carries additional/restricted access.
 */
export function approvalChain(
  approval: ResolvedProfile["approval"],
  opts: { hasAdditional?: boolean; hasRestricted?: boolean } = {}
): string[] {
  const chain = ["ผู้ขอ / Requester"];
  if (approval.manager) chain.push("ผู้จัดการแผนก / Department Manager");
  if (approval.systemOwner || opts.hasRestricted) chain.push("เจ้าของระบบ / System Owner");
  chain.push("IT Support");
  if (approval.itManager || opts.hasRestricted || opts.hasAdditional) chain.push("IT Manager");
  if (approval.management) chain.push("ฝ่ายบริหาร / Management");
  return chain;
}
