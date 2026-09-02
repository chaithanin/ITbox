import crypto from "node:crypto";

/**
 * Verify a Cloud Scheduler request's bearer token against CRON_SECRET in
 * constant time, so the shared secret can't be recovered via a timing side
 * channel from a short-circuiting `!==` compare (AUTH-010). Returns true only
 * when CRON_SECRET is configured and the header matches exactly.
 */
export function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
