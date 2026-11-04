import type { Socket } from 'socket.io-client';
import { ApiError, type Attachment } from '../types';
import { downloadBlob } from '../logic';
import type { Backend, EventHandler, ServerEvent } from './types';

const EVENTS: ServerEvent[] = [
  'task.upserted', 'task.deleted', 'project.upserted', 'project.deleted', 'sprint.upserted', 'sprint.deleted',
  'user.upserted', 'comment.created', 'attachment.created', 'attachment.deleted', 'activity.created', 'notification.created', 'presence',
];

/** Talks to the NestJS API over REST and listens to Socket.IO for live updates. */
export function createHttpBackend(baseUrl: string): Backend {
  const base = baseUrl.replace(/\/$/, '');
  let token = '';
  let socket: Socket | null = null;
  const handlers = new Set<EventHandler>();

  async function req<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = Array.isArray(j.message) ? j.message.join(', ') : j.message || msg;
      } catch { /* not json */ }
      throw new ApiError(res.status, msg);
    }
    if (raw) return (await res.blob()) as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function connect() {
    if (socket || !token) return;
    const { io } = await import('socket.io-client');
    socket = io(base, { auth: { token }, transports: ['websocket', 'polling'] });
    for (const e of EVENTS) socket.on(e, (p: unknown) => handlers.forEach((h) => h(e, p)));
  }

  const withSession = async <T extends { token: string }>(p: Promise<T>) => {
    const s = await p;
    token = s.token;
    void connect();
    return s;
  };

  return {
    mode: 'api',
    login: (email, password) => withSession(req('POST', '/auth/login', { email, password })),
    register: (input) => withSession(req('POST', '/auth/register', input)),
    restore: (t) => {
      token = t;
      return withSession(req('GET', '/auth/me'));
    },
    logout: () => {
      token = '';
      socket?.disconnect();
      socket = null;
    },
    bootstrap: () => req('GET', '/workspace/bootstrap'),

    createProject: (input) => req('POST', '/projects', input),
    updateProject: (id, input) => req('PATCH', `/projects/${id}`, input),
    deleteProject: async (id) => { await req('DELETE', `/projects/${id}`); },

    createSprint: (projectId, input) => req('POST', `/projects/${projectId}/sprints`, input),
    startSprint: (id) => req('POST', `/sprints/${id}/start`),
    completeSprint: (id) => req('POST', `/sprints/${id}/complete`),
    deleteSprint: async (id) => { await req('DELETE', `/sprints/${id}`); },

    createTask: (input) => req('POST', '/tasks', input),
    updateTask: (id, patch) => req('PATCH', `/tasks/${id}`, patch),
    deleteTask: async (id) => { await req('DELETE', `/tasks/${id}`); },

    listComments: (taskId) => req('GET', `/tasks/${taskId}/comments`),
    addComment: (taskId, body) => req('POST', `/tasks/${taskId}/comments`, { body }),
    listAttachments: (taskId) => req('GET', `/tasks/${taskId}/attachments`),
    uploadAttachment: (taskId, file) => {
      const f = new FormData();
      f.append('file', file);
      return req('POST', `/tasks/${taskId}/attachments`, f);
    },
    downloadAttachment: async (a: Attachment) => downloadBlob(await req<Blob>('GET', `/tasks/${a.taskId}/attachments/${a.id}`, undefined, true), a.filename),
    deleteAttachment: async (a) => { await req('DELETE', `/tasks/${a.taskId}/attachments/${a.id}`); },

    listActivity: (f = {}) => {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return req('GET', `/activity?${q}`);
    },
    markRead: async (id) => { await req('PATCH', `/notifications/${id}/read`); },
    markAllRead: async () => { await req('POST', '/notifications/read-all'); },

    inviteUser: (input) => req('POST', '/users', input),
    updateUser: (id, input) => req('PATCH', `/users/${id}`, input),

    exportCsv: (projectId) => req('GET', `/reports/export.csv${projectId ? `?projectId=${projectId}` : ''}`, undefined, true),
    subscribe: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}
