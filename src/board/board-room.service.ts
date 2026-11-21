import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { BoardChange, BoardPatch, BoardUpdate } from './board.protocol';

const REVISION = '__revision';

// Keep the revision and all entity updates in one atomic Redis operation.
// Retain the last acknowledged sequence per client so a reconnect can retry safely.
const APPLY_PATCH = `
local previous = redis.call('GET', KEYS[2])
if previous then
  local sequence, revision = string.match(previous, '(%d+):(%d+)')
  if tonumber(sequence) >= tonumber(ARGV[1]) then return {tonumber(revision), 0} end
end
for i = 2, #ARGV, 2 do
  if ARGV[i + 1] == '' then
    redis.call('HDEL', KEYS[1], ARGV[i])
  else
    redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
  end
end
local revision = redis.call('HINCRBY', KEYS[1], '__revision', 1)
redis.call('SET', KEYS[2], ARGV[1] .. ':' .. revision, 'EX', 86400)
return {revision, 1}
`;

const roomKey = (reference: string) => `board:v1:{${reference}}`;

@Injectable()
export class BoardRoomService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async snapshot(reference: string): Promise<BoardUpdate> {
    const data = await this.redis.hgetall(roomKey(reference));
    const revision = Number(data[REVISION] ?? 0);
    delete data[REVISION];
    return { revision, changes: Object.values(data).map((item) => JSON.parse(item) as BoardChange) };
  }

  async apply(reference: string, patch: BoardPatch) {
    const key = roomKey(reference);
    const changes = patch.changes.flatMap((change) => [
      `${change.kind}:${change.id}`,
      change.item ? JSON.stringify(change) : '',
    ]);
    const [revision, applied] = await this.redis.eval(
      APPLY_PATCH, 2, key, `${key}:client:${patch.clientId}`, String(patch.sequence), ...changes,
    ) as [number, number];
    return { revision, applied: applied === 1 };
  }
}
