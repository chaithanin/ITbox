# คู่มือผู้ดูแลระบบ / Admin Manual

## ผู้ใช้งาน (Settings → Users) — ต้องมีสิทธิ์ `user:manage`
- สร้างบัญชี: อีเมล, ชื่อ, รหัสผ่านเริ่มต้น (≥12 ตัวอักษร), บทบาท
- แก้บทบาท (เลือกหลายบทบาทได้), ปิด/เปิดใช้งาน (ปิด = เพิกถอนทุก Session),
  รีเซ็ตรหัสผ่าน (เพิกถอนทุก Session อัตโนมัติ)
- บัญชีที่ล็อกจากการเดารหัสผ่านจะปลดเมื่อครบเวลา หรือกดเปิดใช้งานซ้ำ

## บทบาทและสิทธิ์ (Settings → Roles) — `role:manage`
บทบาทระบบ: SUPER_ADMIN, ADMIN, IT_MANAGER, IT_STAFF, SECURITY_ADMIN, HR,
FINANCE, MANAGER, EMPLOYEE, AUDITOR, VIEWER
คลิกบทบาท → ติ๊กสิทธิ์รายข้อ (รูปแบบ `resource:action`) → บันทึก
SUPER_ADMIN ถูกล็อกแก้ไขไม่ได้

## Vault governance
- `vault:manage` เห็นทุกรายการในองค์กร — จำกัดเฉพาะ IT_MANAGER/SECURITY_ADMIN
- ระดับ HIGH/CRITICAL บังคับ MFA; เปิด "ต้องได้รับอนุมัติ" สำหรับรายการวิกฤต
- ตรวจหน้า Vault → Security เป็นประจำ: รหัสเก่า >180 วัน, แชร์ไม่หมดอายุ,
  รายการไม่ถูกใช้งาน
- อนุมัติคำขอฉุกเฉินที่ Vault → Emergency (อนุมัติตัวเองไม่ได้)

## Offboarding — `offboarding:manage`
หน้าพนักงาน → "เริ่ม Offboarding" → คอนโซลแสดง 4 หมวด:
ทรัพย์สินค้างคืน / ไลเซนส์ / สิทธิ์ Vault / บัญชีผู้ใช้
กดเก็บคืน-เพิกถอนทีละหมวด แล้วจึงกด Complete (พนักงานเปลี่ยนสถานะเป็น RESIGNED)

## Audit & Security Center
- `/audit-logs`: กรองตาม action, ประเภท, ผู้ใช้, ช่วงเวลา — ห้ามมี
  รหัสผ่านปรากฏในบันทึก (ระบบกรองให้อัตโนมัติ)
- `/security`: ล็อกอินล้มเหลว, บัญชีถูกล็อก, ผู้ใช้ไม่มี MFA, Session
  ที่ใช้งาน, การเข้าถึง Vault สูงผิดปกติ

## งานประจำ
- Cloud Scheduler เรียก `POST /api/cron/checks` ทุกวัน → สร้างการแจ้งเตือน
  ประกัน/ไลเซนส์/บริการ/รอบเปลี่ยนรหัส + LINE broadcast (ถ้าตั้งค่า token)
- ตรวจ Backup/Restore drill ไตรมาสละครั้ง (docs/backup-restore.md)
