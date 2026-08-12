import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { startPasskeyAuthentication } from "@/lib/webauthn";
import { checkRateLimit } from "@/lib/rate-limit";
import { AuthError } from "@/lib/errors";

export const POST = apiHandler(async () => {
  const user = await requireUser();
  if (!checkRateLimit(`webauthn:${user.id}`, 20, 60_000)) {
    throw new AuthError("RATE_LIMITED", 403);
  }
  const options = await startPasskeyAuthentication(user.id);
  return NextResponse.json(options, {
    headers: { "Cache-Control": "no-store" },
  });
});
