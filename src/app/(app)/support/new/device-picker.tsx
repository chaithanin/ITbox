"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";

export interface DeviceOption {
  id: string;
  assetTag: string;
  name: string;
}

export interface ReporterEmployeeEventDetail {
  employeeId: string;
  employeeName: string;
}

export function DevicePicker({ initialDevices }: { initialDevices: DeviceOption[] }) {
  const [devices, setDevices] = useState<DeviceOption[]>(initialDevices);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onPick = (ev: Event) => {
      const detail = (ev as CustomEvent<ReporterEmployeeEventDetail>).detail;
      if (!detail?.employeeId) return;
      setLoading(true);
      setOwnerName(detail.employeeName || null);
      setValue("");
      fetch(`/api/employees/${detail.employeeId}/assets`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { data?: DeviceOption[] } | null) => setDevices(body?.data ?? []))
        .catch(() => setDevices([]))
        .finally(() => setLoading(false));
    };
    window.addEventListener("reporter-employee", onPick);
    return () => window.removeEventListener("reporter-employee", onPick);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor="assetId" className="text-sm font-medium leading-none">
          อุปกรณ์ / Device
        </label>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Select
        id="assetId"
        name="assetId"
        className="mt-1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
      >
        <option value="">— ไม่ระบุ / None —</option>
        {devices.map((a) => (
          <option key={a.id} value={a.id}>
            {a.assetTag} — {a.name}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {ownerName
          ? devices.length > 0
            ? `อุปกรณ์ของ ${ownerName} (${devices.length} รายการ)`
            : `${ownerName} ไม่มีอุปกรณ์ที่ถือครอง / No devices held`
          : devices.length > 0
            ? "อุปกรณ์ที่ผูกกับคุณ — เลือกพนักงานด้านบนเพื่อดึงอุปกรณ์ของเขา"
            : "เลือกพนักงานด้านบนเพื่อดึงอุปกรณ์ที่เขาถือครอง"}
      </p>
    </div>
  );
}
