import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { User, Workspace } from '../entities';
import { CurrentUser, Public, Roles, defined, type AuthUser, type JwtPayload } from '../common/auth';
import { InviteUserDto, LoginDto, RegisterDto, UpdateUserDto } from '../common/dto';
import { ActivityService } from '../activity/activity';
import { EventsGateway } from '../realtime/events.gateway';

const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#22c55e'];
export const pickColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly ds: DataSource,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  sign(u: User) {
    const payload: JwtPayload = { sub: u.id, ws: u.workspaceId, role: u.role, name: u.name };
    return this.jwt.signAsync(payload);
  }

  async session(u: User) {
    const { passwordHash: _omit, ...user } = u as User & { passwordHash?: string };
    const workspace = await this.ds.getRepository(Workspace).findOneByOrFail({ id: u.workspaceId });
    return { token: await this.sign(u), user, workspace };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ where: { email } })) throw new ConflictException('Email already registered');
    const user = await this.ds.transaction(async (m) => {
      let slug = slugify(dto.workspaceName);
      if (await m.exists(Workspace, { where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const ws = await m.save(m.create(Workspace, { name: dto.workspaceName, slug }));
      return m.save(
        m.create(User, {
          workspaceId: ws.id,
          name: dto.name,
          email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: 'ADMIN',
          title: 'Workspace admin',
          color: pickColor(email),
        }),
      );
    });
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :e', { e: dto.email.toLowerCase() })
      .getOne();
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    return this.session(user);
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Public() @Post('register') register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public() @HttpCode(200) @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me') async me(@CurrentUser() me: AuthUser) {
    const u = await this.users.findOneBy({ id: me.id });
    if (!u) throw new UnauthorizedException();
    return this.auth.session(u);
  }
}

@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly activity: ActivityService,
    private readonly rt: EventsGateway,
  ) {}

  @Get() list(@CurrentUser() me: AuthUser) {
    return this.users.find({ where: { workspaceId: me.workspaceId }, order: { createdAt: 'ASC' } });
  }

  /** Admin adds a team member with a starting password (no email service needed). */
  @Roles('ADMIN') @Post() async invite(@CurrentUser() me: AuthUser, @Body() dto: InviteUserDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ where: { email } })) throw new ConflictException('Email already registered');
    const { passwordHash: _h, ...u } = await this.users.save(
      this.users.create({
        workspaceId: me.workspaceId,
        name: dto.name,
        email,
        role: dto.role,
        title: dto.title ?? '',
        color: pickColor(email),
        passwordHash: await bcrypt.hash(dto.password, 10),
      }),
    );
    await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, action: 'user.invited', message: `added ${u.name} as ${u.role}` });
    this.rt.toWorkspace(me.workspaceId, 'user.upserted', u);
    return u;
  }

  @Roles('ADMIN') @Patch(':id') async update(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const u = await this.users.findOneBy({ id, workspaceId: me.workspaceId });
    if (!u) throw new NotFoundException();
    if (id === me.id && dto.role && dto.role !== 'ADMIN') throw new BadRequestException('You cannot remove your own admin role');
    Object.assign(u, defined(dto));
    const saved = await this.users.save(u);
    if (dto.role) await this.activity.log({ workspaceId: me.workspaceId, actorId: me.id, action: 'user.role', message: `changed ${u.name}'s role to ${dto.role}` });
    this.rt.toWorkspace(me.workspaceId, 'user.upserted', saved);
    return saved;
  }

  @Roles('ADMIN') @Delete(':id') async deactivate(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new BadRequestException('You cannot deactivate yourself');
    const u = await this.users.findOneBy({ id, workspaceId: me.workspaceId });
    if (!u) throw new NotFoundException();
    u.active = false;
    const saved = await this.users.save(u);
    this.rt.toWorkspace(me.workspaceId, 'user.upserted', saved);
    return saved;
  }
}
