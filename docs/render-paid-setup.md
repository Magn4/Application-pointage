# Separate paid Blueprint

Use `render.yaml` for a new Blueprint. Its app, database, Redis and disk names end
in `-paid` and do not overlap with `render.free.yaml` resource names.

Compute sizes and disk capacity have not changed. Redis still requests the free
plan, so creation is blocked if this workspace already has a free Redis instance.
Choose how to resolve that limit before deployment; this change does not authorize
an additional paid Redis subscription or deletion of the free environment.

`DEMO_PASSWORD` is explicitly hardcoded to `PointageDemo2026!` at the user's
request. This initial password is visible in the repository and is not a secret.

On the first start with an empty database, the existing safe bootstrap creates:

- `a.elyoussefi@futura-expert.com` — HR

The initial password is `PointageDemo2026!`. Change it after signing in.
The password is hashed before storage in the database. This is a new account,
not a copy of a password from the old deployment. The separate
`rh@futura-expert.com` account is no longer created. Existing databases are not
modified automatically; their account roles require a separate targeted update.

`SEED_DEMO_ON_START` stays false. `BOOTSTRAP_DEMO_ON_START=true` invokes only the
empty-database bootstrap mode; existing databases are skipped, so later starts
do not reset passwords or remove tenants. Changing `DEMO_PASSWORD` after bootstrap
does not change an existing login password. Do not manually run `db:futura-only`
without bootstrap mode against a database containing data you need.

If Render assigns a different public hostname, update `WEB_ORIGIN` to its actual
HTTPS origin. Commit/push is required before Render can use these local changes.
