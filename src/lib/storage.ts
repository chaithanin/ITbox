/**
 * File storage abstraction.
 *  - "gcs" (production): Google Cloud Storage via JSON API + ADC token.
 *  - "local" (development): files under LOCAL_STORAGE_DIR (default ./.uploads,
 *    gitignored). Refuses to run in production unless explicitly overridden.
 *
 * Object paths are always generated server-side ({orgId}/assets/{assetId}/...)
 * — user input never becomes a filesystem/object path directly.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getGcpAccessToken } from "@/lib/gcp/token";

export interface StorageProvider {
  put(objectPath: string, data: Buffer, contentType: string): Promise<void>;
  get(objectPath: string): Promise<Buffer>;
  delete(objectPath: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true"
    ) {
      throw new Error(
        "STORAGE_PROVIDER=local is not allowed in production. Use STORAGE_PROVIDER=gcs."
      );
    }
    this.baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || ".uploads");
  }

  private resolve(objectPath: string): string {
    const full = path.resolve(this.baseDir, objectPath);
    if (!full.startsWith(this.baseDir + path.sep)) {
      throw new Error("Invalid storage path");
    }
    return full;
  }

  async put(objectPath: string, data: Buffer): Promise<void> {
    const full = this.resolve(objectPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(objectPath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(objectPath));
  }

  async delete(objectPath: string): Promise<void> {
    await fs.rm(this.resolve(objectPath), { force: true });
  }
}

class GcsStorageProvider implements StorageProvider {
  private bucket: string;

  constructor() {
    const bucket = process.env.GCS_BUCKET_DOCUMENTS;
    if (!bucket) {
      throw new Error("GCS_BUCKET_DOCUMENTS is required when STORAGE_PROVIDER=gcs");
    }
    this.bucket = bucket;
  }

  async put(objectPath: string, data: Buffer, contentType: string): Promise<void> {
    const token = await getGcpAccessToken();
    const res = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: new Uint8Array(data),
      }
    );
    if (!res.ok) throw new Error(`GCS upload failed with status ${res.status}`);
  }

  async get(objectPath: string): Promise<Buffer> {
    const token = await getGcpAccessToken();
    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(objectPath)}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`GCS download failed with status ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(objectPath: string): Promise<void> {
    const token = await getGcpAccessToken();
    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(objectPath)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`GCS delete failed with status ${res.status}`);
    }
  }
}

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  const kind = process.env.STORAGE_PROVIDER || "local";
  provider = kind === "gcs" ? new GcsStorageProvider() : new LocalStorageProvider();
  return provider;
}

// Allowed upload types for asset documents/images
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Defense-in-depth: verify the file's magic bytes match its declared MIME type,
 * so a client can't smuggle (e.g.) HTML under an image/png content-type. Text
 * formats (csv/txt) have no reliable signature and are allowed through.
 * Returns true if the bytes are consistent with (or unverifiable for) the type.
 */
export function verifyMagicBytes(data: Buffer, declaredType: string): boolean {
  const b = data.subarray(0, 16);
  const startsWith = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  switch (declaredType) {
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/webp":
      return startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case "application/pdf":
      return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06); // PK zip
    case "text/csv":
    case "text/plain":
      return true; // no reliable signature
    default:
      return true; // unknown-but-allowlisted types: don't block
  }
}
