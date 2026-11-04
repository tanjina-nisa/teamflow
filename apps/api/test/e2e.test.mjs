// End-to-end tests against a running API seeded with `npm run seed -- --reset`.
// Run: API_URL=http://localhost:4000 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const API = process.env.API_URL || 'http://localhost:4000';
const PW = 'teamflow123';

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const login = async (email, password = PW) => (await call('POST', '/auth/login', { body: { email, password } })).data;

test('auth: login works, wrong password fails, protected routes need a token', async () => {
  const s = await login('pm@teamflow.dev');
  assert.ok(s.token);
  assert.equal(s.user.role, 'PM');
  assert.equal(s.user.passwordHash, undefined);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'pm@teamflow.dev', password: 'nope' } })).status, 401);
  assert.equal((await call('GET', '/projects')).status, 401);
});

test('validation rejects bad payloads', async () => {
  const { token } = await login('pm@teamflow.dev');
  const r = await call('POST', '/projects', { token, body: { name: 'X', key: 'lower' } });
  assert.equal(r.status, 400);
});

test('RBAC: developers cannot create projects; devs see only their projects', async () => {
  const dev = await login('dev@teamflow.dev');
  assert.equal((await call('POST', '/projects', { token: dev.token, body: { name: 'Nope', key: 'NOPE' } })).status, 403);
  const boot = (await call('GET', '/workspace/bootstrap', { token: dev.token })).data;
  assert.deepEqual(boot.projects.map((p) => p.key).sort(), ['WEB']);
  const pm = await login('pm@teamflow.dev');
  const all = (await call('GET', '/workspace/bootstrap', { token: pm.token })).data;
  assert.equal(all.projects.length >= 3, true);
  assert.equal(all.users.length >= 7, true);
});

test('task lifecycle with QA gate, realtime events, comments, notifications', async (ctx) => {
  const pm = await login('pm@teamflow.dev');
  const dev = await login('dev@teamflow.dev');
  const qa = await login('qa@teamflow.dev');
  const web = (await call('GET', '/projects', { token: pm.token })).data.find((p) => p.key === 'WEB');

  const socket = io(API, { auth: { token: qa.token }, transports: ['websocket'] });
  ctx.after(() => socket.close());
  await new Promise((r, j) => { socket.on('connect', r); socket.on('connect_error', j); });
  const events = [];
  socket.onAny((e, p) => events.push([e, p]));

  const created = await call('POST', '/tasks', { token: pm.token, body: { projectId: web.id, title: 'E2E task', assigneeId: dev.user.id, points: 5, priority: 'HIGH' } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const t = created.data;
  assert.ok(t.number > 0);

  assert.equal((await call('PATCH', `/tasks/${t.id}`, { token: dev.token, body: { status: 'IN_PROGRESS' } })).status, 200);
  assert.equal((await call('PATCH', `/tasks/${t.id}`, { token: dev.token, body: { assigneeId: qa.user.id } })).status, 403, 'dev cannot reassign to others');
  assert.equal((await call('PATCH', `/tasks/${t.id}`, { token: dev.token, body: { status: 'REVIEW' } })).status, 200);
  assert.equal((await call('PATCH', `/tasks/${t.id}`, { token: dev.token, body: { status: 'DONE' } })).status, 403, 'QA gate');
  const done = await call('PATCH', `/tasks/${t.id}`, { token: qa.token, body: { status: 'DONE' } });
  assert.equal(done.status, 200);
  assert.ok(done.data.completedAt);

  const c = await call('POST', `/tasks/${t.id}/comments`, { token: qa.token, body: { body: 'Verified on staging @Arif' } });
  assert.equal(c.status, 201);

  await new Promise((r) => setTimeout(r, 300));
  const names = events.map((e) => e[0]);
  assert.ok(names.includes('task.upserted'));
  assert.ok(names.includes('activity.created'));
  assert.ok(names.includes('notification.created'), 'tester got a review notification');
  socket.close();

  const notes = (await call('GET', '/notifications', { token: dev.token })).data;
  assert.ok(notes.some((n) => n.type === 'assigned' && n.title.includes(`WEB-${t.number}`)));
  assert.ok(notes.some((n) => n.type === 'comment'));

  const acts = (await call('GET', `/activity?taskId=${t.id}`, { token: pm.token })).data;
  assert.ok(acts.some((a) => a.action === 'task.moved'));

  assert.equal((await call('DELETE', `/tasks/${t.id}`, { token: dev.token })).status, 403);
  assert.equal((await call('DELETE', `/tasks/${t.id}`, { token: pm.token })).status, 200);
});

test('attachments upload and download', async () => {
  const pm = await login('pm@teamflow.dev');
  const boot = (await call('GET', '/workspace/bootstrap', { token: pm.token })).data;
  const task = boot.tasks[0];
  const form = new FormData();
  form.append('file', new Blob(['hello teamflow'], { type: 'text/plain' }), 'notes.txt');
  const up = await call('POST', `/tasks/${task.id}/attachments`, { token: pm.token, form });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const dl = await fetch(`${API}/tasks/${task.id}/attachments/${up.data.id}`, { headers: { authorization: `Bearer ${pm.token}` } });
  assert.equal(await dl.text(), 'hello teamflow');
  assert.equal((await call('DELETE', `/tasks/${task.id}/attachments/${up.data.id}`, { token: pm.token })).status, 200);
});

test('sprints: only one active sprint, completing moves unfinished work to backlog', async () => {
  const pm = await login('pm@teamflow.dev');
  const web = (await call('GET', '/projects', { token: pm.token })).data.find((p) => p.key === 'WEB');
  const sprints = (await call('GET', `/projects/${web.id}/sprints`, { token: pm.token })).data;
  const planned = sprints.find((s) => s.status === 'PLANNED');
  assert.equal((await call('POST', `/sprints/${planned.id}/start`, { token: pm.token })).status, 409);
  const s = (await call('POST', `/projects/${web.id}/sprints`, { token: pm.token, body: { name: 'Tmp', startDate: '2030-01-01', endDate: '2030-01-14' } })).data;
  const t = (await call('POST', '/tasks', { token: pm.token, body: { projectId: web.id, title: 'carry me', sprintId: s.id } })).data;
  const active = sprints.find((x) => x.status === 'ACTIVE');
  await call('POST', `/sprints/${active.id}/complete`, { token: pm.token }); // frees the active slot
  assert.equal((await call('POST', `/sprints/${s.id}/start`, { token: pm.token })).status, 201);
  const r = await call('POST', `/sprints/${s.id}/complete`, { token: pm.token });
  assert.equal(r.data.carriedOver, 1);
  assert.equal((await call('GET', `/tasks/${t.id}`, { token: pm.token })).data.sprintId, null);
});

test('reports: progress, workload and CSV export', async () => {
  const pm = await login('pm@teamflow.dev');
  const p = (await call('GET', '/reports/progress?range=weekly', { token: pm.token })).data;
  assert.ok(p.totals.completed >= 1);
  assert.ok(p.byMember.length >= 7);
  const w = (await call('GET', '/reports/workload', { token: pm.token })).data;
  assert.ok(w.every((x) => typeof x.utilization === 'number'));
  const dev = await login('dev@teamflow.dev');
  assert.equal((await call('GET', '/reports/workload', { token: dev.token })).status, 403);
  const csv = await fetch(`${API}/reports/export.csv`, { headers: { authorization: `Bearer ${pm.token}` } });
  const text = await csv.text();
  assert.match(text, /^﻿?Key,Title,Project/);
  assert.ok(text.split('\n').length > 20);
});

test('admin invites a member and changes roles', async () => {
  const admin = await login('admin@teamflow.dev');
  const email = `new${Date.now()}@teamflow.dev`;
  const u = await call('POST', '/users', { token: admin.token, body: { name: 'New Dev', email, role: 'DEVELOPER', password: 'password123' } });
  assert.equal(u.status, 201);
  const r = await call('PATCH', `/users/${u.data.id}`, { token: admin.token, body: { role: 'TESTER' } });
  assert.equal(r.data.role, 'TESTER');
  const pm = await login('pm@teamflow.dev');
  assert.equal((await call('POST', '/users', { token: pm.token, body: { name: 'X', email: 'x@y.dev', role: 'ADMIN', password: 'password123' } })).status, 403);
  assert.equal((await login(email, 'password123')).user.role, 'TESTER');
});
