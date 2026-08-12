import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { apiHandler } from "@/lib/api";
import { AuthError } from "@/lib/session";
import { getPendingTotpUri } from "@/app/(app)/settings/actions";

/**
 * QR image for TOTP enrollment. Only available while enrollment is pending
 * (mfaEnabled=false); returns 404 once MFA is active. Strict no-store.
 */
export const GET = apiHandler(async () => {
  const uri = await getPendingTotpUri();
  if (!uri) throw new AuthError("NOT_FOUND", 404);
  const png = await QRCode.toBuffer(uri, { width: 320, margin: 1 });
  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
});
