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

// The rest of the app must never be framed (clickjacking).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
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
