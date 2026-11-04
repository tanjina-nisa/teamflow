import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../common/auth';

/**
 * Socket.IO gateway. Clients connect with `io(API_URL, { auth: { token } })`.
 * Each socket joins `ws:<workspaceId>` (team-wide events) and `user:<userId>` (personal notifications).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
@Injectable()
export class EventsGateway implements OnGatewayConnection {
  private readonly log = new Logger('Realtime');
  @WebSocketServer() server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.query?.token as string);
      const p = await this.jwt.verifyAsync<JwtPayload>(token);
      socket.data.user = p;
      await socket.join([`ws:${p.ws}`, `user:${p.sub}`]);
      socket.to(`ws:${p.ws}`).emit('presence', { userId: p.sub, online: true });
      socket.on('disconnect', () => socket.to(`ws:${p.ws}`).emit('presence', { userId: p.sub, online: false }));
    } catch {
      this.log.warn(`Rejected socket ${socket.id}: bad token`);
      socket.disconnect(true);
    }
  }

  toWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server?.to(`ws:${workspaceId}`).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
