"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

async function getOffboardingOrThrow(user: CurrentUser, formData: FormData) {
  const id = z.uuid().parse(formData.get("offboardingId"));
  const offboarding = await prisma.offboarding.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      employee: {
        select: { id: true, userId: true, employeeCode: true, firstName: true, lastName: true },
      },
    },
  });
  if (!offboarding) throw new Error("Offboarding not found");
  if (offboarding.status === "COMPLETED" || offboarding.status === "CANCELLED") {
    throw new Error("Offboarding is already closed");
  }
  return offboarding;
}

/** Move OPEN → IN_PROGRESS once work starts. */
async function markInProgress(offboardingId: string, status: string) {
  if (status === "OPEN") {
    await prisma.offboarding.update({
      where: { id: offboardingId },
      data: { status: "IN_PROGRESS" },
    });
  }
}

/** a. คืนทรัพย์สินทั้งหมด / Return all outstanding assets. */
export async function returnAllAssets(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);
  const now = new Date();

  const open = await prisma.assetAssignment.findMany({
    where: {
      organizationId: user.organizationId,
      employeeId: offboarding.employeeId,
      status: "CHECKED_OUT",
    },
    select: { id: true, assetId: true },
  });

  for (const a of open) {
    await prisma.$transaction([
      prisma.assetAssignment.update({
        where: { id: a.id },
        data: { status: "RETURNED", returnedAt: now, returnedById: user.id, remark: "Offboarding" },
      }),
      prisma.asset.update({
        where: { id: a.assetId },
        data: { status: "AVAILABLE", assignedToId: null },
      }),
      prisma.assetHistory.create({
        data: {
          organizationId: user.organizationId,
          assetId: a.assetId,
          action: "RETURN",
          detail: `Returned during offboarding of ${offboarding.employee.employeeCode}`,
          actorId: user.id,
        },
      }),
    ]);
  }

  const remaining = await prisma.assetAssignment.count({
    where: {
      organizationId: user.organizationId,
      employeeId: offboarding.employeeId,
      status: "CHECKED_OUT",
    },
  });
  if (remaining === 0) {
    await prisma.offboarding.update({
      where: { id: offboarding.id },
      data: { assetsReturned: true },
    });
  }
  await markInProgress(offboarding.id, offboarding.status);

  await auditLog(user, {
    action: "RETURN",
    entityType: "OFFBOARDING",
    entityId: offboarding.id,
    detail: { employeeId: offboarding.employeeId, assetsReturnedCount: open.length },
  });
  revalidatePath(`/offboarding/${offboarding.id}`);
}

/** b. เพิกถอนไลเซนส์ทั้งหมด / Revoke all active license assignments. */
export async function revokeAllLicenses(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);
  const now = new Date();

  const result = await prisma.licenseAssignment.updateMany({
    where: {
      employeeId: offboarding.employeeId,
      revokedAt: null,
      license: { organizationId: user.organizationId },
    },
    data: { revokedAt: now },
  });

  await prisma.offboarding.update({
    where: { id: offboarding.id },
    data: { licensesRevoked: true },
  });
  await markInProgress(offboarding.id, offboarding.status);

  await auditLog(user, {
    action: "REVOKE",
    entityType: "LICENSE_ASSIGNMENT",
    entityId: offboarding.employeeId,
    detail: { offboardingId: offboarding.id, revokedCount: result.count },
  });
  revalidatePath(`/offboarding/${offboarding.id}`);
}

/** c. เพิกถอนสิทธิ์ Vault / Revoke all active vault shares of the employee's user. */
export async function revokeVaultAccess(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);
  const now = new Date();
  let revokedCount = 0;

  if (offboarding.employee.userId) {
    const result = await prisma.vaultShare.updateMany({
      where: {
        userId: offboarding.employee.userId,
        revokedAt: null,
        vaultItem: { organizationId: user.organizationId },
      },
      data: { revokedAt: now },
    });
    revokedCount = result.count;
  }

  await prisma.offboarding.update({
    where: { id: offboarding.id },
    data: { vaultRevoked: true },
  });
  await markInProgress(offboarding.id, offboarding.status);

  await auditLog(user, {
    action: "REVOKE_SECRET",
    entityType: "VAULT_SHARE",
    entityId: offboarding.employee.userId ?? offboarding.employeeId,
    detail: { offboardingId: offboarding.id, revokedCount },
  });
  revalidatePath(`/offboarding/${offboarding.id}`);
}

/** d. ปิดบัญชีผู้ใช้ / Disable the employee's user account and revoke sessions. */
export async function disableAccount(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);
  const now = new Date();

  if (offboarding.employee.userId) {
    const target = await prisma.user.findFirst({
      where: { id: offboarding.employee.userId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!target) throw new Error("User account not found");
    await prisma.$transaction([
      prisma.user.update({ where: { id: target.id }, data: { status: "DISABLED" } }),
      prisma.userSession.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  await prisma.offboarding.update({
    where: { id: offboarding.id },
    data: { accountDisabled: true },
  });
  await markInProgress(offboarding.id, offboarding.status);

  await auditLog(user, {
    action: "DISABLE_ACCOUNT",
    entityType: "USER",
    entityId: offboarding.employee.userId ?? offboarding.employeeId,
    detail: { offboardingId: offboarding.id, employeeId: offboarding.employeeId },
  });
  revalidatePath(`/offboarding/${offboarding.id}`);
}

/** เสร็จสิ้น / Complete the offboarding: employee becomes RESIGNED. */
export async function completeOffboarding(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);
  const now = new Date();

  // Verify all four checklist sections are done or have nothing outstanding.
  const [openAssets, activeLicenses, activeShares, activeUser] = await Promise.all([
    prisma.assetAssignment.count({
      where: {
        organizationId: user.organizationId,
        employeeId: offboarding.employeeId,
        status: "CHECKED_OUT",
      },
    }),
    prisma.licenseAssignment.count({
      where: {
        employeeId: offboarding.employeeId,
        revokedAt: null,
        license: { organizationId: user.organizationId },
      },
    }),
    offboarding.employee.userId
      ? prisma.vaultShare.count({
          where: {
            userId: offboarding.employee.userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            vaultItem: { organizationId: user.organizationId },
          },
        })
      : Promise.resolve(0),
    offboarding.employee.userId
      ? prisma.user.count({
          where: {
            id: offboarding.employee.userId,
            organizationId: user.organizationId,
            status: "ACTIVE",
          },
        })
      : Promise.resolve(0),
  ]);

  const ready =
    (offboarding.assetsReturned || openAssets === 0) &&
    (offboarding.licensesRevoked || activeLicenses === 0) &&
    (offboarding.vaultRevoked || activeShares === 0) &&
    (offboarding.accountDisabled || activeUser === 0);
  if (!ready) throw new Error("Checklist is not complete");

  await prisma.$transaction([
    prisma.offboarding.update({
      where: { id: offboarding.id },
      data: { status: "COMPLETED", completedAt: now },
    }),
    prisma.employee.update({
      where: { id: offboarding.employeeId },
      data: { status: "RESIGNED", endDate: now },
    }),
  ]);

  await auditLog(user, {
    action: "COMPLETE",
    entityType: "OFFBOARDING",
    entityId: offboarding.id,
    detail: {
      employeeId: offboarding.employeeId,
      employeeCode: offboarding.employee.employeeCode,
    },
  });
  revalidatePath("/offboarding");
  revalidatePath(`/offboarding/${offboarding.id}`);
  revalidatePath(`/employees/${offboarding.employeeId}`);
  redirect(`/offboarding/${offboarding.id}`);
}

/** ยกเลิก / Cancel the offboarding; employee returns to ACTIVE. */
export async function cancelOffboarding(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const offboarding = await getOffboardingOrThrow(user, formData);

  await prisma.offboarding.update({
    where: { id: offboarding.id },
    data: { status: "CANCELLED" },
  });
  const employee = await prisma.employee.findFirst({
    where: { id: offboarding.employeeId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (employee?.status === "OFFBOARDING") {
    await prisma.employee.update({ where: { id: employee.id }, data: { status: "ACTIVE" } });
  }

  await auditLog(user, {
    action: "CANCEL",
    entityType: "OFFBOARDING",
    entityId: offboarding.id,
    detail: { employeeId: offboarding.employeeId },
  });
  revalidatePath("/offboarding");
  revalidatePath(`/offboarding/${offboarding.id}`);
  revalidatePath(`/employees/${offboarding.employeeId}`);
  redirect(`/offboarding/${offboarding.id}`);
}
