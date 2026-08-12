/**
 * Warm up the Next.js dev server before any test runs.
 *
 * On a cold dev server the first hit to each route triggers an on-demand
 * compile; the very first POST to the NextAuth credentials callback also pays
 * for compiling the auth route plus loading argon2/Prisma. Those cold hits can
 * make the first sign-in attempt fail with a generic error, so we pre-compile
 * the routes and fire one throwaway credentials attempt here.
 */
const BASE_URL = "http://localhost:3400";

async function warm(path: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  } catch {
    // best-effort warmup only
  }
}

export default async function globalSetup(): Promise<void> {
  await warm("/login");
  await Promise.all(["/dashboard", "/assets", "/assets/new", "/vault", "/vault/new"].map(warm));

  try {
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const cookies = csrfRes.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    // Throwaway credentials attempt (unknown user) purely to warm the
    // auth callback, password hashing and DB path. Expected to be rejected.
    await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookies,
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        csrfToken,
        email: "warmup-not-a-user@example.com",
        password: "warmup-throwaway",
      }),
    });
  } catch {
    // best-effort warmup only
  }
}
