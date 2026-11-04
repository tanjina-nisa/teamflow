/**
 * Demo backend: the same API surface as the NestJS server, implemented in the browser.
 * Data lives in localStorage; changes are broadcast to other tabs with BroadcastChannel,
 * so opening two tabs (e.g. a PM and a developer) shows real-time updates.
 */
import {
  ApiError, type Activity, type Attachment, type Comment, type Notification, type Project, type Session, type Snapshot,
  type Sprint, type Task, type User, type Workspace,
} from '../types';
import { DAY, checkTaskRules, downloadBlob, isLead, tasksCsv, visibleProjects } from '../logic';
import { DEMO_PASSWORD, SEED_COMMENTS, SEED_PROJECTS, SEED_SPRINTS, SEED_TASKS, SEED_USERS, SEED_WORKSPACE } from '../seed-data';
import type { Backend, EventHandler, ServerEvent } from './types';

const DB_KEY = 'tf_db_v1';
const ATT_PREFIX = 'tf_att_';
const MAX_ATTACHMENT = 1.5 * 1024 * 1024;
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done' } as const;

interface DB {
  version: 1;
  workspace: Workspace;
  users: (User & { password: string })[];
  projects: Project[];
  sprints: Sprint[];
  tasks: (Task & { reminderSentAt?: string | null })[];
  comments: Comment[];
  attachments: Attachment[];
  activities: Activity[];
  notifications: Notification[];
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowISO = () => new Date().toISOString();
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const dateAt = (offsetDays: number) => at(offsetDays).slice(0, 10);
const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#22c55e'];
const pickColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export function seedDb(): DB {
  const ws: Workspace = { id: uid(), name: SEED_WORKSPACE.name, slug: SEED_WORKSPACE.slug, createdAt: at(-60) };
  const users = SEED_USERS.map((u) => ({
    id: uid(), workspaceId: ws.id, name: u.name, email: u.email, role: u.role, title: u.title, color: u.color,
    capacity: u.capacity, active: true, createdAt: at(-60), password: DEMO_PASSWORD,
  }));
  const uk = new Map(SEED_USERS.map((u, i) => [u.key, users[i].id]));
  const id = (k: string | null) => (k ? uk.get(k)! : null);
  const projects: Project[] = SEED_PROJECTS.map((p) => ({
    id: uid(), workspaceId: ws.id, key: p.key, name: p.name, description: p.description, color: p.color, status: 'ACTIVE',
    startDate: dateAt(p.startOffset), dueDate: dateAt(p.dueOffset), ownerId: id(p.owner),
    taskSeq: SEED_TASKS.filter((t) => t.project === p.key).length, memberIds: p.members.map((m) => uk.get(m)!), createdAt: at(p.startOffset),
  }));
  const pk = new Map(projects.map((p) => [p.key, p]));
  const sprints: Sprint[] = SEED_SPRINTS.map((s) => ({
    id: uid(), projectId: pk.get(s.project)!.id, name: s.name, goal: s.goal, startDate: dateAt(s.startOffset),
    endDate: dateAt(s.startOffset + s.length), status: s.status, createdAt: at(s.startOffset - 1),
  }));
  const sk = new Map(SEED_SPRINTS.map((s, i) => [`${s.project}/${s.name}`, sprints[i].id]));
  const seq = new Map<string, number>();
  const activities: Activity[] = [];
  const tasks = SEED_TASKS.map((t, i) => {
    const n = (seq.get(t.project) ?? 0) + 1;
    seq.set(t.project, n);
    const p = pk.get(t.project)!;
    const task: Task = {
      id: uid(), workspaceId: ws.id, projectId: p.id, sprintId: t.sprint ? sk.get(`${t.project}/${t.sprint}`)! : null, number: n,
      title: t.title, description: t.description ?? '', status: t.status, priority: t.priority, type: t.type,
      assigneeId: id(t.assignee), reporterId: id(t.reporter), points: t.points, dueDate: t.dueOffset === null ? null : dateAt(t.dueOffset),
      order: (i + 1) * 1000, labels: t.labels, completedAt: t.status === 'DONE' ? at(t.doneOffset ?? -1) : null,
      createdAt: at(t.createdOffset), updatedAt: at(t.doneOffset ?? t.createdOffset),
    };
    activities.push({ id: uid(), workspaceId: ws.id, projectId: p.id, taskId: task.id, actorId: id(t.reporter), action: 'task.created', message: `created ${p.key}-${n} “${t.title}”`, meta: {}, createdAt: task.createdAt });
    if (t.status === 'DONE') activities.push({ id: uid(), workspaceId: ws.id, projectId: p.id, taskId: task.id, actorId: id(t.assignee), action: 'task.moved', message: `moved ${p.key}-${n} from Review to Done`, meta: { from: 'REVIEW', to: 'DONE' }, createdAt: task.completedAt! });
    return task;
  });
  const byTitle = new Map(tasks.map((t) => [t.title, t]));
  const comments: Comment[] = SEED_COMMENTS.map((c) => ({ id: uid(), taskId: byTitle.get(c.task)!.id, authorId: id(c.author)!, body: c.body, createdAt: new Date(Date.now() + c.offsetHours * 3600000).toISOString() }));
  const pm = uk.get('tanjina')!;
  const web = pk.get('WEB')!;
  const notifications: Notification[] = [
    { id: uid(), userId: pm, type: 'review', title: 'WEB-7 is ready for review', body: 'Billing page: invoice table + PDF download', link: `/projects/${web.id}`, read: false, createdAt: at(-0.8) },
    { id: uid(), userId: pm, type: 'comment', title: 'Farzana Akter commented on WEB-7', body: 'Testing on Chrome and Safari now.', link: `/projects/${web.id}`, read: false, createdAt: at(-0.25) },
  ];
  activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { version: 1, workspace: ws, users, projects, sprints, tasks, comments, attachments: [], activities, notifications };
}

export function createDemoBackend(): Backend {
  let me: (User & { password?: string }) | null = null;
  const handlers = new Set<EventHandler>();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('teamflow-demo') : null;

  const load = (): DB => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as DB;
    } catch { /* corrupted or blocked storage → reseed */ }
    const db = seedDb();
    save(db);
    return db;
  };
  const save = (db: DB) => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      throw new ApiError(507, 'Browser storage is full. Remove some attachments or reset the demo in Settings.');
    }
  };
  const emit = (event: ServerEvent, payload: unknown) => {
    handlers.forEach((h) => h(event, payload));
    channel?.postMessage({ event, payload });
  };
  channel?.addEventListener('message', (e: MessageEvent) => handlers.forEach((h) => h(e.data.event, e.data.payload)));

  const latency = () => new Promise((r) => setTimeout(r, 60));
  const auth = () => {
    if (!me) throw new ApiError(401, 'Please sign in');
    return me;
  };
  const requireLead = () => {
    const u = auth();
    if (!isLead(u.role)) throw new ApiError(403, 'Requires role: Project Manager or Admin');
    return u;
  };
  const strip = ({ password: _p, ...u }: User & { password?: string }): User => u;
  const session = (db: DB, u: DB['users'][number]): Session => ({ token: `demo.${u.id}`, user: strip(u), workspace: db.workspace });

  const log = (db: DB, a: Omit<Activity, 'id' | 'workspaceId' | 'createdAt' | 'meta' | 'actorId'> & { meta?: Activity['meta'] }) => {
    const row: Activity = { id: uid(), workspaceId: db.workspace.id, actorId: me?.id ?? null, createdAt: nowISO(), meta: {}, ...a };
    db.activities.unshift(row);
    db.activities = db.activities.slice(0, 1500);
    return row;
  };
  const notify = (db: DB, userId: string | null | undefined, n: Pick<Notification, 'type' | 'title' | 'body' | 'link'>) => {
    if (!userId) return null;
    const row: Notification = { id: uid(), userId, read: false, createdAt: nowISO(), ...n };
    db.notifications.unshift(row);
    return row;
  };
  /** Runs a mutation, persists, then emits the resulting events. */
  const tx = async <T>(fn: (db: DB, out: [ServerEvent, unknown][]) => T): Promise<T> => {
    await latency();
    const db = load();
    const out: [ServerEvent, unknown][] = [];
    const before = db.activities.length ? db.activities[0].id : '';
    const beforeN = new Set(db.notifications.map((n) => n.id));
    const result = fn(db, out);
    save(db);
    for (const e of out) emit(e[0], e[1]);
    for (const a of db.activities) {
      if (a.id === before) break;
      emit('activity.created', a);
    }
    for (const n of db.notifications) if (!beforeN.has(n.id)) emit('notification.created', n);
    return result;
  };

  const getProject = (db: DB, id: string) => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw new ApiError(404, 'Project not found');
    const u = auth();
    if (!isLead(u.role) && !p.memberIds.includes(u.id)) throw new ApiError(403, 'You are not a member of this project');
    return p;
  };
  const getTask = (db: DB, id: string) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) throw new ApiError(404, 'Task not found');
    return { t, p: getProject(db, t.projectId) };
  };

  /** Same as the API's hourly cron, run whenever the app loads. */
  const runReminders = (db: DB) => {
    const horizon = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    for (const t of db.tasks) {
      if (t.status === 'DONE' || !t.dueDate || t.dueDate > horizon || t.reminderSentAt || !t.assigneeId) continue;
      const p = db.projects.find((x) => x.id === t.projectId)!;
      notify(db, t.assigneeId, {
        type: 'deadline',
        title: `${t.dueDate < today ? 'Overdue' : 'Due soon'}: ${p.key}-${t.number}`,
        body: `${t.title} — due ${t.dueDate}`,
        link: `/projects/${p.id}?task=${t.id}`,
      });
      t.reminderSentAt = nowISO();
    }
  };

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const startPresence = () => {
    if (heartbeat || !channel) return;
    const beat = () => me && channel.postMessage({ event: 'presence', payload: { userId: me.id, online: true } });
    beat();
    heartbeat = setInterval(beat, 15000);
    window.addEventListener('beforeunload', () => me && channel.postMessage({ event: 'presence', payload: { userId: me.id, online: false } }));
  };

  return {
    mode: 'demo',

    async login(email, password) {
      await latency();
      const db = load();
      const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || !u.active || u.password !== password) throw new ApiError(401, 'Wrong email or password');
      me = u;
      startPresence();
      return session(db, u);
    },

    async register(input) {
      await latency();
      const ws: Workspace = { id: uid(), name: input.workspaceName, slug: input.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), createdAt: nowISO() };
      const u = { id: uid(), workspaceId: ws.id, name: input.name, email: input.email.toLowerCase(), role: 'ADMIN' as const, title: 'Workspace admin', color: pickColor(input.email), capacity: 20, active: true, createdAt: nowISO(), password: input.password };
      const db: DB = { version: 1, workspace: ws, users: [u], projects: [], sprints: [], tasks: [], comments: [], attachments: [], activities: [], notifications: [] };
      save(db);
      me = u;
      startPresence();
      return session(db, u);
    },

    async restore(token) {
      const db = load();
      const u = db.users.find((x) => `demo.${x.id}` === token && x.active);
      if (!u) throw new ApiError(401, 'Session expired');
      me = u;
      startPresence();
      return session(db, u);
    },

    logout() {
      if (me) channel?.postMessage({ event: 'presence', payload: { userId: me.id, online: false } });
      me = null;
    },

    async bootstrap(): Promise<Snapshot> {
      const u = auth();
      const db = load();
      runReminders(db);
      save(db);
      const projects = visibleProjects(db.projects, u);
      const ids = new Set(projects.map((p) => p.id));
      return {
        workspace: db.workspace,
        users: db.users.map(strip),
        projects,
        sprints: db.sprints.filter((s) => ids.has(s.projectId)),
        tasks: db.tasks.filter((t) => ids.has(t.projectId)).sort((a, b) => a.order - b.order),
        notifications: db.notifications.filter((n) => n.userId === u.id).slice(0, 100),
      };
    },

    createProject: (input) =>
      tx((db, out) => {
        const u = requireLead();
        if (!input.name || !input.key) throw new ApiError(400, 'Name and key are required');
        if (!/^[A-Z][A-Z0-9]{1,5}$/.test(input.key)) throw new ApiError(400, 'key must be 2–6 capital letters/digits');
        if (db.projects.some((p) => p.key === input.key)) throw new ApiError(409, `Project key ${input.key} is already used`);
        const members = [...new Set([u.id, ...(input.memberIds ?? [])])];
        const p: Project = {
          id: uid(), workspaceId: db.workspace.id, key: input.key, name: input.name, description: input.description ?? '',
          color: input.color ?? '#6366f1', status: input.status ?? 'ACTIVE', startDate: input.startDate ?? null, dueDate: input.dueDate ?? null,
          ownerId: u.id, taskSeq: 0, memberIds: members, createdAt: nowISO(),
        };
        db.projects.push(p);
        log(db, { projectId: p.id, taskId: null, action: 'project.created', message: `created project ${p.name}` });
        for (const m of members.filter((x) => x !== u.id)) notify(db, m, { type: 'project', title: `Added to ${p.name}`, body: `${u.name} added you to the project`, link: `/projects/${p.id}` });
        out.push(['project.upserted', p]);
        return p;
      }),

    updateProject: (id, input) =>
      tx((db, out) => {
        const u = requireLead();
        const p = getProject(db, id);
        const before = new Set(p.memberIds);
        Object.assign(p, Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && k !== 'key')));
        for (const m of p.memberIds.filter((x) => !before.has(x))) notify(db, m, { type: 'project', title: `Added to ${p.name}`, body: `${u.name} added you to the project`, link: `/projects/${p.id}` });
        log(db, { projectId: p.id, taskId: null, action: 'project.updated', message: `updated project ${p.name}` });
        out.push(['project.upserted', p]);
        return p;
      }),

    deleteProject: (id) =>
      tx((db, out) => {
        const u = auth();
        if (u.role !== 'ADMIN') throw new ApiError(403, 'Requires role: Admin');
        const p = getProject(db, id);
        db.projects = db.projects.filter((x) => x.id !== id);
        const gone = new Set(db.tasks.filter((t) => t.projectId === id).map((t) => t.id));
        db.tasks = db.tasks.filter((t) => t.projectId !== id);
        db.sprints = db.sprints.filter((s) => s.projectId !== id);
        db.comments = db.comments.filter((c) => !gone.has(c.taskId));
        db.attachments = db.attachments.filter((a) => {
          if (gone.has(a.taskId)) localStorage.removeItem(ATT_PREFIX + a.id);
          return !gone.has(a.taskId);
        });
        log(db, { projectId: null, taskId: null, action: 'project.deleted', message: `deleted project ${p.name}` });
        out.push(['project.deleted', { id }]);
      }),

    createSprint: (projectId, input) =>
      tx((db, out) => {
        requireLead();
        const p = getProject(db, projectId);
        if (input.endDate < input.startDate) throw new ApiError(400, 'Sprint ends before it starts');
        const s: Sprint = { id: uid(), projectId: p.id, status: 'PLANNED', createdAt: nowISO(), ...input, goal: input.goal ?? '' };
        db.sprints.push(s);
        log(db, { projectId: p.id, taskId: null, action: 'sprint.created', message: `planned ${s.name} in ${p.name}` });
        out.push(['sprint.upserted', s]);
        return s;
      }),

    startSprint: (id) =>
      tx((db, out) => {
        requireLead();
        const s = db.sprints.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sprint not found');
        getProject(db, s.projectId);
        if (db.sprints.some((x) => x.projectId === s.projectId && x.status === 'ACTIVE')) throw new ApiError(409, 'Another sprint is already active in this project');
        s.status = 'ACTIVE';
        log(db, { projectId: s.projectId, taskId: null, action: 'sprint.started', message: `started ${s.name}` });
        out.push(['sprint.upserted', s]);
        return s;
      }),

    completeSprint: (id) =>
      tx((db, out) => {
        requireLead();
        const s = db.sprints.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sprint not found');
        getProject(db, s.projectId);
        s.status = 'COMPLETED';
        const inSprint = db.tasks.filter((t) => t.sprintId === s.id);
        const carried = inSprint.filter((t) => t.status !== 'DONE');
        for (const t of carried) {
          t.sprintId = null;
          t.updatedAt = nowISO();
          out.push(['task.upserted', t]);
        }
        log(db, { projectId: s.projectId, taskId: null, action: 'sprint.completed', message: `completed ${s.name} (${inSprint.length - carried.length} done, ${carried.length} moved to backlog)` });
        out.push(['sprint.upserted', s]);
        return { sprint: s, carriedOver: carried.length };
      }),

    deleteSprint: (id) =>
      tx((db, out) => {
        requireLead();
        const s = db.sprints.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sprint not found');
        for (const t of db.tasks.filter((x) => x.sprintId === id)) {
          t.sprintId = null;
          out.push(['task.upserted', t]);
        }
        db.sprints = db.sprints.filter((x) => x.id !== id);
        out.push(['sprint.deleted', { id }]);
      }),

    createTask: (input) =>
      tx((db, out) => {
        const u = auth();
        const p = getProject(db, input.projectId);
        checkTaskRules(u, { status: 'TODO', assigneeId: null }, input);
        if (input.assigneeId && !p.memberIds.includes(input.assigneeId)) throw new ApiError(400, 'Assignee must be a project member');
        if (!input.title?.trim()) throw new ApiError(400, 'Title is required');
        p.taskSeq += 1;
        const status = input.status ?? 'TODO';
        const maxOrder = Math.max(0, ...db.tasks.filter((t) => t.projectId === p.id && t.status === status).map((t) => t.order));
        const t: Task = {
          id: uid(), workspaceId: db.workspace.id, projectId: p.id, sprintId: input.sprintId ?? null, number: p.taskSeq,
          title: input.title.trim(), description: input.description ?? '', status, priority: input.priority ?? 'MEDIUM', type: input.type ?? 'FEATURE',
          assigneeId: input.assigneeId ?? null, reporterId: u.id, points: input.points ?? 1, dueDate: input.dueDate ?? null,
          order: maxOrder + 1000, labels: input.labels ?? [], completedAt: status === 'DONE' ? nowISO() : null, createdAt: nowISO(), updatedAt: nowISO(),
        };
        db.tasks.push(t);
        log(db, { projectId: p.id, taskId: t.id, action: 'task.created', message: `created ${p.key}-${t.number} “${t.title}”` });
        if (t.assigneeId && t.assigneeId !== u.id) notify(db, t.assigneeId, { type: 'assigned', title: `${u.name} assigned you ${p.key}-${t.number}`, body: t.title, link: `/projects/${p.id}?task=${t.id}` });
        out.push(['task.upserted', t]);
        return t;
      }),

    updateTask: (id, patch) =>
      tx((db, out) => {
        const u = auth();
        const { t, p } = getTask(db, id);
        checkTaskRules(u, t, patch);
        if (patch.assigneeId && !p.memberIds.includes(patch.assigneeId)) throw new ApiError(400, 'Assignee must be a project member');
        const before = { ...t };
        Object.assign(t, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
        t.updatedAt = nowISO();
        const ref = `${p.key}-${t.number}`;
        const link = `/projects/${p.id}?task=${t.id}`;
        if (patch.status && patch.status !== before.status) {
          t.completedAt = patch.status === 'DONE' ? nowISO() : null;
          log(db, { projectId: p.id, taskId: t.id, action: 'task.moved', message: `moved ${ref} from ${STATUS_LABEL[before.status]} to ${STATUS_LABEL[patch.status]}`, meta: { from: before.status, to: patch.status } });
          if (patch.status === 'REVIEW') {
            for (const m of db.users.filter((x) => x.role === 'TESTER' && p.memberIds.includes(x.id) && x.id !== u.id)) notify(db, m.id, { type: 'review', title: `${ref} is ready for review`, body: t.title, link });
          }
          if (patch.status === 'DONE' && t.reporterId && t.reporterId !== u.id) notify(db, t.reporterId, { type: 'status', title: `${ref} is done`, body: t.title, link });
        }
        if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId) {
          const who = db.users.find((x) => x.id === patch.assigneeId)?.name;
          log(db, { projectId: p.id, taskId: t.id, action: 'task.assigned', message: who ? `assigned ${ref} to ${who}` : `unassigned ${ref}` });
          if (patch.assigneeId && patch.assigneeId !== u.id) notify(db, patch.assigneeId, { type: 'assigned', title: `${u.name} assigned you ${ref}`, body: t.title, link });
        }
        if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) (t as DB['tasks'][number]).reminderSentAt = null;
        const changed = (['title', 'priority', 'points', 'dueDate', 'sprintId', 'description'] as const).filter((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(before[k]));
        if (changed.length) log(db, { projectId: p.id, taskId: t.id, action: 'task.updated', message: `updated ${changed.join(', ')} on ${ref}` });
        out.push(['task.upserted', t]);
        return { ...t };
      }),

    deleteTask: (id) =>
      tx((db, out) => {
        requireLead();
        const { t, p } = getTask(db, id);
        db.tasks = db.tasks.filter((x) => x.id !== id);
        db.comments = db.comments.filter((c) => c.taskId !== id);
        log(db, { projectId: p.id, taskId: null, action: 'task.deleted', message: `deleted ${p.key}-${t.number} “${t.title}”` });
        out.push(['task.deleted', { id }]);
      }),

    async listComments(taskId) {
      const db = load();
      getTask(db, taskId);
      return db.comments.filter((c) => c.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    addComment: (taskId, body) =>
      tx((db, out) => {
        const u = auth();
        const { t, p } = getTask(db, taskId);
        if (!body.trim()) throw new ApiError(400, 'Comment is empty');
        const c: Comment = { id: uid(), taskId, authorId: u.id, body: body.trim(), createdAt: nowISO() };
        db.comments.push(c);
        const ref = `${p.key}-${t.number}`;
        log(db, { projectId: p.id, taskId, action: 'comment.added', message: `commented on ${ref}` });
        const mentioned = [...body.matchAll(/@([a-z][\w-]*)/gi)].map((m) => m[1].toLowerCase());
        const to = new Set([t.assigneeId, t.reporterId].filter(Boolean) as string[]);
        for (const m of db.users.filter((x) => p.memberIds.includes(x.id))) if (mentioned.includes(m.name.split(' ')[0].toLowerCase())) to.add(m.id);
        to.delete(u.id);
        for (const id of to) notify(db, id, { type: 'comment', title: `${u.name} commented on ${ref}`, body: body.slice(0, 140), link: `/projects/${p.id}?task=${t.id}` });
        out.push(['comment.created', c]);
        return c;
      }),

    async listAttachments(taskId) {
      const db = load();
      getTask(db, taskId);
      return db.attachments.filter((a) => a.taskId === taskId);
    },

    async uploadAttachment(taskId, file) {
      if (file.size > MAX_ATTACHMENT) throw new ApiError(413, 'Demo mode stores files in your browser, so the limit is 1.5 MB. The API allows 10 MB.');
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new ApiError(400, 'Could not read the file'));
        r.readAsDataURL(file);
      });
      return tx((db, out) => {
        const u = auth();
        const { t, p } = getTask(db, taskId);
        const a: Attachment = { id: uid(), taskId, uploaderId: u.id, filename: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, createdAt: nowISO() };
        try {
          localStorage.setItem(ATT_PREFIX + a.id, dataUrl);
        } catch {
          throw new ApiError(507, 'Browser storage is full. Delete some attachments first.');
        }
        db.attachments.push(a);
        log(db, { projectId: p.id, taskId, action: 'attachment.added', message: `attached ${file.name} to ${p.key}-${t.number}` });
        out.push(['attachment.created', a]);
        return a;
      });
    },

    async downloadAttachment(a) {
      const dataUrl = localStorage.getItem(ATT_PREFIX + a.id);
      if (!dataUrl) throw new ApiError(404, 'Attachment not found');
      downloadBlob(await (await fetch(dataUrl)).blob(), a.filename);
    },

    deleteAttachment: (a) =>
      tx((db, out) => {
        const u = auth();
        if (a.uploaderId !== u.id && !isLead(u.role)) throw new ApiError(403, 'Only the uploader or a project manager can delete this file');
        db.attachments = db.attachments.filter((x) => x.id !== a.id);
        localStorage.removeItem(ATT_PREFIX + a.id);
        out.push(['attachment.deleted', { id: a.id, taskId: a.taskId }]);
      }),

    async listActivity(f = {}) {
      const u = auth();
      const db = load();
      const ids = new Set(visibleProjects(db.projects, u).map((p) => p.id));
      return db.activities
        .filter((a) => (!a.projectId || ids.has(a.projectId)) && (!f.projectId || a.projectId === f.projectId) && (!f.taskId || a.taskId === f.taskId))
        .slice(0, f.limit ?? 200);
    },

    markRead: (id) =>
      tx((db) => {
        const n = db.notifications.find((x) => x.id === id && x.userId === auth().id);
        if (n) n.read = true;
      }),

    markAllRead: () =>
      tx((db) => {
        const u = auth();
        for (const n of db.notifications) if (n.userId === u.id) n.read = true;
      }),

    inviteUser: (input) =>
      tx((db, out) => {
        const u = auth();
        if (u.role !== 'ADMIN') throw new ApiError(403, 'Requires role: Admin');
        const email = input.email.trim().toLowerCase();
        if (db.users.some((x) => x.email === email)) throw new ApiError(409, 'Email already registered');
        if ((input.password ?? '').length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
        const row = { id: uid(), workspaceId: db.workspace.id, name: input.name, email, role: input.role, title: input.title ?? '', color: pickColor(email), capacity: 24, active: true, createdAt: nowISO(), password: input.password };
        db.users.push(row);
        log(db, { projectId: null, taskId: null, action: 'user.invited', message: `added ${row.name} as ${row.role}` });
        out.push(['user.upserted', strip(row)]);
        return strip(row);
      }),

    updateUser: (id, input) =>
      tx((db, out) => {
        const u = auth();
        if (u.role !== 'ADMIN') throw new ApiError(403, 'Requires role: Admin');
        const row = db.users.find((x) => x.id === id);
        if (!row) throw new ApiError(404, 'User not found');
        if (id === u.id && ((input.role && input.role !== 'ADMIN') || input.active === false)) throw new ApiError(400, 'You cannot remove your own admin access');
        Object.assign(row, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
        if (input.role) log(db, { projectId: null, taskId: null, action: 'user.role', message: `changed ${row.name}'s role to ${input.role}` });
        out.push(['user.upserted', strip(row)]);
        return strip(row);
      }),

    async exportCsv(projectId) {
      const u = auth();
      const db = load();
      const projects = visibleProjects(db.projects, u).filter((p) => !projectId || p.id === projectId);
      const ids = new Set(projects.map((p) => p.id));
      return new Blob([tasksCsv(db.tasks.filter((t) => ids.has(t.projectId)), projects, db.users)], { type: 'text/csv;charset=utf-8' });
    },

    subscribe(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}

export function resetDemoData() {
  for (const k of Object.keys(localStorage)) if (k === DB_KEY || k.startsWith(ATT_PREFIX)) localStorage.removeItem(k);
}
