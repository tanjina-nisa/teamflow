import { Controller, Get, Query, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { In, Repository } from 'typeorm';
import { Notification, Project, Sprint, Task, User, Workspace } from '../entities';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { ProjectsService, toView } from '../projects/projects';

type Range = 'daily' | 'weekly';
const DAY = 86400000;

export function periodStart(range: Range, now = new Date()) {
  return new Date(now.getTime() - (range === 'daily' ? 1 : 7) * DAY);
}

/** Pure report builder, also unit-tested. */
export function buildProgress(tasks: Task[], users: User[], projects: Project[], range: Range, now = new Date()) {
  const from = periodStart(range, now);
  const today = now.toISOString().slice(0, 10);
  const inPeriod = (d: Date | null) => !!d && d >= from && d <= now;
  const completed = tasks.filter((t) => t.status === 'DONE' && inPeriod(t.completedAt));
  const created = tasks.filter((t) => inPeriod(t.createdAt));
  const overdue = tasks.filter((t) => t.status !== 'DONE' && t.dueDate && t.dueDate < today);
  const byMember = users
    .filter((u) => u.active)
    .map((u) => {
      const mine = tasks.filter((t) => t.assigneeId === u.id);
      const done = completed.filter((t) => t.assigneeId === u.id);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        completed: done.length,
        pointsCompleted: done.reduce((a, t) => a + t.points, 0),
        open: mine.filter((t) => t.status !== 'DONE').length,
        overdue: overdue.filter((t) => t.assigneeId === u.id).length,
      };
    });
  const byProject = projects.map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id);
    const done = pt.filter((t) => t.status === 'DONE').length;
    return {
      projectId: p.id,
      name: p.name,
      key: p.key,
      total: pt.length,
      done,
      progress: pt.length ? Math.round((done / pt.length) * 100) : 0,
      completedInPeriod: completed.filter((t) => t.projectId === p.id).length,
    };
  });
  return {
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    totals: {
      completed: completed.length,
      pointsCompleted: completed.reduce((a, t) => a + t.points, 0),
      created: created.length,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      inReview: tasks.filter((t) => t.status === 'REVIEW').length,
      overdue: overdue.length,
    },
    byMember,
    byProject,
  };
}

/** Open story points vs. capacity for every active member. */
export function buildWorkload(tasks: Task[], users: User[]) {
  return users
    .filter((u) => u.active)
    .map((u) => {
      const open = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'DONE');
      const points = open.reduce((a, t) => a + t.points, 0);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        capacity: u.capacity,
        openTasks: open.length,
        openPoints: points,
        utilization: u.capacity ? Math.round((points / u.capacity) * 100) : 0,
        byStatus: {
          TODO: open.filter((t) => t.status === 'TODO').length,
          IN_PROGRESS: open.filter((t) => t.status === 'IN_PROGRESS').length,
          REVIEW: open.filter((t) => t.status === 'REVIEW').length,
        },
      };
    });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Controller()
export class ReportsController {
  constructor(
    private readonly projects: ProjectsService,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
  ) {}

  private async scope(me: AuthUser, projectId?: string) {
    let projects = await this.projects.visible(me);
    if (projectId) projects = projects.filter((p) => p.id === projectId);
    const ids = projects.map((p) => p.id);
    const tasks = ids.length ? await this.tasks.find({ where: { projectId: In(ids) }, order: { order: 'ASC' } }) : [];
    const users = await this.users.find({ where: { workspaceId: me.workspaceId }, order: { createdAt: 'ASC' } });
    return { projects, tasks, users };
  }

  /** Everything the web app needs on first load, in one request. */
  @Get('workspace/bootstrap') async bootstrap(@CurrentUser() me: AuthUser) {
    const { projects, tasks, users } = await this.scope(me);
    const ids = projects.map((p) => p.id);
    return {
      workspace: await this.workspaces.findOneByOrFail({ id: me.workspaceId }),
      users,
      projects: projects.map(toView),
      sprints: ids.length ? await this.sprints.find({ where: { projectId: In(ids) }, order: { startDate: 'ASC' } }) : [],
      tasks,
      notifications: await this.notifications.find({ where: { userId: me.id }, order: { createdAt: 'DESC' }, take: 100 }),
    };
  }

  @Get('reports/progress') async progress(@CurrentUser() me: AuthUser, @Query('range') range: Range = 'weekly', @Query('projectId') projectId?: string) {
    const { projects, tasks, users } = await this.scope(me, projectId);
    return buildProgress(tasks, users, projects, range === 'daily' ? 'daily' : 'weekly');
  }

  @Roles('PM') @Get('reports/workload') async workload(@CurrentUser() me: AuthUser) {
    const { tasks, users } = await this.scope(me);
    return buildWorkload(tasks, users);
  }

  @Get('reports/export.csv') async exportCsv(@CurrentUser() me: AuthUser, @Res() res: Response, @Query('projectId') projectId?: string) {
    const { projects, tasks, users } = await this.scope(me, projectId);
    const pk = new Map(projects.map((p) => [p.id, p]));
    const un = new Map(users.map((u) => [u.id, u.name]));
    const header = ['Key', 'Title', 'Project', 'Status', 'Priority', 'Type', 'Assignee', 'Points', 'Due', 'Created', 'Completed'];
    const rows = tasks.map((t) => [
      `${pk.get(t.projectId)?.key}-${t.number}`, t.title, pk.get(t.projectId)?.name, t.status, t.priority, t.type,
      un.get(t.assigneeId ?? '') ?? '', t.points, t.dueDate ?? '', t.createdAt.toISOString(), t.completedAt?.toISOString() ?? '',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="teamflow-tasks-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
  }
}
