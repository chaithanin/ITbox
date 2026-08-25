import { cn } from "@/lib/utils";

/**
 * TECHCORE brand mark — a hexagon of circuit traces around a glowing core node.
 * Pure inline SVG so it stays crisp at every size (sidebar, login, favicon) and
 * carries its own dark-navy tile, matching the brand logo.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="TECHCORE"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="tc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d2444" />
          <stop offset="1" stopColor="#0a1830" />
        </linearGradient>
        <linearGradient id="tc-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <radialGradient id="tc-core" cx="0.5" cy="0.42" r="0.6">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="0.45" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </radialGradient>
      </defs>

      {/* tile */}
      <rect x="1" y="1" width="46" height="46" rx="11" fill="url(#tc-bg)" />

      {/* hexagon */}
      <path
        d="M24 7 L38 15 L38 33 L24 41 L10 33 L10 15 Z"
        fill="none"
        stroke="url(#tc-line)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* circuit traces + nodes */}
      <g stroke="url(#tc-line)" strokeWidth="1.6" strokeLinecap="round" fill="#67e8f9">
        <path d="M24 12 L24 18" />
        <circle cx="24" cy="11" r="1.6" />
        <path d="M15 18 L20 21" />
        <circle cx="14" cy="17.5" r="1.6" />
        <path d="M33 18 L28 21" />
        <circle cx="34" cy="17.5" r="1.6" />
        <path d="M14 30 L20 27" />
        <circle cx="13" cy="30.5" r="1.6" />
        <path d="M34 30 L28 27" />
        <circle cx="35" cy="30.5" r="1.6" />
        <path d="M24 36 L24 30" />
        <circle cx="24" cy="37" r="1.6" />
      </g>

      {/* core */}
      <circle cx="24" cy="24" r="6.4" fill="url(#tc-core)" />
      <circle cx="21.9" cy="21.9" r="1.7" fill="#f0f9ff" opacity="0.9" />
    </svg>
  );
}
