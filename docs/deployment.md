# Deployment and local Docker

The new application lives in `code/` and uses one image for both runtime modes.
The image contains the Git-managed `content/` catalog, but never copies the
`local-courses/` material library. The Local Mode Compose override mounts that
directory read-only at runtime.

## Local Mode

From the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Open `http://127.0.0.1:3000`. Local Mode uses a fixed local identity and stores
SQLite state in the named `learning-state` volume. The host port is bound to
loopback and `local-courses/` is mounted read-only.

## Cloud Mode

Copy `.env.example` to `.env`, fill in `BETTER_AUTH_SECRET`, the public
`BETTER_AUTH_URL`, and the GitHub OAuth values, then use the cloud override:

```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up --build
```

Register exactly `${BETTER_AUTH_URL}/api/auth/callback/github` as the GitHub
OAuth callback URL. The application requests only `read:user`, fetches the
numeric GitHub ID and display name from `/user`, and deliberately does not
request or persist GitHub email, access tokens, refresh tokens, or raw session
tokens. The Better Auth session cookie is `agent-learning-session`; its SQLite
adapter stores only a SHA-256 token hash. Cloud Mode does not mount or proxy
`local-courses/`.

The Better Auth catch-all route is under `/api/auth/*`. The old
`/api/auth/github/callback` endpoint returns `410`; do not register it in the
GitHub application. Sign-out is handled by `POST /api/auth/sign-out`.

## Versioned production image

The `Release image` workflow publishes `vX.Y.Z` tags and the commit SHA to
`ghcr.io/cr330326/agent-learning-hub`, with SBOM and build-provenance
attestations. A production deployment must set `APP_IMAGE` to a release tag or
digest. `docker-compose.release.yml` removes the development `build` section so
the host cannot silently rebuild a different source tree; it also refuses an
unset image value.

After authenticating Docker to GHCR and filling the required cloud variables:

```bash
export APP_IMAGE=ghcr.io/cr330326/agent-learning-hub:v0.1.0
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloud.yml \
  -f docker-compose.release.yml \
  pull app
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cloud.yml \
  -f docker-compose.release.yml \
  up -d app
curl --fail https://your-origin.example/api/health
```

Run the compose `config` command before applying a change and inspect that the
resolved `image` is the intended version or digest. Do not use `latest` for a
production release.

## Upgrade and rollback runbook

1. Confirm the target image, GitHub OAuth callback origin, persistent state
   volume, proxy certificate and required environment variables.
2. Create and verify an encrypted SQLite backup using the procedure in
   [SQLite state operations](database-operations.md). Keep the manifest beside
   the backup and copy the encrypted result to deployment-owned off-host
   storage.
3. Pull the target image, start the container, and wait for `/api/health` to
   report `status: ok`. The process applies forward migrations on startup.
4. Run the cloud public smoke tests and manually verify the login redirect,
   sign-out, course upstream link and admin boundary.
5. If the application image is faulty, set `APP_IMAGE` back to the previous
   immutable tag/digest and recreate only the app container. Do not downgrade
   the database schema by hand. If a migration or data change is incompatible,
   stop writes, restore the pre-upgrade encrypted backup into a clean state
   volume, run the restore quick check, then start the previous image and repeat
   the health/smoke checks.

This repository provides the image, migration, backup and smoke-test building
blocks. TLS termination, DNS, GHCR credentials, scheduler, off-host copy,
alert routing and the dated production rollback drill remain deployment-owner
responsibilities until recorded in the task evidence.

## Health check

Both Compose configurations expose `GET /api/health`. A successful response
checks the content catalog and SQLite quick check without exposing internal
paths, secrets, or user state.

```bash
curl http://127.0.0.1:3000/api/health
```

Backup and restore are separate operator operations and are not performed by
the application container. See [SQLite state operations](database-operations.md)
for the encrypted snapshot commands, retention behavior, and restore check.
Production reverse-proxy, HTTPS, OAuth callback, scheduler, and off-host
storage configuration remain deployment-owner operations.
