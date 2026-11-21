import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { BoardRoomService } from './board-room.service';
import { isBoardIdentifier, parseBoardPatch } from './board.protocol';

@WebSocketGateway({
  namespace: '/board',
  cors: { origin: '*' },
})
export class AppGateway {
  constructor(private readonly boards: BoardRoomService) {}

  @SubscribeMessage('board:join')
  async join(@ConnectedSocket() client: Socket) {
    const reference: unknown = client.handshake.auth.reference;
    if (!isBoardIdentifier(reference)) return { ok: false };
    const room = `board:${reference}`;

    try {
      await client.join(room);
      return { ok: true, ...await this.boards.snapshot(reference) };
    } catch {
      await client.leave(room);
      return { ok: false };
    }
  }

  @SubscribeMessage('board:patch')
  async patch(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const reference: unknown = client.handshake.auth.reference;
    if (!isBoardIdentifier(reference)) return { ok: false };
    const room = `board:${reference}`;
    const patch = parseBoardPatch(payload);
    if (!client.rooms.has(room) || !patch) return { ok: false };

    try {
      const { revision, applied } = await this.boards.apply(reference, patch);
      if (applied) client.to(room).emit('board:update', { revision, changes: patch.changes });
      return { ok: true, revision, applied };
    } catch {
      return { ok: false };
    }
  }
}
