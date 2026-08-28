import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto/envelope";

/**
 * CCTV device master helpers.
 * Parses a Dahua ConfigTool/SmartPSS `device.xml` export and upserts recorders,
 * storing each credential envelope-encrypted (never in plaintext). The `domain`
 * attribute in these exports is the Dahua device serial / P2P id, not an IP.
 */

export interface ParsedDevice {
  name: string;
  serial: string; // from `domain`
  tcpPort: number;
  username: string;
  password: string; // Dahua reversible-encrypted export blob — treat as a live secret
  protocol: string;
  connect: string;
}

const attr = (tag: string, key: string): string => {
  const m = tag.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : "";
};

export function parseDeviceXml(xml: string): ParsedDevice[] {
  const out: ParsedDevice[] = [];
  for (const m of xml.matchAll(/<Device\b[^>]*\/?>/gi)) {
    const tag = m[0];
    const name = attr(tag, "name").trim();
    const serial = attr(tag, "domain").trim();
    if (!name && !serial) continue;
    out.push({
      name: name || serial,
      serial,
      tcpPort: Number(attr(tag, "port")) || 37777,
      username: attr(tag, "username").trim() || "admin",
      password: attr(tag, "password"),
      protocol: attr(tag, "protocol").trim() || "1",
      connect: attr(tag, "connect").trim(),
    });
  }
  return out;
}

/** Best-effort project/site derivation from the device display name. */
export function deriveProjectSite(name: string): { project: string | null; site: string | null } {
  const n = name.trim();
  const rules: { re: RegExp; project: string }[] = [
    { re: /^main\s*office/i, project: "Main Office" },
    { re: /^paradise/i, project: "Paradise" },
    { re: /^phangan/i, project: "Phangan" },
    { re: /^pratumnak/i, project: "Pratumnak" },
    { re: /^tower/i, project: "Tower" },
    { re: /^marina/i, project: "Marina" },
    { re: /^harmonia/i, project: "Harmonia" },
  ];
  for (const r of rules) {
    if (r.re.test(n)) {
      const site = n.replace(r.re, "").trim() || null;
      return { project: r.project, site };
    }
  }
  return { project: null, site: null };
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  linkedAssets: number;
  errors: { name: string; error: string }[];
}

/**
 * Upsert recorders from a parsed device.xml into the org's CCTV device master.
 * Credentials are envelope-encrypted; an existing recorder's encrypted credential
 * is only overwritten when a (non-empty) password is present in the file.
 */
export async function importRecordersFromXml(
  organizationId: string,
  devices: ParsedDevice[]
): Promise<ImportResult> {
  const res: ImportResult = { total: devices.length, created: 0, updated: 0, linkedAssets: 0, errors: [] };

  // Pre-load assets that might match by serial, to link recorders to CCTV assets.
  const assets = await prisma.asset.findMany({
    where: { organizationId, deletedAt: null, serialNumber: { not: null } },
    select: { id: true, serialNumber: true },
  });
  const assetBySerial = new Map(assets.map((a) => [(a.serialNumber || "").toUpperCase(), a.id]));

  for (const d of devices) {
    if (!d.serial) { res.errors.push({ name: d.name, error: "missing serial (domain)" }); continue; }
    try {
      const { project, site } = deriveProjectSite(d.name);
      const assetId = assetBySerial.get(d.serial.toUpperCase()) ?? null;
      if (assetId) res.linkedAssets++;

      const enc = d.password ? await encryptSecret(d.password) : null;
      const credFields = enc
        ? {
            credentialEnc: enc.ciphertext,
            credentialIv: enc.iv,
            credentialTag: enc.authTag,
            credentialDekEnc: enc.dekEnc,
            credentialKeyVer: enc.kmsKeyVersion,
          }
        : {};

      const existing = await prisma.cctvRecorder.findUnique({
        where: { organizationId_serial: { organizationId, serial: d.serial } },
        select: { id: true },
      });

      if (existing) {
        await prisma.cctvRecorder.update({
          where: { id: existing.id },
          data: {
            name: d.name, tcpPort: d.tcpPort, username: d.username, protocol: d.protocol,
            project, site, assetId: assetId ?? undefined, ...credFields,
          },
        });
        res.updated++;
      } else {
        await prisma.cctvRecorder.create({
          data: {
            organizationId, name: d.name, serial: d.serial, tcpPort: d.tcpPort,
            username: d.username, protocol: d.protocol, project, site,
            assetId: assetId ?? undefined, ...credFields,
          },
        });
        res.created++;
      }
    } catch (e) {
      res.errors.push({ name: d.name, error: (e as Error).message.slice(0, 120) });
    }
  }
  return res;
}
