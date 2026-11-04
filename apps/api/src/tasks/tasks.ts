import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import { DataSource, Repository } from 'typeorm';
import { Attachment, Comment, Project, Task, User, type TaskStatus } from '../entities';
import { CurrentUser, Roles, defined, type AuthUser } from '../common/auth';
import { CommentDto, TaskDto, UpdateTaskDto } from '../common/dto';
import { ActivityService } from '../activity/activity';
import { NotificationsService } from '../notifications/notifications';
import { EventsGateway } from '../realtime/events.gateway';
import { ProjectsService } from '../projects/projects';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const MAX_UPLOAD = 10 * 1024 * 1024;

const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done' };

/** Business rules shared by every task mutation. */
export function checkTaskRules(me: AuthUser, before: Partial<Task>, patch: Partial<Task>) {
  const lead = me.role === 'ADMIN' || me.role === 'PM';
  if (patch.status === 'DONE' && before.status !== 'DONE' && !lead && me.role !== 'TESTER') {
    throw new ForbiddenException('Only testers, project managers and admins can mark a task Done (QA gate)');
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId && !lead) {
    if (patch.assigneeId !== null && patch.assigneeId !== me.id) {
      throw new ForbiddenException('Only project managers can assign tasks to other people');
    }
  }
}

@Injectable()
export class TasksService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Task) private readonly repo: Repository<Task>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly rt: EventsGateway,
  ) {}

  async load(me: AuthUser, id: string) {
    const t = await this.repo.findOneBy({ id, workspaceId: me.workspaceId });
    if (!t) throw new NotFoundException('Task not found');
    const p = await this.projects.get(me, t.projectId);
    return { t, p };
  }

  private ref(p: Project, t: Task) {
    return `${p.key}-${t.number}`;
  }

  private async assertMember(p: Project, userId: string | null | undefined) {
    if (userId && !p.members.some((m) => m.id === userId)) throw new BadRequestException('Assignee must be a project member');
  }

  async create(me: AuthUser, dto: TaskDto) {
    const p = await this.projects.get(me, dto.projectId);
    const patch: Partial<Task> = { ...dto };
    checkTaskRules(me, { status: 'TODO', assigneeId: null }, patch);
    await this.assertMember(p, dto.assigneeId);

    const t = await this.ds.transaction(async (m) => {
      // Atomic per-project counter → stable human keys like WEB-42.
      const res = await m.query(`UPDATE projects SET "taskSeq" = "taskSeq" + 1 WHERE id = $1 RETURNING "taskSeq"`, [p.id]);
      const rows = Array.isArray(res[0]) ? res[0] : res; // driver returns [rows, count] for UPDATE … RETURNING
      const taskSeq = Number(rows[0].taskSeq);
      const maxOrder = await m
        .createQueryBuilder(Task, 't')
        .select('COALESCE(MAX(t.order), 0)', 'max')
        .where('t.projectId = :p AND t.status = :s', { p: p.id, s: dto.status ?? 'TODO' })
        .getRawOne<{ max: number }>();
      return m.save(
        m.create(Task, {
          ...dto,
          description: dto.description ?? '',
          labels: dto.labels ?? [],
          workspaceId: me.workspaceId,
          number: Number(taskSeq),
          reporterId: me.id,
          order: Number(maxOrder?.max ?? 0) + 1000,
          completedAt: dto.status === 'DONE' ? new Date() : null,
        }),
      );
    });

    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'task.created', message: `created ${this.ref(p, t)} “${t.title}”` });
    if (t.assigneeId && t.assigneeId !== me.id) {
      await this.notifications.notify(t.assigneeId, { type: 'assigned', title: `${me.name} assigned you ${this.ref(p, t)}`, body: t.title, link: `/projects/${p.id}?task=${t.id}` });
    }
    this.rt.toWorkspace(me.workspaceId, 'task.upserted', t);
    return t;
  }

  async update(me: AuthUser, id: string, dto: UpdateTaskDto) {
    const { t, p } = await this.load(me, id);
    checkTaskRules(me, t, dto as Partial<Task>);
    if (dto.assigneeId !== undefined) await this.assertMember(p, dto.assigneeId);

    const before = { ...t };
    Object.assign(t, defined(dto));
    if (dto.status && dto.status !== before.status) t.completedAt = dto.status === 'DONE' ? new Date() : null;
    if (dto.dueDate !== undefined && dto.dueDate !== before.dueDate) t.reminderSentAt = null;
    const saved = await this.repo.save(t);
    const ref = this.ref(p, t);
    const link = `/projects/${p.id}?task=${t.id}`;

    if (dto.status && dto.status !== before.status) {
      await this.activity.log({
        workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'task.moved',
        message: `moved ${ref} from ${STATUS_LABEL[before.status]} to ${STATUS_LABEL[dto.status]}`,
        meta: { from: before.status, to: dto.status },
      });
      if (dto.status === 'REVIEW') {
        for (const tester of p.members.filter((m) => m.role === 'TESTER' && m.id !== me.id)) {
          await this.notifications.notify(tester.id, { type: 'review', title: `${ref} is ready for review`, body: t.title, link });
        }
      }
      if (t.reporterId && t.reporterId !== me.id && dto.status === 'DONE') {
        await this.notifications.notify(t.reporterId, { type: 'status', title: `${ref} is done`, body: t.title, link });
      }
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== before.assigneeId) {
      const who = dto.assigneeId ? (await this.users.findOneBy({ id: dto.assigneeId }))?.name : null;
      await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'task.assigned', message: who ? `assigned ${ref} to ${who}` : `unassigned ${ref}` });
      if (dto.assigneeId && dto.assigneeId !== me.id) {
        await this.notifications.notify(dto.assigneeId, { type: 'assigned', title: `${me.name} assigned you ${ref}`, body: t.title, link });
      }
    }
    const fieldChanges = (['title', 'priority', 'points', 'dueDate', 'sprintId', 'description'] as const).filter(
      (k) => dto[k] !== undefined && JSON.stringify(dto[k]) !== JSON.stringify(before[k]),
    );
    if (fieldChanges.length) {
      await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'task.updated', message: `updated ${fieldChanges.join(', ')} on ${ref}` });
    }
    this.rt.toWorkspace(me.workspaceId, 'task.upserted', saved);
    return saved;
  }

  async remove(me: AuthUser, id: string) {
    const { t, p } = await this.load(me, id);
    await this.repo.remove(t);
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, action: 'task.deleted', message: `deleted ${p.key}-${t.number} “${t.title}”` });
    this.rt.toWorkspace(me.workspaceId, 'task.deleted', { id });
    return { ok: true };
  }
}

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly svc: TasksService,
    private readonly projects: ProjectsService,
    @InjectRepository(Task) private readonly repo: Repository<Task>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly rt: EventsGateway,
  ) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  @Get() async list(@CurrentUser() me: AuthUser, @Query('projectId') projectId?: string, @Query('sprintId') sprintId?: string, @Query('assigneeId') assigneeId?: string) {
    const visible = (await this.projects.visible(me)).map((p) => p.id);
    if (!visible.length) return [];
    const qb = this.repo.createQueryBuilder('t').where('t.projectId IN (:...ids)', { ids: visible }).orderBy('t.order', 'ASC');
    if (projectId) qb.andWhere('t.projectId = :p', { p: projectId });
    if (sprintId) qb.andWhere(sprintId === 'backlog' ? 't.sprintId IS NULL' : 't.sprintId = :s', { s: sprintId });
    if (assigneeId) qb.andWhere('t.assigneeId = :a', { a: assigneeId === 'me' ? me.id : assigneeId });
    return qb.getMany();
  }

  @Get(':id') async one(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return (await this.svc.load(me, id)).t;
  }

  @Post() create(@CurrentUser() me: AuthUser, @Body() dto: TaskDto) {
    return this.svc.create(me, dto);
  }

  @Patch(':id') update(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.svc.update(me, id, dto);
  }

  @Roles('PM') @Delete(':id') remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(me, id);
  }

  // ----- Comments -----

  @Get(':id/comments') async listComments(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(me, id);
    return this.comments.find({ where: { taskId: id }, order: { createdAt: 'ASC' } });
  }

  @Post(':id/comments') async addComment(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    const { t, p } = await this.svc.load(me, id);
    const c = await this.comments.save(this.comments.create({ taskId: t.id, authorId: me.id, body: dto.body }));
    const ref = `${p.key}-${t.number}`;
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'comment.added', message: `commented on ${ref}` });

    // Notify assignee, reporter and @mentioned teammates (by first name), once each.
    const mentioned = [...dto.body.matchAll(/@([a-z][\w-]*)/gi)].map((m) => m[1].toLowerCase());
    const notify = new Set<string>([t.assigneeId, t.reporterId].filter(Boolean) as string[]);
    for (const m of p.members) if (mentioned.includes(m.name.split(' ')[0].toLowerCase())) notify.add(m.id);
    notify.delete(me.id);
    for (const uid of notify) {
      await this.notifications.notify(uid, { type: 'comment', title: `${me.name} commented on ${ref}`, body: dto.body.slice(0, 140), link: `/projects/${p.id}?task=${t.id}` });
    }
    this.rt.toWorkspace(me.workspaceId, 'comment.created', c);
    return c;
  }

  // ----- Attachments -----

  @Get(':id/attachments') async listAttachments(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(me, id);
    return this.attachments.find({ where: { taskId: id }, order: { createdAt: 'ASC' } });
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD },
      storage: diskStorage({ destination: UPLOAD_DIR, filename: (_r, _f, cb) => cb(null, randomUUID()) }),
    }),
  )
  async upload(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Send the file in a multipart field called "file"');
    const { t, p } = await this.svc.load(me, id);
    const a = await this.attachments.save(
      this.attachments.create({ taskId: t.id, uploaderId: me.id, filename: file.originalname, mimeType: file.mimetype, size: file.size, storageKey: file.filename }),
    );
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, taskId: t.id, action: 'attachment.added', message: `attached ${file.originalname} to ${p.key}-${t.number}` });
    this.rt.toWorkspace(me.workspaceId, 'attachment.created', a);
    return a;
  }

  @Get(':id/attachments/:aid') async download(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @Res() res: Response,
  ) {
    await this.svc.load(me, id);
    const a = await this.attachments.findOneBy({ id: aid, taskId: id });
    const path = a && join(UPLOAD_DIR, a.storageKey);
    if (!a || !path || !existsSync(path)) throw new NotFoundException('Attachment not found');
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.filename)}"`);
    createReadStream(path).pipe(res);
  }

  @Delete(':id/attachments/:aid') async removeAttachment(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string) {
    await this.svc.load(me, id);
    const a = await this.attachments.findOneBy({ id: aid, taskId: id });
    if (!a) throw new NotFoundException();
    if (a.uploaderId !== me.id && me.role !== 'ADMIN' && me.role !== 'PM') throw new ForbiddenException();
    await this.attachments.remove(a);
    try { unlinkSync(join(UPLOAD_DIR, a.storageKey)); } catch { /* already gone */ }
    this.rt.toWorkspace(me.workspaceId, 'attachment.deleted', { id: aid, taskId: id });
    return { ok: true };
  }
}
