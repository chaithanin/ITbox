/**
 * Edge-safe Auth.js config (no Prisma / node-only imports).
 * Used by middleware for route protection; full config lives in src/auth.ts.
 */
import type { NextAuthConfig } from "next-auth";

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // absolute timeout: 8h

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/scan") ||
        pathname.startsWith("/report") || // public web-intake case form
        pathname === "/api/public/employee-lookup" || // staff-ID confirm step on that form
        pathname.startsWith("/api/cron/") || // CRON_SECRET-authed scheduled jobs (verifyCronSecret)
        pathname.startsWith("/api/it-report/ingest") || // API-key-authed collector push
        pathname.startsWith("/api/edr/ingest") || // API-key-authed endpoint agent push
        pathname.startsWith("/api/monitoring/ingest") || // API-key-authed monitoring push
        pathname.startsWith("/api/hr/employees/") || // API-key-authed HR/ATS employee ingest (sync, link-users)
        pathname.startsWith("/api/inventory/ingest") || // API-key-authed asset/license inventory push
        pathname.startsWith("/api/cctv/ingest") || // API-key-authed CCTV collector push
        pathname === "/api/cctv/snapshot" || // API-key-authed snapshot upload (exact: serve route stays session-gated)
        pathname === "/api/cctv/commands" || // API-key-authed collector command poll
        pathname.startsWith("/api/kb/import") || // API-key-authed KB bulk import
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";
      if (isPublic) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
