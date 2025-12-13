import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { AuthService } from 'src/auth/auth.service';
import { AuthSocket } from 'src/auth/auth-socket';
@WebSocketGateway()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly authService: AuthService) {}

  @WebSocketServer()
  server: Server;

  private logger = new Logger(NotificationsGateway.name);
  private userSocketMap = new Map<string, string>();

  private validateClient(client: AuthSocket) {
    const auth = client.handshake.auth as { token?: string };
    const token = auth.token;

    if (!token) {
      return false;
    }

    try {
      const user = this.authService.validateToken(token);

      client.user = user;

      return true;
    } catch (error) {
      this.logger.error('Failed to validate token', (error as Error).stack);

      return false;
    }
  }

  async handleConnection(client: AuthSocket) {
    this.logger.log(`Client with id ${client.id} is connecting...`);

    try {
      const isAuthenticated = this.validateClient(client);

      if (!isAuthenticated) {
        this.logger.warn(
          `Client with id ${client.id} is unauthenticated. Disconnecting...`,
        );

        client.disconnect();

        return;
      }

      const user = client.user;

      this.userSocketMap.set(user.id, client.id);
      this.logger.log(`User with id ${user.id} connected`);
    } catch (error) {
      this.logger.error(
        `Failed to authenticate client with id ${client.id}`,
        (error as Error).stack,
      );

      client.disconnect();

      return;
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (client.user) {
      this.userSocketMap.delete(client.user.id);
    }

    this.logger.log(`Client with id ${client.id} disconnected`);
  }

  emitToUser(userId: string, event: string, payload: any) {
    const socketId = this.userSocketMap.get(userId);

    if (socketId) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}
