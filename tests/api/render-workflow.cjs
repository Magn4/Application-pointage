// Disposable render_test database only. Run outside the constrained app container.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const base = process.env.API_URL ?? 'http://app:10000/api';
const password = process.env.DEMO_PASSWORD ?? 'LocalDemoTest123!';
const runId = Date.now();
let employee;
let resourceManager;
let timesheet;
let project;
let site;
async function request(path, token, method = 'GET', body, expected = 200) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  assert.ok([expected].flat().includes(res.status), `${method} ${path}: expected ${expected}, got ${res.status}: ${JSON.stringify(data)}`);
  return data.data;
}
async function login(email) {
  return request('/auth/login', null, 'POST', { email, password });
}
async function main() {
  assert.match(process.env.DATABASE_URL ?? '', /@postgres:5432\/render_test$/);
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const response = await fetch(base + '/health/ready', { signal: AbortSignal.timeout(3000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.ok(ready, 'Application must be ready before workflow checks');
  const hr = await login('a.elyoussefi@futura-expert.com');
  assert.equal(hr.role, 'HR');
  const data = {
    email: `render-test-${runId}@example.com`, password, firstName: 'Disposable', lastName: 'Test',
    role: 'EMPLOYEE', employeeNumber: `RT-${runId}`, jobTitle: 'Test employee', contractType: 'CDI',
    hireDate: '2026-01-01', annualLeaveBalance: 18, status: 'ACTIVE',
  };
  resourceManager = await request('/employees', hr.accessToken, 'POST', {
    ...data, email: `render-rm-${runId}@example.com`,
    employeeNumber: `RM-${runId}`, role: 'RESOURCE_MANAGER',
  }, [200, 201]);
  const rm = await login(resourceManager.user.email);
  await request('/employees', rm.accessToken, 'POST', data, 403);
  employee = await request('/employees', hr.accessToken, 'POST', data, [200, 201]);
  console.log('PASS: HR creates employee; Resource Manager cannot');
  const session = await login(data.email);
  await request('/auth/me', session.accessToken);
  project = await request('/projects', hr.accessToken, 'POST', {
    code: `RT-${runId}`, name: 'Disposable project', projectManagerId: hr.user.id,
  }, [200, 201]);
  site = await request('/sites', hr.accessToken, 'POST', {
    code: `RT-${runId}`, name: 'Disposable site', projectId: project.id, managerId: rm.user.id,
  }, [200, 201]);
  await request(`/sites/${site.id}/assignments`, rm.accessToken, 'POST', {
    userId: employee.user.id, startDate: '2026-01-01',
  }, [200, 201]);
  console.log('PASS: project/site creation and employee assignment');
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 42 + ((8 - start.getUTCDay()) % 7));
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const date = value => value.toISOString().slice(0, 10);
  timesheet = await request('/timesheets', session.accessToken, 'POST', {
    periodStart: date(start), periodEnd: date(end),
  }, [200, 201]);
  await request(`/timesheets/${timesheet.id}/submit`, session.accessToken, 'POST', undefined, 400);
  await request(`/timesheets/${timesheet.id}`, session.accessToken, 'PUT', { lines: [{
    siteId: site.id, taskName: 'Disposable smoke task', billingType: 'BILLABLE', activity: 'EXECUTION',
    workLocation: 'OFFICE', placeOfWork: 'Test office', entries: [{ entryDate: date(start), hours: 1 }],
  }] });
  const submitted = await request(`/timesheets/${timesheet.id}/submit`, session.accessToken, 'POST', undefined, [200, 201]);
  assert.equal(submitted.status, 'SUBMITTED');
  await request(`/timesheets/${timesheet.id}/approve`, session.accessToken, 'POST', undefined, 403);
  console.log('PASS: employee login, timesheet editing/submission and self-approval protection');
  await request(`/employees/${employee.id}`, rm.accessToken, 'DELETE', undefined, 403);
  const deleted = await request(`/employees/${employee.id}`, hr.accessToken, 'DELETE');
  assert.equal(deleted.status, 'INACTIVE');
  await request('/auth/login', null, 'POST', { email: data.email, password }, 401);
  console.log('PASS: HR deactivation blocks subsequent login');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (!employee && !resourceManager) return;
  const prisma = new PrismaClient();
  try {
    const userIds = [employee?.user.id, resourceManager?.user.id].filter(Boolean);
    const ids = [employee?.id, resourceManager?.id, ...userIds, timesheet?.id, site?.id, project?.id].filter(Boolean);
    await prisma.approvalAction.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { actionById: { in: userIds } }] } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { userId: { in: userIds } }] } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.timesheet.deleteMany({ where: { userId: { in: userIds } } });
    if (site) await prisma.site.delete({ where: { id: site.id } });
    if (project) await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally { await prisma.$disconnect(); }
});
