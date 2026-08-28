import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";

const GREEN = new Set(["ONLINE", "RECORDING", "NORMAL", "UP"]);
const YELLOW = new Set(["WARNING", "DEGRADED", "NOT_RECORDING", "VIDEO_LOSS", "MAINTENANCE"]);
const RED = new Set(["OFFLINE", "CRITICAL", "FAILED", "AUTH_ERROR", "NETWORK_ERROR", "TIMEOUT", "STREAM_ERROR", "NO_RECORDING", "NO_RECORDING_FOUND", "HDD_ERROR", "HDD_FULL"]);

export function statusVariant(status?: string | null): Variant {
  const s = (status ?? "UNKNOWN").toUpperCase();
  if (GREEN.has(s)) return "success";
  if (YELLOW.has(s)) return "warning";
  if (RED.has(s)) return "destructive";
  return "secondary";
}

export function StatusBadge({ status }: { status?: string | null }) {
  return <Badge variant={statusVariant(status)}>{status ?? "UNKNOWN"}</Badge>;
}

/** 13.6 -> "13 วัน 14 ชม." */
export function formatRetention(days?: number | null, estimated?: boolean): string {
  if (days == null) return "—";
  const d = Math.floor(days);
  const h = Math.round((days - d) * 24);
  return `${d} วัน ${h} ชม.${estimated ? " (ประมาณ)" : ""}`;
}

export function timeAgo(dt?: Date | null): string {
  if (!dt) return "—";
  const mins = Math.round((Date.now() - new Date(dt).getTime()) / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
}
