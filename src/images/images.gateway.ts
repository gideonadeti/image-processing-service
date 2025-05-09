import { Logger, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { WsJwtAuthGuard } from 'src/auth/ws-jwt-auth.guard';
import { wsJwtAuthMiddleware } from 'src/auth/ws-jwt-auth.middleware';

@WebSocketGateway()
@UseGuards(WsJwtAuthGuard)
export class ImagesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly authService: AuthService) {}

  private userSocketMap = new Map<string, string>();

  afterInit(server: Server) {
    server.use(wsJwtAuthMiddleware(this.authService));

    Logger.log('WebSocket server initialized');
  }
  handleConnection(client: Socket & { user: any }) {
    const userId = client.user.id;

    this.userSocketMap.set(userId, client.id);

    Logger.log(`Client with id ${client.id} connected`, ImagesGateway.name);
  }

  handleDisconnect(client: Socket & { user: any }) {
    const userId = client.user.id;

    this.userSocketMap.delete(userId);

    Logger.log(`Client with id ${client.id} disconnected`, ImagesGateway.name);
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any) {
    return `Hello client with id ${client.id}, you sent: ${payload}`;
  }
}
