"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/session";
import { AuthError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  getStorageProvider, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import {
  createCase, addComment, transitionCase, assignCase, overridePriority,
  confirmResolution, submitSatisfaction,
} from "@/lib/services/support";
import type { CaseStatus, CasePriority } from "@prisma/client";

const emptyNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** Upload one optional attachment from a form field; returns descriptor or null. */
async function handleAttachment(
  organizationId: string,
  caseId: string | "new",
  file: FormDataEntryValue | null
): Promise<{ name: string; storagePath: string; contentType?: string; sizeBytes?: number } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new AuthError("FILE_TOO_LARGE", 400);
  const ext = ALLOWED_UPLOAD_TYPES[file.type];
  if (!ext) throw new AuthError("UNSUPPORTED_FILE_TYPE", 400);
  const objectPath = `${organizationId}/support/${caseId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await getStorageProvider().put(objectPath, buffer, file.type);
  return {
    name: file.name.slice(0, 200).replace(/[\r\n]/g, " ") || `file.${ext}`,
    storagePath: objectPath,
    contentType: file.type,
    sizeBytes: file.size,
  };
}

const createSchema = z.object({
  subject: z.string().min(3).max(300),
  description: z.string().min(1).max(5000),
  typeId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  categoryId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  subcategoryId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  impact: z.preprocess(emptyNull, z.enum(["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"]).nullable()),
  locationId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  assetId: z.preprocess(emptyNull, z.string().uuid().nullable()),
  requesterUserId: z.preprocess(emptyNull, z.string().uuid().nullable()),
});

export async function createCaseAction(formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/support/new?error=invalid");
  const attachment = await handleAttachment(user.organizationId, "new", formData.get("file"));
  const c = await createCase(user, {
    ...parsed.data,
    source: "WEB",
    attachments: attachment ? [attachment] : undefined,
  });
  revalidatePath("/support");
  redirect(`/support/${c.id}?created=1`);
}

export async function addCommentAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const body = z.string().min(1).max(5000).parse(formData.get("body"));
  const isInternal = formData.get("isInternal") === "on";
  const attachment = await handleAttachment(user.organizationId, caseId, formData.get("file"));
  await addComment(user, caseId, body, {
    isInternal,
    attachments: attachment ? [attachment] : undefined,
  });
  revalidatePath(`/support/${caseId}`);
}

export async function transitionAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const to = z.enum([
    "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR",
    "RESOLVED", "CLOSED", "REOPENED", "CANCELLED", "DUPLICATE",
  ]).parse(formData.get("to")) as CaseStatus;
  const resolutionNote = z.string().max(5000).optional().parse(formData.get("resolutionNote") || undefined);
  const reason = z.string().max(500).optional().parse(formData.get("reason") || undefined);
  try {
    await transitionCase(user, caseId, to, { resolutionNote, reason });
  } catch (e) {
    if (e instanceof AuthError && e.message.startsWith("RESOLUTION_NOTE_REQUIRED")) {
      redirect(`/support/${caseId}?error=resolution-note`);
    }
    if (e instanceof AuthError && e.message.startsWith("INVALID_TRANSITION")) {
      redirect(`/support/${caseId}?error=invalid-transition`);
    }
    throw e;
  }
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/support/queue");
}

export async function assignAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const teamId = z.preprocess(emptyNull, z.string().uuid().nullable()).parse(formData.get("teamId"));
  const userId = z.preprocess(emptyNull, z.string().uuid().nullable()).parse(formData.get("userId"));
  await assignCase(user, caseId, {
    teamId: teamId as string | null,
    userId: userId as string | null,
  });
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/support/queue");
}

export async function assignToMeAction(caseId: string) {
  const user = await requireUser();
  await assignCase(user, caseId, { userId: user.id });
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/support/queue");
}

export async function overridePriorityAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const priority = z.enum(["P1", "P2", "P3", "P4"]).parse(formData.get("priority")) as CasePriority;
  const reason = z.string().max(500).optional().parse(formData.get("reason") || undefined);
  await overridePriority(user, caseId, priority, reason);
  revalidatePath(`/support/${caseId}`);
}

export async function confirmResolutionAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const satisfied = formData.get("satisfied") === "yes";
  const reason = z.string().max(1000).optional().parse(formData.get("reason") || undefined);
  await confirmResolution(user, caseId, satisfied, reason);
  revalidatePath(`/support/${caseId}`);
}

export async function submitSatisfactionAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  const rating = z.coerce.number().int().min(1).max(5).parse(formData.get("rating"));
  const comment = z.string().max(1000).optional().parse(formData.get("comment") || undefined);
  await submitSatisfaction(user, caseId, rating, comment);
  revalidatePath(`/support/${caseId}`);
}

// Used by the "New Case" form: fetch categories for a chosen parent (client refetch not needed;
// the form renders all and filters client-side). Exposed for completeness.
export async function noop() {
  await requirePermission("support:create");
}
