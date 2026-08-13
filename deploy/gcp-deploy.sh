#!/usr/bin/env bash
# ==========================================================================
# ITBox — one-shot GCP deployment (run inside Google Cloud Shell)
#
# Usage:
#   git clone -b claude/enterprise-it-management-system-pz0u9s \
#       https://github.com/chaithanin/ITbox.git && cd ITbox
#   bash deploy/gcp-deploy.sh
#
# Idempotent: safe to re-run; existing resources are kept.
# Creates: Cloud SQL (PostgreSQL 16) + Cloud Storage + Cloud KMS +
#          Secret Manager + Artifact Registry + Cloud Run (service & jobs) +
#          Cloud Scheduler. Then runs DB migration + optional demo seed.
#
# NOTE Cloud SQL instance creation takes ~10 minutes on first run.
# Estimated monthly cost with defaults: Cloud SQL db-custom-1-3840 ≈ $50,
# Cloud Run min-instances=0 ≈ pay-per-use. Set SQL_TIER=db-f1-micro for a
# cheap demo (not for production workloads).
# ==========================================================================
set -euo pipefail

# ----------------------------- configuration ------------------------------
PROJECT_ID="${PROJECT_ID:-itbox-505402}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-itbox}"
REPO="${REPO:-itbox}"
SQL_INSTANCE="${SQL_INSTANCE:-itbox-pg}"
SQL_TIER="${SQL_TIER:-db-custom-1-3840}"
DB_NAME="itbox"
DB_USER="itbox"
KMS_RING="itbox-vault"
KMS_KEY="vault-dek-wrapper"
SA_NAME="itbox-run"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET_DOCS="${PROJECT_ID}-itbox-documents"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-yes}"   # yes|no

say() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

# ------------------------------- APIs -------------------------------------
say "Enabling required APIs (idempotent)"
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  storage.googleapis.com cloudkms.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com compute.googleapis.com

# --------------------------- Artifact Registry ----------------------------
say "Artifact Registry repository"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"

# ------------------------------ Cloud SQL ---------------------------------
say "Cloud SQL PostgreSQL instance (first run takes ~10 minutes)"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 --edition=enterprise \
    --tier="$SQL_TIER" --region="$REGION" \
    --backup-start-time=19:00 --enable-point-in-time-recovery \
    --storage-auto-increase
fi
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 ||
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

# DB password lives only in Secret Manager
if ! gcloud secrets describe itbox-database-url >/dev/null 2>&1; then
  # openssl-based generation: SIGPIPE-safe under `set -o pipefail`
  DB_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-28)"
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null ||
    gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
  CONN_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
  printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' \
    "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$CONN_NAME" |
    gcloud secrets create itbox-database-url --data-file=-
  unset DB_PASSWORD
fi
CONN_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

# ---------------------------- Cloud Storage -------------------------------
say "Cloud Storage bucket for documents"
gcloud storage buckets describe "gs://$BUCKET_DOCS" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://$BUCKET_DOCS" \
    --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://$BUCKET_DOCS" --versioning >/dev/null

# ------------------------------ Cloud KMS ---------------------------------
say "Cloud KMS key ring + crypto key (vault envelope encryption)"
gcloud kms keyrings describe "$KMS_RING" --location="$REGION" >/dev/null 2>&1 ||
  gcloud kms keyrings create "$KMS_RING" --location="$REGION"
gcloud kms keys describe "$KMS_KEY" --location="$REGION" --keyring="$KMS_RING" >/dev/null 2>&1 ||
  gcloud kms keys create "$KMS_KEY" --location="$REGION" --keyring="$KMS_RING" \
    --purpose=encryption --rotation-period=90d --next-rotation-time="+p90d" \
    --destroy-scheduled-duration=30d

# --------------------------- Service account ------------------------------
say "Runtime service account + IAM"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --display-name="ITBox Cloud Run"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role=roles/cloudsql.client --condition=None >/dev/null
gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --location="$REGION" --keyring="$KMS_RING" \
  --member="serviceAccount:$SA" \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_DOCS" \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null

# ------------------------------- Secrets ----------------------------------
say "Application secrets"
gcloud secrets describe itbox-auth-secret >/dev/null 2>&1 ||
  openssl rand -base64 32 | tr -d '\n' | gcloud secrets create itbox-auth-secret --data-file=-
gcloud secrets describe itbox-cron-secret >/dev/null 2>&1 ||
  openssl rand -base64 24 | tr -d '\n' | gcloud secrets create itbox-cron-secret --data-file=-

# ------------------------------ Build image -------------------------------
say "Granting Cloud Build permissions to the default compute service account"
# New GCP projects no longer grant the compute default SA (used by Cloud
# Build) access to the build bucket / Artifact Registry — grant explicitly.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" --role=roles/cloudbuild.builds.builder --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" --role=roles/artifactregistry.writer --condition=None >/dev/null
echo "Waiting 30s for IAM propagation..."
sleep 30

say "Building container image with Cloud Build (a few minutes)"
gcloud builds submit --tag "$IMAGE" .

RUN_FLAGS=(
  --image="$IMAGE"
  --region="$REGION"
  --service-account="$SA"
  --add-cloudsql-instances="$CONN_NAME"
  --set-secrets="DATABASE_URL=itbox-database-url:latest,AUTH_SECRET=itbox-auth-secret:latest,CRON_SECRET=itbox-cron-secret:latest"
  --set-env-vars="KMS_PROVIDER=gcp,GCP_PROJECT_ID=$PROJECT_ID,KMS_LOCATION=$REGION,KMS_KEY_RING=$KMS_RING,KMS_CRYPTO_KEY=$KMS_KEY,STORAGE_PROVIDER=gcs,GCS_BUCKET_DOCUMENTS=$BUCKET_DOCS,AUTH_TRUST_HOST=true"
)

# ------------------------------ Migration ---------------------------------
say "Running database migration (Cloud Run job)"
gcloud run jobs deploy itbox-migrate "${RUN_FLAGS[@]}" \
  --command=npx --args=prisma,migrate,deploy --max-retries=1 --quiet
gcloud run jobs execute itbox-migrate --region="$REGION" --wait

# ------------------------------- Service ----------------------------------
say "Deploying Cloud Run service"
gcloud run deploy "$SERVICE" "${RUN_FLAGS[@]}" \
  --platform=managed --allow-unauthenticated \
  --memory=1Gi --cpu=1 --min-instances=0 --max-instances=5 --quiet

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
say "Setting AUTH_URL=$URL and finalizing"
gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars="AUTH_URL=$URL" --quiet

# ------------------------------ Demo seed ---------------------------------
if [ "$SEED_DEMO_DATA" = "yes" ]; then
  say "Seeding demo data (Cloud Run job)"
  SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-10)!Aa1}"
  SEED_USER_PASSWORD="${SEED_USER_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-10)!Aa1}"
  gcloud run jobs deploy itbox-seed "${RUN_FLAGS[@]}" \
    --command=node --args=--experimental-strip-types,prisma/seed.ts \
    --update-env-vars="SEED_ADMIN_PASSWORD=$SEED_ADMIN_PASSWORD,SEED_USER_PASSWORD=$SEED_USER_PASSWORD" \
    --max-retries=0 --quiet
  gcloud run jobs execute itbox-seed --region="$REGION" --wait
fi

# ------------------------------ Scheduler ---------------------------------
say "Daily notification checks via Cloud Scheduler"
CRON_SECRET_VALUE="$(gcloud secrets versions access latest --secret=itbox-cron-secret)"
if gcloud scheduler jobs describe itbox-daily-checks --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http itbox-daily-checks --location="$REGION" \
    --schedule="0 1 * * *" --uri="$URL/api/cron/checks" --http-method=POST \
    --update-headers="Authorization=Bearer $CRON_SECRET_VALUE" >/dev/null
else
  gcloud scheduler jobs create http itbox-daily-checks --location="$REGION" \
    --schedule="0 1 * * *" --uri="$URL/api/cron/checks" --http-method=POST \
    --headers="Authorization=Bearer $CRON_SECRET_VALUE" >/dev/null
fi

# ------------------------------- Summary ----------------------------------
printf "\n\033[1;32m════════════════════════════════════════════════════════════\033[0m\n"
printf "\033[1;32m✅ ITBox deployed successfully\033[0m\n\n"
printf "URL:            %s\n" "$URL"
printf "Login (admin):  admin@example.com\n"
if [ "${SEED_DEMO_DATA}" = "yes" ]; then
  printf "Admin password: %s\n" "$SEED_ADMIN_PASSWORD"
  printf "Other users:    itmanager/itstaff/security/hr/employee@example.com\n"
  printf "Their password: %s\n" "$SEED_USER_PASSWORD"
  printf "\n⚠ เปลี่ยนรหัสผ่านทันทีหลัง login แรก (Settings → Profile)\n"
fi
printf "\nOptional next steps:\n"
printf "  • Google OAuth: create OAuth client (redirect %s/api/auth/callback/google),\n" "$URL"
printf "    then: gcloud secrets create itbox-google-client-id / itbox-google-client-secret\n"
printf "    and:  gcloud run services update %s --region=%s \\\\\n" "$SERVICE" "$REGION"
printf "          --set-secrets=GOOGLE_CLIENT_ID=itbox-google-client-id:latest,GOOGLE_CLIENT_SECRET=itbox-google-client-secret:latest\n"
printf "  • Custom domain: gcloud beta run domain-mappings create --service %s --domain your.domain\n" "$SERVICE"
printf "\033[1;32m════════════════════════════════════════════════════════════\033[0m\n"
