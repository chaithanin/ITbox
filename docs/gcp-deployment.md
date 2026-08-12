# GCP Deployment Guide

Region used below: `asia-southeast1`. Replace `PROJECT_ID` throughout.

## 1. Project & APIs
```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  storage.googleapis.com cloudkms.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com
```

## 2. Cloud SQL (PostgreSQL)
```bash
gcloud sql instances create itbox-pg --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 --region=asia-southeast1 \
  --backup-start-time=19:00 --enable-point-in-time-recovery
gcloud sql databases create itbox --instance=itbox-pg
gcloud sql users create itbox --instance=itbox-pg --password="$(openssl rand -base64 24)"
```
Connection string for Cloud Run:
`postgresql://itbox:PASSWORD@localhost/itbox?host=/cloudsql/PROJECT_ID:asia-southeast1:itbox-pg`

## 3. Cloud Storage
```bash
for b in assets documents reports; do
  gcloud storage buckets create gs://PROJECT_ID-itbox-$b \
    --location=asia-southeast1 --uniform-bucket-level-access
done
gcloud storage buckets update gs://PROJECT_ID-itbox-documents --versioning
```

## 4. Cloud KMS (vault envelope encryption)
```bash
gcloud kms keyrings create itbox-vault --location=asia-southeast1
gcloud kms keys create vault-dek-wrapper --location=asia-southeast1 \
  --keyring=itbox-vault --purpose=encryption \
  --rotation-period=90d --next-rotation-time=+p90d
```

## 5. Secret Manager
```bash
printf '%s' "postgresql://itbox:...?host=/cloudsql/..." | gcloud secrets create itbox-database-url --data-file=-
openssl rand -base64 32 | gcloud secrets create itbox-auth-secret --data-file=-
printf '%s' "GOOGLE_CLIENT_ID_VALUE"     | gcloud secrets create itbox-google-client-id --data-file=-
printf '%s' "GOOGLE_CLIENT_SECRET_VALUE" | gcloud secrets create itbox-google-client-secret --data-file=-
```

## 6. Artifact Registry + service account
```bash
gcloud artifacts repositories create itbox --repository-format=docker \
  --location=asia-southeast1
gcloud iam service-accounts create itbox-run
SA=itbox-run@PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:$SA --role=roles/cloudsql.client
gcloud kms keys add-iam-policy-binding vault-dek-wrapper --location=asia-southeast1 \
  --keyring=itbox-vault --member=serviceAccount:$SA \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:$SA --role=roles/storage.objectAdmin
```

## 7. Build & deploy (Cloud Build)
```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_CLOUDSQL_INSTANCE=PROJECT_ID:asia-southeast1:itbox-pg
```
The pipeline builds the image, pushes to Artifact Registry, runs
`prisma migrate deploy`, then deploys Cloud Run with secrets from Secret
Manager and `KMS_PROVIDER=gcp`. Add `--service-account=$SA` to the deploy step
or set it as the service's runtime SA.

First deploy only — seed demo data (optional):
```bash
gcloud run jobs create itbox-seed --image=IMAGE --command=npx --args=prisma,db,seed \
  --set-secrets=DATABASE_URL=itbox-database-url:latest \
  --set-env-vars=SEED_ADMIN_PASSWORD=...,SEED_USER_PASSWORD=...,LOCAL_KMS_MASTER_KEY=unused,KMS_PROVIDER=gcp
```
(For GCP-encrypted seed vault records, run the seed from an environment with
KMS access, or create vault records through the UI.)

## 8. Domain + SSL
```bash
gcloud beta run domain-mappings create --service itbox --domain itbox.example.com
# or put an external HTTPS Load Balancer (managed cert + Cloud Armor) in front
```
Set `AUTH_URL=https://itbox.example.com` on the service.

## 9. Scheduler (daily checks)
```bash
gcloud secrets create itbox-cron-secret --data-file=<(openssl rand -base64 24)
gcloud scheduler jobs create http itbox-daily-checks \
  --schedule="0 1 * * *" --uri=https://itbox.example.com/api/cron/checks \
  --http-method=POST --headers=Authorization="Bearer CRON_SECRET_VALUE" \
  --location=asia-southeast1
```

## 10. Monitoring & logging
Cloud Run logs flow to Cloud Logging automatically. Create alerts on:
5xx rate, p95 latency, Cloud SQL CPU/storage, KMS decrypt error count,
and a logs-based metric on `audit log write failed`.
