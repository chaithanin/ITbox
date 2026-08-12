# Disaster Recovery Plan

## Objectives
| Metric | Target |
|---|---|
| RPO (data loss) | ≤ 5 minutes (Cloud SQL PITR) |
| RTO (service restore) | ≤ 4 hours |

## Dependencies & failure domains
1. **Cloud Run (stateless)** — redeploy from Artifact Registry image to any
   region in minutes; no state on instances.
2. **Cloud SQL** — primary failure domain. PITR within region; for regional
   DR enable a cross-region read replica and promote on failover.
3. **Cloud KMS** — hard dependency for vault decryption. Keys are regional:
   losing the key = losing vault plaintext (by design, this is the security
   property). Mitigations: 30-day scheduled-destroy duration, IAM deny on
   key destruction, optional EKM/HSM tier.
4. **Cloud Storage** — dual-region buckets if document RPO matters.
5. **Secret Manager** — secrets are replicated automatically.

## Runbook: region outage
1. Declare incident; freeze deploys.
2. Promote cross-region SQL replica (or restore latest backup in DR region).
3. Create KMS key ring in DR region **is not possible for existing ciphertext**
   — KMS is multi-zonal within region and highly available; for cross-region
   key durability use `--location=asia` (multi-region) key ring at setup time
   if this risk is unacceptable.
4. Deploy Cloud Run in DR region from the same image; point DATABASE_URL to
   promoted instance; update DNS / load balancer backend.
5. Validate: login, vault reveal of a demo secret, dashboard, audit write.
6. Post-incident: re-establish replicas and backups in the new topology.

## Application recovery (bad deploy / data bug)
- Roll back: `gcloud run services update-traffic itbox --to-revisions=PREV=100`
- Data: PITR clone → verify → switch `DATABASE_URL` secret + redeploy.
