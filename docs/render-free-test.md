# Free disposable Render test

Use `render.free.yaml` for free services; `render.yaml` remains the paid configuration.
The same Docker image runs Next.js, NestJS and MinIO in a single service.

## Local results — 2026-09-15

- Docker image build passed (Prisma, NestJS and Next.js). Removed unnecessary
  `pnpm install --force`; frozen-lockfile dependency checks remain enabled.
- Fresh database migrations and empty-database bootstrap passed. A second bootstrap
  with a different password skipped existing data; original credentials still worked.
- Database/Redis/MinIO readiness, login and Redis authentication cache passed.
- Upload and signed download returned matching bytes. Missing, expired and tampered
  download signatures returned 403.
- Supported API workflow passed: HR employee creation; Resource Manager creation
  denied; project/site creation; employee assignment; employee login; empty timesheet
  submission denied; editing/submission with a site succeeded; self-approval denied;
  HR deactivation succeeded and subsequent login was denied.
- App measured about 375 MiB / 512 MiB after checks, with zero OOM events.
  Container inspection confirmed 0.1 CPU and no mounted volumes.
- Cold startup took several minutes; early login checks took approximately 10–13
  seconds. This configuration is for functional testing, not responsive production use.
- Full legacy critical suite, browser E2E, attendance/leave approval flows and live
  Render deployment remain unverified. No new capacity guarantee is implied.
- No commit, push or Render sync performed: dashboard sign-in is required before
  checking existing resource ownership and safely deploying.

## Important limits

- No persistent disk. MinIO uploads disappear on restart, redeploy or idle spin-down.
  Database attachment records may then refer to missing files. Use fake data only.
- Free PostgreSQL expires after 30 days. Free Redis loses its contents on restart.
- Free compute is not equivalent to the paid plan. Passing a free test does not
  establish paid production capacity, persistence or backup readiness.
- Never sync this free configuration onto paid resources with an existing disk.
  Resource names are retained for existing free deployments. Check the Render
  review carefully; free database/Redis workspace limits may prevent duplicates.

## Render setup

1. Sign into Render and connect the repository containing the tested changes.
2. Create or select the **free test** Blueprint and set its Blueprint path to
   `render.free.yaml`. Do not select the paid production Blueprint.
3. Set `DEMO_PASSWORD` to a private password of at least 12 characters.
   On an existing Blueprint, add it manually to the web service's Environment
   settings: `sync: false` prompts only during initial creation.
4. Verify that app, PostgreSQL and Key Value are Free, with **no disk** listed.
   Stop if the review shows paid resources, disk removal, or unintended duplicates.
5. Deploy, then check `/api/health/ready` and open the login page.
6. On a newly initialized database, log in as `a.elyoussefi@futura-expert.com`
   (HR), using `DEMO_PASSWORD`. The separate HR login is no longer created.

Bootstrap only runs against an empty database. Existing accounts/passwords remain
unchanged, even if `DEMO_PASSWORD` is changed later. Automatic destructive seeding
stays disabled. If Render assigns a different hostname, update `WEB_ORIGIN` to its
actual HTTPS origin.

## Local approximation

```sh
docker compose -p pointage-free-check -f docker-compose.render-test.yml -f docker-compose.render-free-test.yml up -d --build
# After startup/readiness:
docker compose -p pointage-free-check -f docker-compose.render-test.yml -f docker-compose.render-free-test.yml exec -e SKIP_LOAD=true app node tests/api/render-smoke.cjs
```

This limits the app to 512 MiB and 0.1 CPU and PostgreSQL to 256 MiB and 0.1 CPU.
It uses its own disposable database and an ephemeral MinIO directory, without
touching the paid test volumes. Local CPU scheduling, free service spin-down and
Render's database expiration are not simulated.
