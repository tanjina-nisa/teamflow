import { Controller, Get, Injectable, Logger, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Notification, Project, Task } from '../entities';
import { CurrentUser, type AuthUser } from '../common/auth';
import { EventsGateway } from '../realtime/events.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly rt: EventsGateway,
  ) {}

  async notify(userId: string | null | undefined, n: { type: string; title: string; body?: string; link?: string }) {
    if (!userId) return null;
    const row = await this.repo.save(this.repo.create({ userId, body: '', link: '', ...n }));
    this.rt.toUser(userId, 'notification.created', row);
    return row;
  }

  list(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async markRead(userId: string, id: string) {
    await this.repo.update({ id, userId }, { read: true });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.repo.update({ userId, read: false }, { read: true });
    return { ok: true };
  }
}

/** Hourly job: tasks due within 24h (or overdue) that are not done get one reminder for the assignee. */
@Injectable()
export class DeadlineReminders {
  private readonly log = new Logger('DeadlineReminders');

  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(now = new Date()) {
    const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const due = await this.tasks.find({
      where: {
        status: Not('DONE'),
        dueDate: LessThanOrEqual(horizon),
        reminderSentAt: IsNull(),
        assigneeId: Not(IsNull()),
      },
      take: 500,
    });
    if (!due.length) return 0;
    const projects = await this.projects.findBy({ id: In([...new Set(due.map((t) => t.projectId))]) });
    const keyOf = new Map(projects.map((p) => [p.id, p.key]));
    const today = now.toISOString().slice(0, 10);
    for (const t of due) {
      const overdue = (t.dueDate as string) < today;
      await this.notifications.notify(t.assigneeId, {
        type: 'deadline',
        title: overdue ? `Overdue: ${keyOf.get(t.projectId)}-${t.number}` : `Due soon: ${keyOf.get(t.projectId)}-${t.number}`,
        body: `${t.title} — due ${t.dueDate}`,
        link: `/projects/${t.projectId}?task=${t.id}`,
      });
      await this.tasks.update(t.id, { reminderSentAt: now });
    }
    this.log.log(`Sent ${due.length} deadline reminder(s)`);
    return due.length;
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@CurrentUser() me: AuthUser) {
    return this.svc.list(me.id);
  }

  @Patch(':id/read') read(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(me.id, id);
  }

  @Post('read-all') readAll(@CurrentUser() me: AuthUser) {
    return this.svc.markAllRead(me.id);
  }
}
