import { Controller, Get, Injectable, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../entities';
import { CurrentUser, type AuthUser } from '../common/auth';
import { EventsGateway } from '../realtime/events.gateway';

export interface LogInput {
  workspaceId: string;
  actorId: string | null;
  action: string;
  message: string;
  projectId?: string | null;
  taskId?: string | null;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity) private readonly repo: Repository<Activity>,
    private readonly rt: EventsGateway,
  ) {}

  async log(input: LogInput): Promise<Activity> {
    const row = await this.repo.save(
      this.repo.create({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        message: input.message,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        meta: input.meta ?? {},
      }),
    );
    this.rt.toWorkspace(input.workspaceId, 'activity.created', row);
    return row;
  }

  list(workspaceId: string, opts: { projectId?: string; taskId?: string; limit: number }) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.workspaceId = :ws', { ws: workspaceId })
      .orderBy('a.createdAt', 'DESC')
      .take(Math.min(opts.limit, 500));
    if (opts.projectId) qb.andWhere('a.projectId = :p', { p: opts.projectId });
    if (opts.taskId) qb.andWhere('a.taskId = :t', { t: opts.taskId });
    return qb.getMany();
  }
}

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @CurrentUser() me: AuthUser,
    @Query('projectId') projectId?: string,
    @Query('taskId') taskId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit = 100,
  ) {
    return this.activity.list(me.workspaceId, { projectId, taskId, limit });
  }
}
