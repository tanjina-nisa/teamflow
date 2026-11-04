import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../entities';

export interface AuthUser {
  id: string;
  workspaceId: string;
  role: Role;
  name: string;
}

export interface JwtPayload {
  sub: string;
  ws: string;
  role: Role;
  name: string;
}

const IS_PUBLIC = 'isPublic';
const ROLES_KEY = 'roles';

/** Skip the JWT check (login, register, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call the route. ADMIN is always allowed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export function toAuthUser(p: JwtPayload): AuthUser {
  return { id: p.sub, workspaceId: p.ws, role: p.role, name: p.name };
}

/** Global guard: verifies the Bearer JWT, then enforces @Roles(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token as string | undefined);
    if (!token) throw new UnauthorizedException('Missing token');

    try {
      req.user = toAuthUser(await this.jwt.verifyAsync<JwtPayload>(token));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) {
      throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`);
    }
    return true;
  }
}

/** Drops keys whose value is undefined so Object.assign never blanks columns the client did not send. */
export function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
