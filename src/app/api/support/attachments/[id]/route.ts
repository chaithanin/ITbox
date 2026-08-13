import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { getCaseOrThrow } from "@/lib/services/support";

/** Download a support case attachment (access-controlled via case visibility). */
export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const attachment = await prisma.caseAttachment.findUnique({ where: { id } });
    if (!attachment) throw new AuthError("NOT_FOUND", 404);

    // Enforces org-scope + requester/assignee/agent access, throws 403/404.
    await getCaseOrThrow(user, attachment.caseId);

    const data = await getStorageProvider().get(attachment.storagePath);
    const isImage = (attachment.contentType ?? "").startsWith("image/");
    const asciiName = attachment.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": attachment.contentType ?? "application/octet-stream",
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
);
