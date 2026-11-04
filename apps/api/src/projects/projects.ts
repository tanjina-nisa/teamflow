import {
  BadRequestException,
  Body,
  ConflictException,
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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project, Sprint, Task, User } from '../entities';
import { CurrentUser, Roles, defined, type AuthUser } from '../common/auth';
import { ProjectDto, SprintDto, UpdateProjectDto } from '../common/dto';
import { ActivityService } from '../activity/activity';
import { NotificationsService } from '../notifications/notifications';
import { EventsGateway } from '../realtime/events.gateway';

export type ProjectView = Omit<Project, 'members'> & { memberIds: string[] };

export const toView = (p: Project): ProjectView => {
  const { members, ...rest } = p;
  return { ...rest, memberIds: (members ?? []).map((m) => m.id) };
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly repo: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Admins and PMs see every project; developers and testers only see projects they belong to. */
  async visible(me: AuthUser): Promise<Project[]> {
    const all = await this.repo.find({ where: { workspaceId: me.workspaceId }, relations: { members: true }, order: { createdAt: 'ASC' } });
    if (me.role === 'ADMIN' || me.role === 'PM') return all;
    return all.filter((p) => p.members.some((m) => m.id === me.id));
  }

  async get(me: AuthUser, id: string): Promise<Project> {
    const p = await this.repo.findOne({ where: { id, workspaceId: me.workspaceId }, relations: { members: true } });
    if (!p) throw new NotFoundException('Project not found');
    if (me.role !== 'ADMIN' && me.role !== 'PM' && !p.members.some((m) => m.id === me.id)) {
      throw new ForbiddenException('You are not a member of this project');
    }
    return p;
  }

  async members(me: AuthUser, ids: string[] = []) {
    if (!ids.length) return [];
    const found = await this.users.findBy({ id: In(ids), workspaceId: me.workspaceId });
    if (found.length !== new Set(ids).size) throw new BadRequestException('Unknown member id');
    return found;
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly svc: ProjectsService,
    @InjectRepository(Project) private readonly repo: Repository<Project>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly rt: EventsGateway,
  ) {}

  @Get() async list(@CurrentUser() me: AuthUser) {
    return (await this.svc.visible(me)).map(toView);
  }

  @Get(':id') async one(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return toView(await this.svc.get(me, id));
  }

  @Roles('PM') @Post() async create(@CurrentUser() me: AuthUser, @Body() dto: ProjectDto) {
    if (await this.repo.exists({ where: { workspaceId: me.workspaceId, key: dto.key } })) {
      throw new ConflictException(`Project key ${dto.key} is already used`);
    }
    const ids = [...new Set([me.id, ...(dto.memberIds ?? [])])];
    const members = await this.svc.members(me, ids);
    const p = await this.repo.save(
      this.repo.create({ ...dto, workspaceId: me.workspaceId, ownerId: me.id, members, description: dto.description ?? '' }),
    );
    const view = toView(p);
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, action: 'project.created', message: `created project ${p.name}` });
    for (const m of members.filter((u) => u.id !== me.id)) {
      await this.notifications.notify(m.id, { type: 'project', title: `Added to ${p.name}`, body: `${me.name} added you to the project`, link: `/projects/${p.id}` });
    }
    this.rt.toWorkspace(me.workspaceId, 'project.upserted', view);
    return view;
  }

  @Roles('PM') @Patch(':id') async update(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    const p = await this.svc.get(me, id);
    const { memberIds, ...fields } = dto;
    Object.assign(p, defined(fields));
    if (memberIds) {
      const before = new Set(p.members.map((m) => m.id));
      p.members = await this.svc.members(me, memberIds);
      for (const m of p.members.filter((u) => !before.has(u.id))) {
        await this.notifications.notify(m.id, { type: 'project', title: `Added to ${p.name}`, body: `${me.name} added you to the project`, link: `/projects/${p.id}` });
      }
    }
    const view = toView(await this.repo.save(p));
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, action: 'project.updated', message: `updated project ${p.name}` });
    this.rt.toWorkspace(me.workspaceId, 'project.upserted', view);
    return view;
  }

  @Roles('ADMIN') @Delete(':id') async remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.svc.get(me, id);
    await this.repo.remove(p);
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, action: 'project.deleted', message: `deleted project ${p.name}` });
    this.rt.toWorkspace(me.workspaceId, 'project.deleted', { id });
    return { ok: true };
  }

  // ----- Sprints -----

  @Get(':id/sprints') async listSprints(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.get(me, id);
    return this.sprints.find({ where: { projectId: id }, order: { startDate: 'ASC' } });
  }

  @Roles('PM') @Post(':id/sprints') async createSprint(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SprintDto) {
    const p = await this.svc.get(me, id);
    if (dto.endDate < dto.startDate) throw new BadRequestException('Sprint ends before it starts');
    const s = await this.sprints.save(this.sprints.create({ ...dto, goal: dto.goal ?? '', projectId: p.id }));
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, action: 'sprint.created', message: `planned ${s.name} in ${p.name}` });
    this.rt.toWorkspace(me.workspaceId, 'sprint.upserted', s);
    return s;
  }
}

@Controller('sprints')
export class SprintsController {
  constructor(
    private readonly projects: ProjectsService,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly activity: ActivityService,
    private readonly rt: EventsGateway,
  ) {}

  private async load(me: AuthUser, id: string) {
    const s = await this.sprints.findOneBy({ id });
    if (!s) throw new NotFoundException('Sprint not found');
    const p = await this.projects.get(me, s.projectId);
    return { s, p };
  }

  @Roles('PM') @Post(':id/start') async start(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { s, p } = await this.load(me, id);
    if (await this.sprints.exists({ where: { projectId: p.id, status: 'ACTIVE' } })) {
      throw new ConflictException('Another sprint is already active in this project');
    }
    s.status = 'ACTIVE';
    await this.sprints.save(s);
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, projectId: p.id, action: 'sprint.started', message: `started ${s.name}` });
    this.rt.toWorkspace(me.workspaceId, 'sprint.upserted', s);
    return s;
  }

  /** Completes the sprint and moves unfinished tasks back to the backlog. */
  @Roles('PM') @Post(':id/complete') async complete(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { s, p } = await this.load(me, id);
    s.status = 'COMPLETED';
    await this.sprints.save(s);
    const open = await this.tasks.find({ where: { sprintId: s.id } });
    const carried = open.filter((t) => t.status !== 'DONE');
    for (const t of carried) {
      t.sprintId = null;
      await this.tasks.save(t);
      this.rt.toWorkspace(me.workspaceId, 'task.upserted', t);
    }
    await this.activity.log({
      workspaceId: me.workspaceId,
      actorId: me.id,
      projectId: p.id,
      action: 'sprint.completed',
      message: `completed ${s.name} (${open.length - carried.length} done, ${carried.length} moved to backlog)`,
    });
    this.rt.toWorkspace(me.workspaceId, 'sprint.upserted', s);
    return { sprint: s, carriedOver: carried.length };
  }

  @Roles('PM') @Delete(':id') async remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { s } = await this.load(me, id);
    await this.tasks.update({ sprintId: s.id }, { sprintId: null });
    await this.sprints.remove(s);
    this.rt.toWorkspace(me.workspaceId, 'sprint.deleted', { id });
    return { ok: true };
  }
}
