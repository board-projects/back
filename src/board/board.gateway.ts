import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

interface Point {
  x: number;
  y: number;
}

interface DrawLine {
  from: Point;
  to: Point;
  color: string;
  size: number;
}

function boardRoom(client: Socket): string | null {
  const reference: unknown = client.handshake.auth.reference;
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) {
    return null;
  }

  return `board:${reference}`;
}

@WebSocketGateway({
  namespace: '/board',
  cors: {
    origin: '*',
  },
})
export class AppGateway implements OnGatewayConnection<Socket> {
  async handleConnection(client: Socket) {
    const room = boardRoom(client);
    if (!room) {
      client.disconnect();
      return;
    }

    try {
      await client.join(room);
      if (client.connected) client.emit('board-ready');
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('draw-line')
  handleDrawLine(@ConnectedSocket() client: Socket, @MessageBody() data: DrawLine) {
    const room = boardRoom(client);
    if (!room || !client.rooms.has(room)) return;

    client.to(room).emit('draw-line', data);
  }
}
