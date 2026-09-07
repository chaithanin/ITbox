import { prisma } from "@/lib/prisma";

/**
 * Daily-sequenced reference number for the access-request document:
 *   REQ{DD}{MM}{YY}-{NN}   e.g. the first request on 7 Sep 2026 → REQ070926-01
 *
 * NN is the running count of access-request documents for the org on that day
 * (Asia/Bangkok calendar day, so it doesn't roll over at UTC midnight for Thai
 * users), zero-padded to 2 digits.
 */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

export async function generateAccessRefNo(orgId: string, now: Date = new Date()): Promise<string> {
  const b = new Date(now.getTime() + BKK_OFFSET_MS); // Bangkok wall-clock via UTC getters
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const mm = String(b.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(b.getUTCFullYear() % 100).padStart(2, "0");

  // Bangkok midnight expressed in real UTC, for the day's count window.
  const startUtc = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - BKK_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  const count = await prisma.accessRequest.count({
    where: { organizationId: orgId, createdAt: { gte: startUtc, lt: endUtc } },
  });
  const seq = String(count + 1).padStart(2, "0");
  return `REQ${dd}${mm}${yy}-${seq}`;
}
