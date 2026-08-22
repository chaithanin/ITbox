import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadKpiConfigs, KPI_META, KPI_ORDER } from "@/lib/services/kpi";
import { saveKpiConfigAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KpiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requirePermission("support:settings");
  const sp = await searchParams;
  const configs = await loadKpiConfigs(admin.organizationId);
  const byMetric = new Map(configs.map((c) => [c.metric, c]));
  const totalWeight = configs.filter((c) => c.active).reduce((s, c) => s + c.weight, 0);

  return (
    <div>
      <PageHeader
        title="ตั้งค่า KPI / KPI Configuration"
        description="กำหนดเป้าหมายและน้ำหนักของ KPI งาน IT Support (น้ำหนักที่เปิดใช้งานควรรวมกันได้ 100%)"
      />
      {sp.ok && (
        <p className="mb-4 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          บันทึกการตั้งค่า KPI แล้ว / Saved
        </p>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            KPI &amp; น้ำหนัก — รวมน้ำหนักที่เปิดใช้งานตอนนี้: {" "}
            <span className={totalWeight === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
              {totalWeight}%
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveKpiConfigAction} className="space-y-4">
            {KPI_ORDER.map((metric) => {
              const meta = KPI_META[metric];
              const cfg = byMetric.get(metric);
              return (
                <div key={metric} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-4">
                  <div className="sm:col-span-1">
                    <p className="text-sm font-medium">{meta.icon} {meta.labelTh}</p>
                    <p className="text-xs text-muted-foreground">
                      {meta.labelEn} · {meta.higherIsBetter ? "ยิ่งมากยิ่งดี" : "ยิ่งน้อยยิ่งดี"}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={`target_${metric}`}>เป้าหมาย ({meta.unit || "ค่า"})</Label>
                    <Input
                      id={`target_${metric}`}
                      name={`target_${metric}`}
                      type="number"
                      step="0.1"
                      className="mt-1"
                      defaultValue={cfg?.target ?? 0}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`weight_${metric}`}>น้ำหนัก (%)</Label>
                    <Input
                      id={`weight_${metric}`}
                      name={`weight_${metric}`}
                      type="number"
                      min={0}
                      max={100}
                      className="mt-1"
                      defaultValue={cfg?.weight ?? 0}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`active_${metric}`}
                      name={`active_${metric}`}
                      defaultChecked={cfg?.active ?? true}
                    />
                    <Label htmlFor={`active_${metric}`}>เปิดใช้งาน / Active</Label>
                  </div>
                </div>
              );
            })}
            <Button type="submit">บันทึก / Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
