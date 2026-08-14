#!/usr/bin/env bash
# ==========================================================================
# ITBox — one-time GitHub Actions ↔ GCP setup (Workload Identity Federation)
#
# Run ONCE in Google Cloud Shell. Creates a keyless trust between the GitHub
# repository and a dedicated deployer service account, so the
# .github/workflows/deploy.yml pipeline can build + deploy to Cloud Run with
# NO long-lived JSON key stored in GitHub.
#
#   bash deploy/setup-github-oidc.sh
#
# At the end it prints two values — add them as GitHub repository secrets
# (Settings → Secrets and variables → Actions → New repository secret):
#     GCP_WIF_PROVIDER
#     GCP_DEPLOY_SA
#
# Idempotent: safe to re-run.
# ==========================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-itbox-505402}"
# GitHub repo in exact OWNER/REPO case as it appears on github.com.
REPO_FULL="${REPO_FULL:-chaithanin/ITbox}"

POOL="${POOL:-github-pool}"
PROVIDER="${PROVIDER:-github-provider}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-itbox-deployer}"
RUN_SA_NAME="${RUN_SA_NAME:-itbox-run}" # runtime SA created by gcp-deploy.sh

DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

say() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

say "Enabling IAM Credentials + STS APIs (idempotent)"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com

# ---------------------- Workload Identity pool/provider -------------------
say "Workload Identity pool"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global \
    --display-name="GitHub Actions"

say "Workload Identity provider (GitHub OIDC)"
# Restrict token issuance to this repository's owner; the SA binding below
# further narrows it to the exact repo.
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository_owner=='${REPO_FULL%%/*}'"
fi

POOL_FULL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
WIF_PROVIDER="${POOL_FULL}/providers/${PROVIDER}"

# --------------------------- Deployer service account ---------------------
say "Deployer service account + IAM"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
    --display-name="ITBox GitHub deployer"

# Permissions the pipeline needs: submit Cloud Build, push images, deploy the
# Cloud Run service + jobs.
for ROLE in \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$ROLE" --condition=None >/dev/null
done

# Deploying a service/job that RUNS AS itbox-run requires actAs on that SA.
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$DEPLOY_SA" \
  --role=roles/iam.serviceAccountUser >/dev/null 2>&1 ||
  echo "  (note: runtime SA $RUN_SA not found yet — run deploy/gcp-deploy.sh first, then re-run this)"

# `gcloud builds submit` runs the build AS the Cloud Build runtime SA (the
# compute default SA on current projects, or the legacy cloudbuild SA), so the
# deployer also needs actAs on whichever exists.
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
for BUILD_SA in "$COMPUTE_SA" "$CLOUDBUILD_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
    --member="serviceAccount:$DEPLOY_SA" \
    --role=roles/iam.serviceAccountUser >/dev/null 2>&1 ||
    echo "  (note: build SA $BUILD_SA not present — skipped)"
done

# ------------- Let the GitHub repo impersonate the deployer SA -------------
say "Binding repository ${REPO_FULL} → ${DEPLOY_SA}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_FULL}/attribute.repository/${REPO_FULL}" >/dev/null

# -------------------------------- Output ----------------------------------
printf "\n\033[1;32m════════════════════════════════════════════════════════════\033[0m\n"
printf "\033[1;32m✅ Workload Identity Federation configured\033[0m\n\n"
printf "Add these as GitHub repository secrets\n"
printf "(Settings → Secrets and variables → Actions → New repository secret):\n\n"
printf "  \033[1mGCP_WIF_PROVIDER\033[0m\n    %s\n\n" "$WIF_PROVIDER"
printf "  \033[1mGCP_DEPLOY_SA\033[0m\n    %s\n\n" "$DEPLOY_SA"
printf "Repo bound: %s  (must match github.com case EXACTLY)\n" "$REPO_FULL"
printf "If your repo path differs, re-run: REPO_FULL=owner/Repo bash deploy/setup-github-oidc.sh\n"
printf "\033[1;32m════════════════════════════════════════════════════════════\033[0m\n"
