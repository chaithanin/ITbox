# Auto-deploy to Cloud Run with GitHub Actions

CI/CD for ITBox: every push to the tracked branch builds a fresh image, applies
pending DB migrations, and rolls the Cloud Run service forward — keyless, via
**Workload Identity Federation** (no service-account JSON key stored in GitHub).

## Prerequisites

The GCP infrastructure must already exist (Cloud SQL, KMS, Secret Manager, the
`itbox-run` runtime service account, bucket, Artifact Registry). If this is a
brand-new project, provision it once first:

```bash
bash deploy/gcp-deploy.sh
```

## One-time setup (run in Cloud Shell)

```bash
bash deploy/setup-github-oidc.sh
```

It prints two values. Add them as **GitHub repository secrets**
(Settings → Secrets and variables → Actions → New repository secret):

| Secret              | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `GCP_WIF_PROVIDER`  | Workload Identity provider resource name             |
| `GCP_DEPLOY_SA`     | Deployer service account email (`itbox-deployer@…`)  |

> The script binds trust to `chaithanin/ITbox`. If your repo path uses a
> different case/name, re-run with `REPO_FULL=owner/Repo bash deploy/setup-github-oidc.sh`.

## How it runs

`.github/workflows/deploy.yml` triggers on:

- push to `main` or `claude/enterprise-it-management-system-pz0u9s`
  (docs-only changes are skipped), and
- manual **Run workflow** from the Actions tab.

Steps: authenticate (WIF) → `gcloud builds submit` → update + execute the
`itbox-migrate` Cloud Run job → `gcloud run deploy itbox` (image only; every
env var, secret, and Cloud SQL binding stays as configured during
provisioning). The final step prints the live service URL.

Seeding is intentionally **not** part of CI — demo data is a one-time step in
`gcp-deploy.sh`, never re-run on deploys.

## Deployer permissions

`itbox-deployer` is granted: `run.admin`, `cloudbuild.builds.editor`,
`artifactregistry.writer`, `storage.admin`, and `iam.serviceAccountUser` on
`itbox-run` (required to deploy resources that run as that runtime SA).
