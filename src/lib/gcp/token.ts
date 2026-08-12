/**
 * GCP access token via the metadata server (Application Default Credentials
 * on Cloud Run / GCE). No key files — see docs/security.md.
 */
let cached: { token: string; exp: number } | null = null;

export async function getGcpAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!res.ok) {
    throw new Error(
      "Unable to obtain GCP access token from metadata server. " +
        "Outside GCP, use STORAGE_PROVIDER=local for development."
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}
