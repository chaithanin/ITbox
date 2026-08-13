const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  // success
  "type-created": { text: "สร้างประเภทเคสแล้ว / Case type created" },
  "type-updated": { text: "บันทึกประเภทเคสแล้ว / Case type saved" },
  "type-deleted": { text: "ลบประเภทเคสแล้ว / Case type deleted" },
  "category-created": { text: "สร้างหมวดหมู่แล้ว / Category created" },
  "category-updated": { text: "บันทึกหมวดหมู่แล้ว / Category saved" },
  "category-deleted": { text: "ลบหมวดหมู่แล้ว / Category deleted" },
  "sla-saved": { text: "บันทึก SLA แล้ว / SLA saved" },
  "hours-saved": { text: "บันทึกเวลาทำการแล้ว / Business hours saved" },
  "holiday-added": { text: "เพิ่มวันหยุดแล้ว / Holiday added" },
  "holiday-deleted": { text: "ลบวันหยุดแล้ว / Holiday removed" },
  "team-created": { text: "สร้างทีมแล้ว / Team created" },
  "team-updated": { text: "บันทึกทีมแล้ว / Team saved" },
  "team-deleted": { text: "ลบทีมแล้ว / Team deleted" },
  "member-added": { text: "เพิ่มสมาชิกแล้ว / Member added" },
  "member-removed": { text: "นำสมาชิกออกแล้ว / Member removed" },
  "policy-saved": { text: "บันทึกนโยบายการเปิดเคสแล้ว / Case policy saved" },
  "notifications-saved": { text: "บันทึกการแจ้งเตือนแล้ว / Notifications saved" },
  // errors
  "invalid-input": { text: "ข้อมูลไม่ถูกต้อง / Invalid input", error: true },
  "invalid-ref": { text: "หมวดหมู่แม่หรือทีมไม่ถูกต้อง / Invalid parent or team", error: true },
  "invalid-ref-": { text: "อ้างอิงไม่ถูกต้อง / Invalid reference", error: true },
  "key-exists": { text: "รหัส (key) นี้มีอยู่แล้ว / Key already exists", error: true },
  "system-type": { text: "ประเภทของระบบลบไม่ได้ / System type cannot be deleted", error: true },
  "not-found": { text: "ไม่พบรายการ / Not found", error: true },
  "invalid-hours": { text: "เวลาทำการไม่ถูกต้อง (เวลาสิ้นสุดต้องมากกว่าเริ่ม) / Invalid hours", error: true },
  "invalid-tz": { text: "Timezone offset ไม่ถูกต้อง / Invalid timezone", error: true },
  "invalid-holiday": { text: "ข้อมูลวันหยุดไม่ถูกต้อง / Invalid holiday", error: true },
  "holiday-exists": { text: "วันหยุดนี้มีอยู่แล้ว / Holiday already exists", error: true },
  "invalid-user": { text: "ผู้ใช้ไม่ถูกต้อง / Invalid user", error: true },
};

export function MessageBanner({ ok, error }: { ok?: string; error?: string }) {
  const key = ok ?? error ?? "";
  const msg = MESSAGES[key];
  if (!msg) return null;
  return (
    <p
      className={`mb-4 rounded-md px-3 py-2 text-sm ${
        msg.error
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      {msg.text}
    </p>
  );
}
