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

// Content-Security-Policy for the authenticated app (OPS-001). Shipped in
// REPORT-ONLY mode first: it never blocks, only reports violations, so we can
// observe what a strict policy would break before switching the header name to
// "Content-Security-Policy" to enforce it. 'unsafe-inline' on scripts is a
// stepping stone — replace it with per-request nonces when enforcing.
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
].join("; ");

// The rest of the app must never be framed (clickjacking).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy-Report-Only", value: appCsp },
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
