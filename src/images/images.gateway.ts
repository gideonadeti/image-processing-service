import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway()
export class ImagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: Socket) {
    console.log(`Client with id ${client.id} connected`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client with id ${client.id} disconnected`);
  }
}
