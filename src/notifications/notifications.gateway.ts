import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { wsJwtAuthMiddleware } from 'src/auth/ws-jwt-auth.middleware';

@WebSocketGateway()
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly authService: AuthService) {}

  private userSocketMap = new Map<string, string>();

  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    server.use(wsJwtAuthMiddleware(this.authService));

    Logger.log('WebSocket server initialized', NotificationsGateway.name);
  }
  handleConnection(client: Socket & { user: any }) {
    const userId = client.user.sub;

    this.userSocketMap.set(userId, client.id);

    Logger.log(
      `Client with id ${client.id} connected`,
      NotificationsGateway.name,
    );
  }

  handleDisconnect(client: Socket & { user: any }) {
    const userId = client.user.sub;

    this.userSocketMap.delete(userId);

    Logger.log(
      `Client with id ${client.id} disconnected`,
      NotificationsGateway.name,
    );
  }

  emitToUser(userId: string, event: string, payload: any) {
    const socketId = this.userSocketMap.get(userId);

    if (socketId) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}
