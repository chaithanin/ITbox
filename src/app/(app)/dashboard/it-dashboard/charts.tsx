// Pure server-rendered chart primitives (no client JS) for the IT dashboard.
// Theme-safe: colors are passed explicitly; text uses currentColor tokens.

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerTop,
  centerSub,
  size = 150,
}: {
  segments: Segment[];
  centerTop: string;
  centerSub?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  const hole = Math.round(size * 0.62);
  return (
    <div className="flex items-center justify-center">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "9999px",
          background: `conic-gradient(${stops})`,
        }}
        className="relative shrink-0"
      >
        <div
          style={{ width: hole, height: hole }}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-card"
        >
          <span className="text-xl font-bold leading-none">{centerTop}</span>
          {centerSub && <span className="mt-1 text-[11px] text-muted-foreground">{centerSub}</span>}
        </div>
      </div>
    </div>
  );
}

export function Legend({ segments, total }: { segments: Segment[]; total: number }) {
  return (
    <div className="space-y-1.5">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
          <span className="font-medium tabular-nums">{s.value.toLocaleString()}</span>
          <span className="w-10 text-right text-muted-foreground tabular-nums">
            {total > 0 ? Math.round((s.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export interface HBarRow {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
}

export function HBars({ rows, unit }: { rows: HBarRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground">{r.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round((r.value / max) * 100)}%`, backgroundColor: r.color ?? "#3b82f6" }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-medium tabular-nums">
            {r.suffix ?? `${r.value.toLocaleString()}${unit ?? ""}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A horizontal progress meter (0..100). */
export function Meter({ percent, color = "#16a34a" }: { percent: number; color?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
    </div>
  );
}

/** Simple SVG line for a small trend. */
export function Sparkline({
  points,
  color = "#2563eb",
  height = 60,
  width = 320,
}: {
  points: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - 6 - ((p - min) / range) * (height - 16);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
      ))}
    </svg>
  );
}
