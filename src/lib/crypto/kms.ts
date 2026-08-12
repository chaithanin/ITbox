/**
 * KMS abstraction for envelope encryption.
 *
 * Production ("gcp"): Data Encryption Keys (DEKs) are wrapped/unwrapped by
 * Google Cloud KMS. Auth uses Application Default Credentials — on Cloud Run
 * the metadata server provides the service-account token, so no key file is
 * ever stored in the app.
 *
 * Development ("local"): DEKs are wrapped with a master key from
 * LOCAL_KMS_MASTER_KEY (env). This mode must NEVER be used in production and
 * refuses to start when NODE_ENV=production unless explicitly overridden.
 *
 * The raw DEK and plaintext secrets never leave process memory and are never
 * logged, cached, or persisted.
 */
import crypto from "node:crypto";

export interface KmsProvider {
  /** Wrap (encrypt) a DEK. Returns base64 ciphertext + key version label. */
  wrapDek(dek: Buffer): Promise<{ wrapped: string; keyVersion: string }>;
  /** Unwrap (decrypt) a wrapped DEK. */
  unwrapDek(wrapped: string): Promise<Buffer>;
}

class LocalKmsProvider implements KmsProvider {
  private masterKey: Buffer;

  constructor() {
    const raw = process.env.LOCAL_KMS_MASTER_KEY;
    if (!raw) {
      throw new Error(
        "LOCAL_KMS_MASTER_KEY is required when KMS_PROVIDER=local"
      );
    }
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_KMS_IN_PRODUCTION !== "true"
    ) {
      throw new Error(
        "KMS_PROVIDER=local is not allowed in production. Use KMS_PROVIDER=gcp."
      );
    }
    // Derive a stable 32-byte key from the configured master key
    this.masterKey = crypto
      .createHash("sha256")
      .update(Buffer.from(raw, "utf8"))
      .digest();
  }

  async wrapDek(dek: Buffer): Promise<{ wrapped: string; keyVersion: string }> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      wrapped: Buffer.concat([iv, tag, ct]).toString("base64"),
      keyVersion: "local-1",
    };
  }

  async unwrapDek(wrapped: string): Promise<Buffer> {
    const buf = Buffer.from(wrapped, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

/**
 * Google Cloud KMS via REST + Application Default Credentials.
 * On Cloud Run the token comes from the metadata server; locally from
 * GOOGLE_APPLICATION_CREDENTIALS (not committed, see .gitignore).
 */
class GcpKmsProvider implements KmsProvider {
  private keyName: string;
  private cachedToken: { token: string; exp: number } | null = null;

  constructor() {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.KMS_LOCATION || "global";
    const ring = process.env.KMS_KEY_RING;
    const key = process.env.KMS_CRYPTO_KEY;
    if (!project || !ring || !key) {
      throw new Error(
        "GCP_PROJECT_ID, KMS_KEY_RING and KMS_CRYPTO_KEY are required when KMS_PROVIDER=gcp"
      );
    }
    this.keyName = `projects/${project}/locations/${location}/keyRings/${ring}/cryptoKeys/${key}`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.exp > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    // Cloud Run / GCE metadata server
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!res.ok) {
      throw new Error(
        "Unable to obtain GCP access token from metadata server. " +
          "Outside GCP, use KMS_PROVIDER=local for development."
      );
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      token: data.access_token,
      exp: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  private async call(method: "encrypt" | "decrypt", body: object) {
    const token = await this.getAccessToken();
    const res = await fetch(
      `https://cloudkms.googleapis.com/v1/${this.keyName}:${method}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      // Do not include request body (contains key material) in the error.
      throw new Error(`Cloud KMS ${method} failed with status ${res.status}`);
    }
    return res.json();
  }

  async wrapDek(dek: Buffer): Promise<{ wrapped: string; keyVersion: string }> {
    const data = (await this.call("encrypt", {
      plaintext: dek.toString("base64"),
    })) as { ciphertext: string; name?: string };
    return { wrapped: data.ciphertext, keyVersion: data.name ?? this.keyName };
  }

  async unwrapDek(wrapped: string): Promise<Buffer> {
    const data = (await this.call("decrypt", { ciphertext: wrapped })) as {
      plaintext: string;
    };
    return Buffer.from(data.plaintext, "base64");
  }
}

let provider: KmsProvider | null = null;

export function getKmsProvider(): KmsProvider {
  if (provider) return provider;
  const kind = process.env.KMS_PROVIDER || "local";
  provider = kind === "gcp" ? new GcpKmsProvider() : new LocalKmsProvider();
  return provider;
}

/** Test seam */
export function __setKmsProvider(p: KmsProvider | null) {
  provider = p;
}
