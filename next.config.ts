import type { NextConfig } from "next";

// Baseline hardening applied to every route EXCEPT the public intake form.
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Content-Security-Policy for the authenticated app (OPS-001). ENFORCED by
// default. A go-live safety valve: set CSP_REPORT_ONLY=true (a Cloud Run env
// var, no redeploy needed) to fall back to report-only if an unforeseen
// violation appears in production — it then only reports, never blocks.
//
// Known limitation: script-src keeps 'unsafe-inline' because the Next.js App
// Router emits inline bootstrap scripts and we do not yet mint per-request
// nonces. Everything else is locked down. The strict-CSP follow-up is
// nonce-based script-src with 'strict-dynamic' (needs middleware + UAT).
const appCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

// Enforce by default; flip to report-only only when CSP_REPORT_ONLY=true.
const cspReportOnly = process.env.CSP_REPORT_ONLY === "true";
const cspHeaderName = cspReportOnly
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

// The rest of the app must never be framed (clickjacking).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: cspHeaderName, value: appCsp },
  ...baseSecurityHeaders,
];

// The public case-intake page (/report/<org-slug>) is meant to be embedded on a
// company website, so it must be frameable. X-Frame-Options can't express an
// allowlist, so we drop it here and use CSP frame-ancestors instead. Defaults to
// "*" (embed anywhere); set REPORT_FRAME_ANCESTORS to lock it to specific
// origins, e.g. "https://www.acme.com https://acme.com".
const reportFrameAncestors = process.env.REPORT_FRAME_ANCESTORS ?? "*";
const reportHeaders = [
  ...baseSecurityHeaders,
  { key: "Content-Security-Policy", value: `frame-ancestors ${reportFrameAncestors}` },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  // Ensure the Thai PDF font ships with the standalone server bundle
  outputFileTracingIncludes: {
    "/api/reports/[report]": ["./src/assets/fonts/*.ttf"],
    "/api/borrow/[id]/pdf": ["./src/assets/fonts/*.ttf"],
  },
  async headers() {
    return [
      // Frameable public intake form (matches /report and /report/*, NOT /reports).
      { source: "/report/:path*", headers: reportHeaders },
      { source: "/report", headers: reportHeaders },
      // Everything else keeps X-Frame-Options: DENY.
      { source: "/((?!report(?:/|$)).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
