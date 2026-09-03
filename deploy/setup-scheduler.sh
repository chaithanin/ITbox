#!/usr/bin/env bash
#
# Create (or update) the three Cloud Scheduler jobs that drive ITBox's
# background work. Idempotent: safe to re-run — existing jobs are updated in
# place, missing ones are created.
#
#   itbox-checks      daily   07:00  ->  /api/cron/checks     (borrow/warranty/
#                                        license/rotation reminders)
#   itbox-sla         */10m          ->  /api/cron/sla        (support SLA warn/
#                                        breach/escalation sweep)
#   itbox-cctv-daily  daily   08:00  ->  /api/cron/cctv-daily (CCTV health digest)
#
# The cron endpoints authenticate with the app's shared secret, read from
# Secret Manager here so it is never typed or echoed:
#     Authorization: Bearer <CRON_SECRET>
#
# IMPORTANT: because that secret travels in the Authorization header, these
# jobs must NOT use OIDC (an OIDC token would overwrite that header). The
# Cloud Run service therefore has to allow unauthenticated invocation — which
# it already does, being a browser-facing login app. The script warns if not.
#
# Run it in Google Cloud Shell (already authenticated) or anywhere you have an
# authenticated gcloud with access to project itbox-505402.
#
# Usage:
#     ./deploy/setup-scheduler.sh
#     PROJECT=... REGION=... SERVICE=... TZ_NAME=... ./deploy/setup-scheduler.sh
#
set -euo pipefail

PROJECT="${PROJECT:-itbox-505402}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-itbox}"
TZ_NAME="${TZ_NAME:-Asia/Bangkok}"
SECRET_NAME="${SECRET_NAME:-CRON_SECRET}"

echo "Project=$PROJECT Region=$REGION Service=$SERVICE TZ=$TZ_NAME"
gcloud config set project "$PROJECT" >/dev/null

echo "Enabling Cloud Scheduler API (idempotent)…"
gcloud services enable cloudscheduler.googleapis.com >/dev/null

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
[[ -n "$URL" ]] || { echo "ERROR: cannot resolve Cloud Run URL for '$SERVICE'"; exit 1; }
echo "Service URL: $URL"

# Read the shared secret from Secret Manager (never printed).
CRON_SECRET="$(gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null || true)"
[[ -n "$CRON_SECRET" ]] || {
  echo "ERROR: secret '$SECRET_NAME' is missing or empty in Secret Manager."
  echo "       Create it first, e.g.:"
  echo "         printf '%s' \"\$(openssl rand -base64 32)\" | gcloud secrets create $SECRET_NAME --data-file=-"
  echo "       and make sure the Cloud Run service has it wired as the CRON_SECRET env var."
  exit 1
}

# The service must be publicly invocable for a header-only secret to reach the app.
if ! gcloud run services get-iam-policy "$SERVICE" --region "$REGION" \
      --format='value(bindings.members)' 2>/dev/null | grep -q allUsers; then
  echo "WARNING: '$SERVICE' does not appear to allow unauthenticated (allUsers) invocation."
  echo "         These cron jobs rely on the app's CRON_SECRET check in the Authorization"
  echo "         header and cannot also carry an OIDC token. Either keep the service public"
  echo "         or move the secret to a custom header in the app."
fi

upsert_job() {
  local name="$1" schedule="$2" path="$3"
  local common=(
    --location="$REGION"
    --schedule="$schedule"
    --time-zone="$TZ_NAME"
    --uri="${URL}${path}"
    --http-method=POST
    --attempt-deadline=320s
  )
  if gcloud scheduler jobs describe "$name" --location="$REGION" >/dev/null 2>&1; then
    echo "Updating $name ($schedule -> $path)"
    gcloud scheduler jobs update http "$name" "${common[@]}" \
      --update-headers="Authorization=Bearer ${CRON_SECRET}" >/dev/null
  else
    echo "Creating $name ($schedule -> $path)"
    gcloud scheduler jobs create http "$name" "${common[@]}" \
      --headers="Authorization=Bearer ${CRON_SECRET}" >/dev/null
  fi
}

upsert_job itbox-checks     "0 7 * * *"    "/api/cron/checks"
upsert_job itbox-sla        "*/10 * * * *" "/api/cron/sla"
upsert_job itbox-cctv-daily "0 8 * * *"    "/api/cron/cctv-daily"

echo
echo "Done. Jobs:"
gcloud scheduler jobs list --location="$REGION" \
  --filter="name~itbox-" --format="table(name.basename(), schedule, state)"

echo
echo "Smoke-test one now and check the log for HTTP 200:"
echo "  gcloud scheduler jobs run itbox-checks --location $REGION"
echo "  gcloud logging read 'httpRequest.requestUrl:\"/api/cron/\"' --limit=10 --freshness=10m \\"
echo "    --format='value(httpRequest.status, httpRequest.requestUrl)'"
