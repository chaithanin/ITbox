# Backup & Restore

## Cloud SQL
- Automated daily backups + **point-in-time recovery** (enabled in setup).
- Manual backup: `gcloud sql backups create --instance=itbox-pg`
- Restore to a point in time:
  `gcloud sql instances clone itbox-pg itbox-pg-restore --point-in-time=2026-08-12T03:00:00Z`
- Vault rows are backed up **encrypted** (ciphertext + wrapped DEKs). Backups
  never contain decrypted secrets. Restoring requires the same KMS key —
  protect the key ring against deletion (KMS keys have mandatory 24h+
  scheduled-destroy delay; use `--destroy-scheduled-duration=30d`).

## Cloud Storage
- `documents` bucket has object versioning; add lifecycle rules, e.g.:
  delete noncurrent versions after 90 days, move `reports` to Nearline after 30.

## Configuration
- Secret Manager keeps prior secret versions; do not destroy old versions
  until a deploy referencing new ones is verified.
- Infrastructure is reproducible from `docs/gcp-deployment.md` + `cloudbuild.yaml`.

## Restore drill (quarterly)
1. Clone instance from PITR → point a staging Cloud Run revision at it.
2. Log in, reveal a known demo secret (validates KMS + data integrity).
3. Verify audit logs and asset counts.
4. Document time-to-restore; target RTO in docs/disaster-recovery.md.
