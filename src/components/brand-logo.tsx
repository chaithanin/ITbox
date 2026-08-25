import { cn } from "@/lib/utils";

/**
 * TECHCORE brand mark — a shield/hexagon of circuit traces in blue→cyan with a
 * teal facet, wrapped around a glossy core sphere. Pure inline SVG so it stays
 * crisp at every size (sidebar, login, favicon) and carries its own dark tile.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="TECHCORE" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="tc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12294c" />
          <stop offset="1" stopColor="#0a1830" />
        </linearGradient>
        <linearGradient id="tc-panel" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3aa0ff" />
          <stop offset="1" stopColor="#1e4fd6" />
        </linearGradient>
        <linearGradient id="tc-panel2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#22c3e6" />
        </linearGradient>
        <linearGradient id="tc-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <radialGradient id="tc-core" cx="0.42" cy="0.36" r="0.7">
          <stop offset="0" stopColor="#eaf6ff" />
          <stop offset="0.35" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </radialGradient>
      </defs>

      {/* dark tile */}
      <rect x="1" y="1" width="46" height="46" rx="11" fill="url(#tc-bg)" />

      {/* shield / hexagon body */}
      <path d="M24 5 L39 13.5 L39 30.5 L24 43 L9 30.5 L9 13.5 Z" fill="url(#tc-panel)" opacity="0.16" />
      <path
        d="M24 5 L39 13.5 L39 30.5 L24 43 L9 30.5 L9 13.5 Z"
        fill="none" stroke="url(#tc-line)" strokeWidth="2" strokeLinejoin="round"
      />

      {/* left blue facet + right teal facet (like the reference two-tone) */}
      <path d="M9 13.5 L24 5 L24 24 L9 30.5 Z" fill="url(#tc-panel)" opacity="0.28" />
      <path d="M39 30.5 L24 43 L24 24 Z" fill="url(#tc-panel2)" opacity="0.30" />

      {/* concentric circuit arcs around the core */}
      <g fill="none" stroke="url(#tc-line)" strokeLinecap="round">
        <path d="M17 24 A7 7 0 0 1 24 17" strokeWidth="1.7" />
        <path d="M31 24 A7 7 0 0 1 24 31" strokeWidth="1.7" />
        <path d="M13.5 24 A10.5 10.5 0 0 1 21 13.9" strokeWidth="1.3" opacity="0.85" />
        <path d="M34.5 24 A10.5 10.5 0 0 1 27 34.1" strokeWidth="1.3" opacity="0.85" />
      </g>

      {/* radiating traces + nodes */}
      <g stroke="url(#tc-line)" strokeWidth="1.5" strokeLinecap="round" fill="#7dd3fc">
        <path d="M24 12 L24 9" /><circle cx="24" cy="8" r="1.5" />
        <path d="M32.5 15.5 L30 18" /><circle cx="33.5" cy="14.5" r="1.5" />
        <path d="M15.5 15.5 L18 18" /><circle cx="14.5" cy="14.5" r="1.5" />
        <path d="M12 24 L15 24" /><circle cx="10.7" cy="24" r="1.5" />
        <path d="M36 24 L33 24" /><circle cx="37.3" cy="24" r="1.5" />
        <path d="M15.5 32.5 L18 30" /><circle cx="14.5" cy="33.5" r="1.5" />
        <path d="M32.5 32.5 L30 30" /><circle cx="33.5" cy="33.5" r="1.5" />
        <path d="M24 36 L24 33" /><circle cx="24" cy="37" r="1.5" />
      </g>

      {/* core sphere */}
      <circle cx="24" cy="24" r="6" fill="url(#tc-core)" />
      <circle cx="21.9" cy="21.7" r="1.6" fill="#f5fbff" opacity="0.92" />
    </svg>
  );
}
