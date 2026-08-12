import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { finishPasskeyRegistration } from "@/lib/webauthn";
import { auditLog } from "@/lib/audit";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

const bodySchema = z.object({
  response: z.record(z.string(), z.unknown()),
  name: z.string().max(100).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = bodySchema.parse(await req.json());
  const cred = await finishPasskeyRegistration(
    user.id,
    body.response as unknown as RegistrationResponseJSON,
    body.name
  );
  await auditLog(user, {
    action: "UPDATE",
    entityType: "USER",
    entityId: user.id,
    detail: { event: "PASSKEY_REGISTERED", credentialId: cred.id },
  });
  return NextResponse.json({ ok: true });
});
