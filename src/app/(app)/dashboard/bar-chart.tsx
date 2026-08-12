import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface BarRow {
  label: string;
  count: number;
  /** Tailwind bg class for this bar (defaults to bg-primary). */
  color?: string;
}

/** Pure server-rendered horizontal bar chart card (no chart libraries). */
export function BarChartCard({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: BarRow[];
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>
          {description ?? `รวม / Total: ${total.toLocaleString()}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">ไม่มีข้อมูล / No data</p>
        )}
        {rows.map((r) => {
          const pct = r.count === 0 ? 0 : Math.max(2, Math.round((r.count / max) * 100));
          return (
            <div
              key={r.label}
              className="flex items-center gap-2 text-sm"
              title={`${r.label}: ${r.count.toLocaleString()}`}
            >
              <span
                className="w-32 shrink-0 truncate text-xs text-muted-foreground"
                title={r.label}
              >
                {r.label}
              </span>
              <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted/50">
                <div
                  className={cn("h-4 rounded", r.color ?? "bg-primary")}
                  style={{ width: `${pct}%` }}
                  title={`${r.label}: ${r.count.toLocaleString()}`}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums">
                {r.count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
