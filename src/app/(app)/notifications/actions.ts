"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const idSchema = z.string().uuid();

/** Mark one of the current user's notifications as read. Own data only. */
export async function markRead(id: string): Promise<void> {
  const user = await requireUser();
  const notificationId = idSchema.parse(id);

  const { count } = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      organizationId: user.organizationId,
      userId: user.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  if (count > 0) {
    await auditLog(user, {
      action: "UPDATE",
      entityType: "NOTIFICATION",
      entityId: notificationId,
      detail: { markedRead: true },
    });
  }
  revalidatePath("/notifications");
}

/** Mark all of the current user's unread notifications as read. */
export async function markAllRead(): Promise<void> {
  const user = await requireUser();

  const { count } = await prisma.notification.updateMany({
    where: { organizationId: user.organizationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (count > 0) {
    await auditLog(user, {
      action: "UPDATE",
      entityType: "NOTIFICATION",
      detail: { markedAllRead: true, count },
    });
  }
  revalidatePath("/notifications");
}
