import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The whole system runs on Thailand time. The server process TZ is set to
// Asia/Bangkok (Dockerfile), and formatters pin the zone explicitly so client
// components render identically regardless of the viewer's browser timezone.
export const APP_TIME_ZONE = "Asia/Bangkok";

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

export function formatMoney(v: unknown): string {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Whole months elapsed between two dates (never negative). */
export function monthsBetween(from: Date, to: Date): number {
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, m);
}

/**
 * Current book value of an asset. Prefers a straight-line depreciation from
 * purchasePrice over depreciationMonths when both (and purchaseDate) are known;
 * otherwise falls back to the stored currentValue, then purchasePrice, then 0.
 * Never mutates data — a pure read-side calculation.
 */
export function currentBookValue(a: {
  purchasePrice?: unknown;
  currentValue?: unknown;
  purchaseDate?: Date | string | null;
  depreciationMonths?: number | null;
}): number {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const price = num(a.purchasePrice);
  const stored = num(a.currentValue);
  const months = a.depreciationMonths ?? null;
  if (price != null && !Number.isNaN(price) && a.purchaseDate && months && months > 0) {
    const start = typeof a.purchaseDate === "string" ? new Date(a.purchaseDate) : a.purchaseDate;
    const elapsed = monthsBetween(start, new Date());
    const remaining = Math.max(0, months - elapsed);
    return Math.round(price * (remaining / months) * 100) / 100;
  }
  if (stored != null && !Number.isNaN(stored)) return stored;
  if (price != null && !Number.isNaN(price)) return price;
  return 0;
}
