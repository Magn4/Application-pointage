# Local Render readiness check — 2026-09-15

Status: suitable for further pilot testing, **not a complete production sign-off**.

## Environment

Isolated Docker Compose project `pointage-render-check`, defined in
`docker-compose.render-test.yml`. Disposable database `render_test`; no production
database or deployed service was changed. App limited to 512 MiB, no swap, 0.5 CPU;
PostgreSQL limited to 256 MiB. Local build uses the Mac's native ARM architecture,
not Render's deployment architecture. Redis uses a 25 MB dataset limit and no persistence.

## Verified

- Docker image built successfully: Prisma generation, Nest compilation and Next production build.
- All 17 database migrations applied to the isolated database.
- PostgreSQL, Redis and MinIO readiness returned healthy.
- Demo login and authenticated requests worked with the isolated seeded accounts.
- Auth cache used `REDIS_URL`.
- Signed download returned the correct bytes; absent, expired and tampered signatures were rejected.
- MinIO file survived an app restart and app container recreation using the named volume.
- 100 dashboard requests in rounds of 10 concurrent requests all returned HTTP 200;
  observed p95 latency was 793 ms. This is a small synthetic check, not a 100-user capacity guarantee.
- Compose configuration validation and `git diff --check` passed.
- Latest request-log redaction change compiled successfully in a separate 2 GiB container.

## Limitations and blockers

- The critical API suite stopped at employee creation: it uses a RESOURCE_MANAGER
  account, while the controller requires HR. Update test fixtures to respect the
  intended permissions and rerun the complete suite; do not broaden authorization
  just to pass tests. Later workflow tests and browser E2E tests remain unverified.
- A suite attempt immediately after the load check hit the expected rate limiter
  (429 instead of 401). Rerunning with fresh application state cleared that issue.
- App memory measured about 355 MiB after restart, but reached 507.5 MiB with
  test runners inside it. Compiling inside the running 512 MiB app caused an OOM
  termination; isolated compilation passed. Keep build/test runners separate and
  measure realistic sustained traffic before accepting this runtime size.
- Redis outage recovery, sustained uploads, backup restoration and live Render
  deployment have not been verified. Free Redis is ephemeral; queued jobs can be lost.
- Production SMTP is not configured; inspect delivery configuration before relying on email.
- Production credentials were not rotated. Disable demo seeding and change existing
  demo passwords before inviting users. The `db:futura-only` seed deletes other
  tenants and must NEVER be run against production as a test/setup shortcut.
- At the time of this paid check, both YAML files described the paid small-app
  configuration. `render.free.yaml` was subsequently converted to a disposable
  free environment; see `render-free-test.md`. The dashboard's actual resource
  mapping and final bill still require confirmation.

## Reproduce basic checks

```sh
docker compose -p pointage-render-check -f docker-compose.render-test.yml up -d --build
# ONLY this isolated, disposable database may be seeded:
docker compose -p pointage-render-check -f docker-compose.render-test.yml run --rm --no-deps app pnpm db:futura-only
docker compose -p pointage-render-check -f docker-compose.render-test.yml exec -e SKIP_LOAD=true app node tests/api/render-smoke.cjs
docker compose -p pointage-render-check -f docker-compose.render-test.yml up -d --force-recreate --no-deps app
# Wait for readiness before this assertion; it does not upload a replacement file:
docker compose -p pointage-render-check -f docker-compose.render-test.yml exec -e SKIP_LOAD=true -e VERIFY_PERSISTENCE=true app node tests/api/render-smoke.cjs
```

Local web address: http://127.0.0.1:18080. These checks leave isolated test volumes
intact. No production sync, deployment, commit or push was performed in this continuation.
