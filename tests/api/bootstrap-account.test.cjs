// Dependency-free bootstrap regression test with an in-memory Prisma double.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../prisma/futura-only.ts'), 'utf8')
  .replace(/^import .*;\n/gm, '');

async function check(existing) {
  const users = [];
  const profiles = [];
  let writes = 0;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const upsert = async () => { writes++; return { id: 'tenant-test', slug: 'futura-expertise' }; };
  const db = {
    tenant: { count: async () => existing ? 1 : 0, upsert,
      findMany: async () => [], deleteMany: async () => { throw Error('Unexpected tenant deletion'); } },
    user: { count: async () => existing ? 2 : 0, upsert: async args => {
      writes++; users.push(args); return { id: 'hr-test', ...args.create };
    } },
    employeeProfile: { upsert: async args => { writes++; profiles.push(args); } },
    subscriptionPlan: { upsert }, leaveType: { upsert }, tenantSettings: { upsert },
    $disconnect: async () => finish(),
  };
  let failure;
  vm.runInNewContext(source, {
    PrismaClient: class { constructor() { return db; } },
    TenantStatus: { ACTIVE: 'ACTIVE' }, UserStatus: { ACTIVE: 'ACTIVE' }, UserRole: { HR: 'HR' },
    bcrypt: { hash: async () => 'hashed-password' },
    process: { env: { DEMO_BOOTSTRAP_ONLY: 'true', DEMO_PASSWORD: 'TestOnlyPassword123!' },
      exit: code => { failure = new Error(`Bootstrap exited ${code}`); } },
    console: { log() {}, error(error) { failure = error; } },
  });
  await done;
  if (failure) throw failure;
  if (existing) {
    assert.equal(writes, 0, 'Existing databases must not be modified');
  } else {
    assert.equal(users.length, 1);
    assert.equal(users[0].create.email, 'a.elyoussefi@futura-expert.com');
    assert.equal(users[0].create.role, 'HR');
    assert.equal(users[0].update.role, 'HR');
    assert.equal(users[0].create.passwordHash, 'hashed-password');
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].create.userId, 'hr-test');
    assert.equal(profiles[0].create.jobTitle, 'Responsable RH');
  }
}
(async () => {
  await check(false);
  await check(true);
  console.log('PASS: single HR account bootstrap; existing databases unchanged');
})().catch(error => { console.error(error); process.exitCode = 1; });
