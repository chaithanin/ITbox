# Go-Live Checklist — ITBox

รายการตรวจก่อนเปิดใช้งานจริง (production). ติ๊ก `[x]` เมื่อทำเสร็จ.
คำสั่ง `gcloud` ทุกขั้นใช้ค่าจริงของระบบนี้ (แก้เฉพาะที่วงเล็บ `<...>`).

> **สภาพแวดล้อมจริง**
>
> | รายการ | ค่า |
> |---|---|
> | Live URL | https://itbox-ppjbzqdu3q-as.a.run.app |
> | GCP project | `itbox-505402` |
> | Region | `asia-southeast1` |
> | Cloud Run service | `itbox` |
> | Migrate job | `itbox-migrate` |
> | Database | Cloud SQL for PostgreSQL 16 |

ตั้งตัวแปรไว้ใช้ซ้ำในทุกคำสั่ง:

```bash
export PROJECT=itbox-505402
export REGION=asia-southeast1
export SERVICE=itbox
gcloud config set project "$PROJECT"
```

---

## 0. ยืนยันว่าเวอร์ชันล่าสุดกำลังให้บริการ

- [ ] GitHub Actions → `Deploy to Cloud Run` รันล่าสุด **เขียว**
- [ ] Revision ล่าสุด serve 100%

```bash
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format="value(status.url, status.latestReadyRevisionName, status.traffic)"
```

---

## 1. ผู้ใช้และการเข้าถึง (P0)

- [ ] มี **SUPER_ADMIN ตัวจริง** อย่างน้อย 1 บัญชี (อีเมลองค์กร ไม่ใช่ `*@example.com`)
- [ ] **ลบ/ปิด demo users** ถ้าเคย seed ลง prod: `admin@example.com`, `itmanager@`, `itstaff@`, `security@`, `hr@`, `employee@example.com`
- [ ] **บังคับ MFA** ให้ทุกคนที่ถือสิทธิ์สูง (`vault:reveal`, `vault:emergency`, `user:manage`, `role:manage`)
- [ ] ทบทวนการมอบ role ให้ตรงตำแหน่งจริง (โดยเฉพาะผู้อนุมัติยืม-คืน = IT_MANAGER / MANAGER เท่านั้น)

> หมายเหตุ: `prisma/seed.ts` **ไม่รัน**ตอน deploy (deploy รันแค่ `migrate deploy`) — demo users จะอยู่ใน prod ก็ต่อเมื่อเคยสั่ง seed เองเท่านั้น. ตรวจใน **Settings → Users** ว่ามีบัญชี `@example.com` หลงเหลือหรือไม่.

---

## 2. Cloud Scheduler — cron jobs (P0) ⚠️ สำคัญที่สุด

ถ้าไม่ตั้ง cron: **SLA / การแจ้งเตือน / เตือนยืมเกินกำหนด / สรุป CCTV รายวัน จะไม่ทำงานเลย**.

ทั้ง 3 job ยิง `POST` ไปที่ Cloud Run พร้อม `Authorization: Bearer $CRON_SECRET`
(ค่าเดียวกับที่อยู่ใน Secret Manager / env ของ service).

- [ ] `CRON_SECRET` ถูกตั้งใน service แล้ว (ดูข้อ 5)
- [ ] สร้าง service account ให้ Scheduler เรียก Cloud Run แบบ authenticated
- [ ] `itbox-checks` — รายวัน (เตือนยืมเกินกำหนด/ประกัน/ไลเซนส์/รอบเปลี่ยนรหัส)
- [ ] `itbox-sla` — ทุก 10 นาที (เตือน/ยกระดับ SLA ของ Support)
- [ ] `itbox-cctv-daily` — รายวัน (สรุปสุขภาพ CCTV)

```bash
export URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
export CRON_SECRET='<ค่าเดียวกับใน Secret Manager>'

# (ครั้งเดียว) SA สำหรับให้ Scheduler เรียก Cloud Run
gcloud iam service-accounts create itbox-scheduler \
  --display-name="ITBox Cloud Scheduler" || true
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:itbox-scheduler@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# รายวัน 07:00 เวลาไทย — ตรวจเตือนต่าง ๆ
gcloud scheduler jobs create http itbox-checks \
  --location="$REGION" --schedule="0 7 * * *" --time-zone="Asia/Bangkok" \
  --uri="${URL}/api/cron/checks" --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --oidc-service-account-email="itbox-scheduler@${PROJECT}.iam.gserviceaccount.com" \
  --oidc-token-audience="${URL}"

# ทุก 10 นาที — SLA ของ Support
gcloud scheduler jobs create http itbox-sla \
  --location="$REGION" --schedule="*/10 * * * *" --time-zone="Asia/Bangkok" \
  --uri="${URL}/api/cron/sla" --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --oidc-service-account-email="itbox-scheduler@${PROJECT}.iam.gserviceaccount.com" \
  --oidc-token-audience="${URL}"

# รายวัน 08:00 เวลาไทย — สรุป CCTV
gcloud scheduler jobs create http itbox-cctv-daily \
  --location="$REGION" --schedule="0 8 * * *" --time-zone="Asia/Bangkok" \
  --uri="${URL}/api/cron/cctv-daily" --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --oidc-service-account-email="itbox-scheduler@${PROJECT}.iam.gserviceaccount.com" \
  --oidc-token-audience="${URL}"
```

- [ ] ทดสอบยิงทันทีแล้วดู log ว่าได้ HTTP 200

```bash
gcloud scheduler jobs run itbox-checks --location "$REGION"
gcloud logging read \
  'resource.type=cloud_run_revision AND httpRequest.requestUrl:"/api/cron/"' \
  --limit=20 --freshness=10m --format='value(httpRequest.status, httpRequest.requestUrl)'
```

> **ปลอดภัยกว่า:** หากบางองค์กรใช้ token bearer ใน header แล้วมี proxy ตัด header ออก
> สามารถพึ่ง OIDC (`--oidc-*`) เป็นชั้นยืนยันตัวหลักได้ — โค้ดยอมรับ Bearer `CRON_SECRET`;
> เก็บทั้งสองไว้เพื่อความชัวร์.

---

## 3. ฐานข้อมูล & สำรองข้อมูล (P0)

- [ ] เปิด **automated backups** + **point-in-time recovery (PITR)** ของ Cloud SQL
- [ ] **ทดสอบ restore จริง 1 ครั้ง** (clone instance จาก PITR) — ดู `docs/backup-restore.md`
- [ ] ตรวจว่า migration ล่าสุดถูก apply แล้ว

```bash
# หา instance id
gcloud sql instances list

# เปิด backup รายวัน + PITR (WAL)
gcloud sql instances patch <INSTANCE_ID> \
  --backup-start-time=18:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=30 \
  --retained-transaction-log-days=7

# ยืนยันสถานะ migration ที่รันไปแล้ว (ผ่าน migrate job)
gcloud run jobs execute itbox-migrate --region "$REGION" --wait
```

---

## 4. โดเมน & SSL (P0)

- [ ] Map โดเมนจริง (เช่น `itbox.<company>.com`) เข้ากับ Cloud Run
- [ ] ตั้ง `AUTH_URL` / `NEXTAUTH_URL` = โดเมนจริง (https) และ `AUTH_TRUST_HOST=true`
- [ ] อัปเดต **OAuth redirect URI** ของ Google / Entra ให้เป็น `https://<โดเมน>/api/auth/callback/<provider>`

```bash
gcloud beta run domain-mappings create \
  --service="$SERVICE" --domain="itbox.<company>.com" --region="$REGION"
```

---

## 5. Secrets & config (P0)

- [ ] ทุก secret อยู่ใน **Secret Manager** (ไม่มีใน image/repo): `AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL`, ค่า KMS, ค่า SMTP
- [ ] `KMS_PROVIDER=gcp` (prod จะไม่ยอมสตาร์ทถ้าเป็น `local`) + KMS key ring/key ถูกต้อง
- [ ] **SMTP** ตั้งครบเพื่อให้ notification + reset password ส่งอีเมลได้จริง
- [ ] ตั้ง **ingest API keys** ใน Settings ให้ครบ (`hr.ingest`, `itreport.ingest`, CCTV) — และใช้คนละ key ต่อ pipeline

```bash
# ตัวอย่าง: ตั้ง/อัปเดต secret แล้วผูกเข้ากับ service
printf '%s' '<new-cron-secret>' | gcloud secrets versions add CRON_SECRET --data-file=-
gcloud run services update "$SERVICE" --region "$REGION" \
  --update-secrets=CRON_SECRET=CRON_SECRET:latest

# ดู env/secret ปัจจุบันที่ผูกกับ service
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format="yaml(spec.template.spec.containers[0].env)"
```

- [ ] **หมุน (rotate) กุญแจที่เคยส่งเป็น plaintext** — โดยเฉพาะ CCTV collector keys / ingest keys รุ่นแรก

---

## 6. ความปลอดภัยระดับแอป (P1)

- [ ] **CSP บังคับใช้จริงแล้ว** (ค่าเริ่มต้น enforce). ถ้ามีอะไรพังเพราะ CSP ให้ตั้ง env
      `CSP_REPORT_ONLY=true` เพื่อกลับเป็น report-only ชั่วคราว **โดยไม่ต้อง redeploy**:

  ```bash
  gcloud run services update "$SERVICE" --region "$REGION" \
    --update-env-vars=CSP_REPORT_ONLY=true    # ปลด: --remove-env-vars=CSP_REPORT_ONLY
  ```

  ตรวจ header ว่า enforce จริง (ควรเห็น `content-security-policy:` ไม่ใช่ `-report-only`):

  ```bash
  curl -sI "$URL" | grep -i content-security-policy
  ```

- [ ] ทบทวน `REPORT_FRAME_ANCESTORS` ให้ล็อกเฉพาะเว็บบริษัท ถ้าใช้หน้า public intake (`/report/<org>`)
- [ ] ยืนยันว่า login / vault reveal / ingest มี rate limiting ทำงาน (มีในโค้ดแล้ว)

---

## 7. ความน่าเชื่อถือ & การเฝ้าระวัง (P1)

- [ ] ตั้ง `min-instances >= 1` กัน cold start (Cloud Run)
- [ ] Uptime check + alert (เช่น เมื่อ error rate / 5xx สูง)

```bash
gcloud run services update "$SERVICE" --region "$REGION" --min-instances=1

# ดู error ล่าสุดของ service
gcloud logging read \
  'resource.type=cloud_run_revision AND severity>=ERROR' \
  --limit=20 --freshness=1h --format='value(timestamp, textPayload)'
```

---

## 8. UAT — ทดสอบ flow จริงแยกตามบทบาท (P1)

- [ ] **พนักงาน**: เปิดเคส IT (ไม่มีช่อง impact/urgency แล้ว) → เห็นในเคสของฉัน
- [ ] **IT staff**: รับเคส, ตั้ง priority, ทำงาน, resolve/close
- [ ] **IT Manager / Manager**: อนุมัติคำขอยืม-คืน (IT staff อนุมัติไม่ได้แล้ว — ต้องเป็นเมนู "รออนุมัติ" ที่ไม่ขึ้นสำหรับ IT staff)
- [ ] **ยืม-คืน** ครบวงจร: ขอยืม → อนุมัติ → จ่าย → รับคืน → พิมพ์ฟอร์ม A4 (2 หน้า)
- [ ] **HR sync** พนักงานทำงานถูกต้อง
- [ ] **Vault reveal** ต้องผ่าน MFA สำหรับรายการ HIGH/CRITICAL

---

## 9. หลัง go-live

- [ ] เฝ้าดู log 24–48 ชม.แรก (error rate, CSP violation ถ้ามี, cron 200)
- [ ] ยืนยัน backup รายวันเกิดขึ้นจริง
- [ ] เก็บ runbook: `docs/backup-restore.md`, `docs/disaster-recovery.md`, `DEPLOYMENT.md`

---

### สรุปลำดับความสำคัญ

| ระดับ | ต้องทำ |
|---|---|
| **P0 (ก่อนเปิด)** | ผู้ใช้จริง/ปิด demo/MFA · Cloud Scheduler · backup+PITR · โดเมน+SSL · secrets/SMTP/rotate keys |
| **P1 (สัปดาห์แรก)** | CSP (ทำแล้ว) · min-instances+alert · UAT ครบบทบาท |
| **P2 (ตามสะดวก)** | CSP แบบ nonce/strict-dynamic · health endpoint · รวม rate limiting (Redis) |
