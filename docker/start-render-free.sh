#!/bin/bash
set -eu

pnpm db:deploy

if [ "${BOOTSTRAP_DEMO_ON_START:-false}" = "true" ]; then
  DEMO_BOOTSTRAP_ONLY=true pnpm db:futura-only
fi

if [ "${SEED_DEMO_ON_START:-false}" = "true" ]; then
  pnpm db:futura-only
fi

minio_data_dir="${MINIO_DATA_DIR:-/var/data/minio}"
mkdir -p "$minio_data_dir"

MINIO_ROOT_USER="$MINIO_ACCESS_KEY" \
MINIO_ROOT_PASSWORD="$MINIO_SECRET_KEY" \
  minio server "$minio_data_dir" --address 127.0.0.1:9000 &
minio_pid=$!

PORT=4000 node /app/backend/dist/main.js &
api_pid=$!

terminate() {
  kill -TERM "$api_pid" 2>/dev/null || true
  kill -TERM "$minio_pid" 2>/dev/null || true
  kill -TERM "${web_pid:-}" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  wait "$minio_pid" 2>/dev/null || true
  wait "${web_pid:-}" 2>/dev/null || true
}

trap terminate EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

API_PROXY_URL=http://127.0.0.1:4000 \
  node /app/frontend/node_modules/next/dist/bin/next start /app/frontend --hostname 0.0.0.0 --port "${PORT:-10000}" &
web_pid=$!

# Fail the container if any component exits, including a clean unexpected exit.
set +e
wait -n "$minio_pid" "$api_pid" "$web_pid"
status=$?
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
