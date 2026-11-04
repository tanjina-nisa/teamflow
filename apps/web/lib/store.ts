'use client';

import { create } from 'zustand';
import { backend } from './backend';
import type { ServerEvent } from './backend/types';
import {
  ApiError, type NewTask, type Notification, type Project, type ProjectInput, type Role, type Session, type Sprint, type Task,
  type TaskPatch, type User, type Workspace,
} from './types';

const TOKEN_KEY = 'tf_token';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; title: string; body?: string }

interface State {
  status: 'boot' | 'anon' | 'loading' | 'ready';
  me: User | null;
  workspace: Workspace | null;
  users: User[];
  projects: Project[];
  sprints: Sprint[];
  tasks: Task[];
  notifications: Notification[];
  online: Record<string, number>;
  toasts: Toast[];
  /** Bumps when comments/attachments/activity change so open panels refetch. */
  tick: number;
}

interface Actions {
  init(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: { workspaceName: string; name: string; email: string; password: string }): Promise<void>;
  logout(): void;
  refresh(): Promise<void>;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
  createProject(i: ProjectInput): Promise<Project>;
  updateProject(id: string, i: ProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  createSprint(projectId: string, i: Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>): Promise<Sprint>;
  startSprint(id: string): Promise<void>;
  completeSprint(id: string): Promise<void>;
  deleteSprint(id: string): Promise<void>;
  createTask(i: NewTask): Promise<Task>;
  updateTask(id: string, p: TaskPatch): Promise<Task | null>;
  deleteTask(id: string): Promise<void>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  inviteUser(i: { name: string; email: string; role: Role; title?: string; password: string }): Promise<User>;
  updateUser(id: string, i: Partial<Pick<User, 'role' | 'title' | 'capacity' | 'active'>>): Promise<void>;
}

const upsert = <T extends { id: string }>(list: T[], item: T) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = { ...list[i], ...item };
  return next;
};
const without = <T extends { id: string }>(list: T[], id: string) => list.filter((x) => x.id !== id);

let toastSeq = 0;
let unsubscribe: (() => void) | null = null;

export const useStore = create<State & Actions>()((set, get) => {
  const fail = (e: unknown): never => {
    const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong';
    get().toast({ kind: 'error', title: msg });
    throw e;
  };
  const guard = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) get().logout();
      return fail(e);
    }
  };

  const onEvent = (event: ServerEvent, payload: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s = get();
    switch (event) {
      case 'task.upserted':
        if (s.projects.some((p) => p.id === payload.projectId)) set({ tasks: upsert(s.tasks, payload) });
        break;
      case 'task.deleted':
        set({ tasks: without(s.tasks, payload.id) });
        break;
      case 'project.upserted': {
        const me = s.me;
        const visible = me && (me.role === 'ADMIN' || me.role === 'PM' || payload.memberIds.includes(me.id));
        if (visible) {
          const isNew = !s.projects.some((p) => p.id === payload.id);
          set({ projects: upsert(s.projects, payload) });
          if (isNew && me?.role !== 'ADMIN' && me?.role !== 'PM') void get().refresh();
        } else set({ projects: without(s.projects, payload.id), tasks: s.tasks.filter((t) => t.projectId !== payload.id) });
        break;
      }
      case 'project.deleted':
        set({ projects: without(s.projects, payload.id), tasks: s.tasks.filter((t) => t.projectId !== payload.id), sprints: s.sprints.filter((x) => x.projectId !== payload.id) });
        break;
      case 'sprint.upserted':
        if (s.projects.some((p) => p.id === payload.projectId)) set({ sprints: upsert(s.sprints, payload) });
        break;
      case 'sprint.deleted':
        set({ sprints: without(s.sprints, payload.id) });
        break;
      case 'user.upserted':
        set({ users: upsert(s.users, payload), me: s.me?.id === payload.id ? { ...s.me, ...payload } : s.me });
        break;
      case 'notification.created':
        if (payload.userId !== s.me?.id || s.notifications.some((n) => n.id === payload.id)) break;
        set({ notifications: [payload, ...s.notifications] });
        get().toast({ kind: 'info', title: payload.title, body: payload.body });
        break;
      case 'presence':
        set({ online: { ...s.online, [payload.userId]: payload.online ? Date.now() : 0 } });
        break;
      default:
        set({ tick: s.tick + 1 });
    }
  };

  const start = async (session: Session) => {
    try {
      localStorage.setItem(TOKEN_KEY, session.token);
    } catch { /* private mode */ }
    set({ me: session.user, workspace: session.workspace, status: 'loading' });
    unsubscribe?.();
    unsubscribe = backend().subscribe(onEvent);
    await get().refresh();
    set({ status: 'ready', online: { ...get().online, [session.user.id]: Date.now() } });
  };

  return {
    status: 'boot', me: null, workspace: null, users: [], projects: [], sprints: [], tasks: [], notifications: [], online: {}, toasts: [], tick: 0,

    async init() {
      if (get().status !== 'boot') return;
      let token: string | null = null;
      try {
        token = localStorage.getItem(TOKEN_KEY);
      } catch { /* blocked */ }
      if (!token) return set({ status: 'anon' });
      try {
        await start(await backend().restore(token));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        set({ status: 'anon' });
      }
    },

    login: async (email, password) => start(await guard(backend().login(email, password))),
    register: async (input) => start(await guard(backend().register(input))),

    logout() {
      backend().logout();
      unsubscribe?.();
      unsubscribe = null;
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch { /* ignore */ }
      set({ status: 'anon', me: null, workspace: null, users: [], projects: [], sprints: [], tasks: [], notifications: [] });
    },

    async refresh() {
      const snap = await guard(backend().bootstrap());
      set({ ...snap, me: snap.users.find((u) => u.id === get().me?.id) ?? get().me });
    },

    toast(t) {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
      setTimeout(() => get().dismiss(id), t.kind === 'error' ? 6000 : 4000);
    },
    dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    async createProject(i) {
      const p = await guard(backend().createProject(i));
      set({ projects: upsert(get().projects, p) });
      return p;
    },
    async updateProject(id, i) {
      const p = await guard(backend().updateProject(id, i));
      set({ projects: upsert(get().projects, p) });
      return p;
    },
    async deleteProject(id) {
      await guard(backend().deleteProject(id));
      onEvent('project.deleted', { id });
    },

    async createSprint(projectId, i) {
      const s = await guard(backend().createSprint(projectId, i));
      set({ sprints: upsert(get().sprints, s) });
      return s;
    },
    async startSprint(id) {
      const s = await guard(backend().startSprint(id));
      set({ sprints: upsert(get().sprints, s) });
      get().toast({ kind: 'success', title: `${s.name} started` });
    },
    async completeSprint(id) {
      const { sprint, carriedOver } = await guard(backend().completeSprint(id));
      set({ sprints: upsert(get().sprints, sprint), tasks: get().tasks.map((t) => (t.sprintId === id && t.status !== 'DONE' ? { ...t, sprintId: null } : t)) });
      get().toast({ kind: 'success', title: `${sprint.name} completed`, body: carriedOver ? `${carriedOver} unfinished task(s) moved to the backlog` : 'Everything was done 🎉' });
    },
    async deleteSprint(id) {
      await guard(backend().deleteSprint(id));
      set({ sprints: without(get().sprints, id), tasks: get().tasks.map((t) => (t.sprintId === id ? { ...t, sprintId: null } : t)) });
    },

    async createTask(i) {
      const t = await guard(backend().createTask(i));
      set({ tasks: upsert(get().tasks, t) });
      return t;
    },
    /** Optimistic: the card moves instantly and rolls back if the server says no. */
    async updateTask(id, patch) {
      const prev = get().tasks.find((t) => t.id === id);
      if (prev) {
        const optimistic = { ...prev, ...patch };
        if (patch.status && patch.status !== prev.status) optimistic.completedAt = patch.status === 'DONE' ? new Date().toISOString() : null;
        set({ tasks: upsert(get().tasks, optimistic) });
      }
      try {
        const t = await backend().updateTask(id, patch);
        set({ tasks: upsert(get().tasks, t) });
        return t;
      } catch (e) {
        if (prev) set({ tasks: upsert(get().tasks, prev) });
        fail(e);
        return null;
      }
    },
    async deleteTask(id) {
      await guard(backend().deleteTask(id));
      set({ tasks: without(get().tasks, id) });
    },

    async markRead(id) {
      set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) });
      await backend().markRead(id).catch(() => undefined);
    },
    async markAllRead() {
      set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) });
      await backend().markAllRead().catch(() => undefined);
    },

    async inviteUser(i) {
      const u = await guard(backend().inviteUser(i));
      set({ users: upsert(get().users, u) });
      return u;
    },
    async updateUser(id, i) {
      const u = await guard(backend().updateUser(id, i));
      set({ users: upsert(get().users, u) });
    },
  };
});

export const useMe = () => useStore((s) => s.me);
