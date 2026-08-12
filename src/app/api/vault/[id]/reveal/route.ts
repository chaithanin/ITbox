import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/session";
import { revealVaultItem } from "@/lib/services/vault";
import { checkRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  mfaCode: z.string().max(10).optional(),
  reason: z.string().max(500).optional(),
  action: z.enum(["REVEAL_SECRET", "COPY_SECRET"]).default("REVEAL_SECRET"),
});

/**
 * POST /api/vault/:id/reveal — decrypt a secret after the full access chain
 * (authn → RBAC → item access → MFA policy → approval policy). The plaintext
 * is returned once over TLS with strict no-store headers, and never logged.
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (!checkRateLimit(`reveal:${user.id}`, 30, 60_000)) {
    throw new AuthError("RATE_LIMITED", 403);
  }
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const secret = await revealVaultItem(user, id, body);
  return NextResponse.json(
    { secret },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
});
