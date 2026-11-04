/* Pure business logic shared by the demo backend and the UI. Mirrors apps/api. */
import { ApiError, type Project, type Role, type Task, type TaskPatch, type User } from './types';

export const isLead = (role?: Role) => role === 'ADMIN' || role === 'PM';
export const canManageProjects = isLead;
export const canDeleteTasks = isLead;
export const canManageUsers = (role?: Role) => role === 'ADMIN';
export const canMarkDone = (role?: Role) => isLead(role) || role === 'TESTER';

/** Same rules as the API's checkTaskRules: QA gate + only leads reassign to others. */
export function checkTaskRules(me: Pick<User, 'id' | 'role'>, before: Partial<Task>, patch: TaskPatch) {
  if (patch.status === 'DONE' && before.status !== 'DONE' && !canMarkDone(me.role)) {
    throw new ApiError(403, 'Only testers, project managers and admins can mark a task Done (QA gate)');
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId && !isLead(me.role)) {
    if (patch.assigneeId !== null && patch.assigneeId !== me.id) {
      throw new ApiError(403, 'Only project managers can assign tasks to other people');
    }
  }
}

export function visibleProjects(projects: Project[], me?: Pick<User, 'id' | 'role'>) {
  if (!me) return [];
  return isLead(me.role) ? projects : projects.filter((p) => p.memberIds.includes(me.id));
}

export const DAY = 86400000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (t: Task) => t.status !== 'DONE' && !!t.dueDate && t.dueDate < todayISO();
export const dueSoon = (t: Task, days = 2) =>
  t.status !== 'DONE' && !!t.dueDate && t.dueDate >= todayISO() && t.dueDate <= new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

export type Range = 'daily' | 'weekly';

export function buildProgress(tasks: Task[], users: User[], projects: Project[], range: Range, now = new Date()) {
  const from = new Date(now.getTime() - (range === 'daily' ? 1 : 7) * DAY);
  const inPeriod = (d: string | null) => !!d && new Date(d) >= from && new Date(d) <= now;
  const completed = tasks.filter((t) => t.status === 'DONE' && inPeriod(t.completedAt));
  const created = tasks.filter((t) => inPeriod(t.createdAt));
  const overdue = tasks.filter(isOverdue);
  return {
    range,
    from,
    to: now,
    completed,
    created,
    overdue,
    totals: {
      completed: completed.length,
      pointsCompleted: completed.reduce((a, t) => a + t.points, 0),
      created: created.length,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      inReview: tasks.filter((t) => t.status === 'REVIEW').length,
      overdue: overdue.length,
    },
    byMember: users
      .filter((u) => u.active)
      .map((u) => ({
        user: u,
        completed: completed.filter((t) => t.assigneeId === u.id).length,
        pointsCompleted: completed.filter((t) => t.assigneeId === u.id).reduce((a, t) => a + t.points, 0),
        open: tasks.filter((t) => t.assigneeId === u.id && t.status !== 'DONE').length,
        overdue: overdue.filter((t) => t.assigneeId === u.id).length,
      })),
    byProject: projects.map((p) => {
      const pt = tasks.filter((t) => t.projectId === p.id);
      const done = pt.filter((t) => t.status === 'DONE').length;
      return { project: p, total: pt.length, done, progress: pt.length ? Math.round((done / pt.length) * 100) : 0, completedInPeriod: completed.filter((t) => t.projectId === p.id).length };
    }),
  };
}

export function buildWorkload(tasks: Task[], users: User[]) {
  return users
    .filter((u) => u.active)
    .map((u) => {
      const open = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'DONE');
      const points = open.reduce((a, t) => a + t.points, 0);
      return {
        user: u,
        openTasks: open.length,
        openPoints: points,
        utilization: u.capacity ? Math.round((points / u.capacity) * 100) : 0,
        overdue: open.filter(isOverdue).length,
        byStatus: {
          TODO: open.filter((t) => t.status === 'TODO').reduce((a, t) => a + t.points, 0),
          IN_PROGRESS: open.filter((t) => t.status === 'IN_PROGRESS').reduce((a, t) => a + t.points, 0),
          REVIEW: open.filter((t) => t.status === 'REVIEW').reduce((a, t) => a + t.points, 0),
        },
      };
    });
}

/** Daily remaining points for a sprint (ideal vs actual). */
export function burndown(tasks: Task[], start: string, end: string, now = new Date()) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T23:59:59');
  const total = tasks.reduce((a, t) => a + t.points, 0);
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY));
  const points: { day: string; ideal: number; actual: number | null }[] = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(s.getTime() + i * DAY);
    const cutoff = new Date(d.getTime() + DAY - 1);
    const done = tasks.filter((t) => t.completedAt && new Date(t.completedAt) <= cutoff).reduce((a, t) => a + t.points, 0);
    points.push({
      day: d.toISOString().slice(5, 10),
      ideal: Math.round((total - (total * i) / days) * 10) / 10,
      actual: d <= now ? total - done : null,
    });
  }
  return { total, points };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tasksCsv(tasks: Task[], projects: Project[], users: User[]) {
  const pk = new Map(projects.map((p) => [p.id, p]));
  const un = new Map(users.map((u) => [u.id, u.name]));
  const header = ['Key', 'Title', 'Project', 'Status', 'Priority', 'Type', 'Assignee', 'Points', 'Due', 'Created', 'Completed'];
  const rows = tasks.map((t) => [
    `${pk.get(t.projectId)?.key}-${t.number}`, t.title, pk.get(t.projectId)?.name, t.status, t.priority, t.type,
    un.get(t.assigneeId ?? '') ?? '', t.points, t.dueDate ?? '', t.createdAt, t.completedAt ?? '',
  ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
