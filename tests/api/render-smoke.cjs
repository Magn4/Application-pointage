// Run inside the isolated app container after seeding its disposable database.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const backendRequire = createRequire('/app/backend/package.json');
const { ConfigService } = backendRequire('@nestjs/config');
const { StorageService } = require('/app/backend/dist/storage/storage.service.js');
const Redis = backendRequire('ioredis');

async function main() {
  assert.match(process.env.DATABASE_URL, /@postgres:5432\/render_test$/,
    'This test must only run against the isolated render_test database');
  const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:10000';
  const storage = new StorageService(new ConfigService(process.env));
  const redis = new Redis(process.env.REDIS_URL);
  try {
    const health = await fetch(`${base}/api/health/ready`);
    assert.equal(health.status, 200);
    const readiness = await health.json();
    assert.equal(readiness.data.status, 'ok');
    console.log('PASS: PostgreSQL, Redis and MinIO readiness');

    const key = 'render-verification/persistence.txt';
    const body = Buffer.from('Persistent MinIO smoke test');
    if (process.env.VERIFY_PERSISTENCE !== 'true') {
      await storage.putObject(key, Readable.from(body), body.length);
    }
    const url = await storage.presignedGetObject(key, 300);
    assert.ok(url.startsWith('/api/storage/download?token='));
    const download = await fetch(`${base}${url}`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), body.toString());
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    console.log('PASS: browser-facing signed download and file content');

    for (const invalid of [url + 'x', '/api/storage/download',
      await storage.presignedGetObject(key, -1)]) {
      const response = await fetch(`${base}${invalid}`);
      assert.equal(response.status, 403);
    }
    console.log('PASS: tampered, missing and expired download tokens rejected');

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a.elyoussefi@futura-expert.com', password: process.env.DEMO_PASSWORD ?? 'Password123!' }),
    });
    assert.equal(login.status, 200);
    const session = (await login.json()).data;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const me = await fetch(`${base}/api/auth/me`, { headers });
    assert.equal(me.status, 200);
    const cached = await redis.get(`auth:user:${session.user.id}`);
    assert.ok(cached, 'Authentication cache should use REDIS_URL');
    console.log('PASS: login, authenticated request and managed Redis auth cache');

    if (process.env.SKIP_LOAD === 'true') return;

    // 10 concurrent clients, 10 request rounds. Rate limits remain enabled.
    const durations = [];
    const statuses = {};
    for (let round = 0; round < 10; round++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await Promise.all(Array.from({ length: 10 }, async () => {
        const start = performance.now();
        const response = await fetch(`${base}/api/dashboard/summary`, { headers });
        await response.arrayBuffer();
        durations.push(performance.now() - start);
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        assert.ok([200, 429].includes(response.status), `Unexpected HTTP ${response.status}`);
      }));
    }
    durations.sort((a, b) => a - b);
    console.log(JSON.stringify({ requests: 100, concurrent: 10, statuses,
      p95ms: Math.round(durations[Math.floor(durations.length * 0.95)]) }));
  } finally {
    redis.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
