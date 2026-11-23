import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { BoardUpdate } from './board.protocol';
import { publicSnapshot } from './public-board-snapshot';
import { captureBoardPage, capturePageDraft } from './board-page-capture';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';
import { PublishedBoard, type SheetLayout } from './entities/published-board.entity';

const publicPageKey = (reference: string) => `test:publication:v1:${reference}`;
type PublishedPage = { title: string; layout: SheetLayout; snapshot: BoardUpdate };

const LEGACY_PAGE = '00000000-0000-0000-0000-000000000000';

function parseLayout(value: unknown): SheetLayout {
  const { width, height, dots } = (value ?? {}) as Partial<SheetLayout>;
  const dimension = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 240 && n <= 4096;
  if (!dimension(width) || !dimension(height) || typeof dots !== 'boolean') {
    throw new BadRequestException('Page dimensions must be between 240 and 4096 pixels');
  }
  return { width, height, dots };
}

@Injectable()
export class BoardPublicationService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(PublishedBoard) private readonly publications: Repository<PublishedBoard>,
    private readonly rooms: BoardRoomService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async publish(ownerId: string, reference: string, draftLayout: unknown) {
    const layout = parseLayout(draftLayout);
    const board = await this.requireOwnedBoard(ownerId, reference);
    const snapshot = await this.rooms.snapshot(reference);
    return this.save(reference, LEGACY_PAGE, board.title, layout, snapshot);
  }

  async previewPage(reference: string, itemReference: string) {
    const page = captureBoardPage(await this.rooms.snapshot(reference), itemReference);
    return { ...page, snapshot: publicSnapshot(page.snapshot) };
  }

  async publishPage(ownerId: string, reference: string, itemReference: string, draft?: unknown) {
    await this.requireOwnedBoard(ownerId, reference);
    const page = draft === undefined
      ? await this.previewPage(reference, itemReference)
      : capturePageDraft(itemReference, draft);
    return this.save(reference, itemReference, page.title, page.layout, page.snapshot);
  }

  async publishPublicPage(draft: unknown) {
    if (!draft || typeof draft !== 'object') throw new BadRequestException('Invalid page snapshot');
    const { page } = draft as { page?: { id?: unknown } };
    if (typeof page?.id !== 'string') throw new BadRequestException('Invalid page snapshot');

    const captured = capturePageDraft(page.id, draft);
    const published: PublishedPage = { ...captured, snapshot: publicSnapshot(captured.snapshot) };
    const reference = randomUUID();
    if (await this.redis.set(publicPageKey(reference), JSON.stringify(published), 'NX') !== 'OK') {
      throw new ServiceUnavailableException('Could not create a public page. Please retry.');
    }
    return { reference };
  }

  private async requireOwnedBoard(ownerId: string, reference: string) {
    const board = await this.boards.findOneBy({ reference, ownerId });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  private async save(reference: string, itemReference: string, title: string, layout: SheetLayout, snapshot: BoardUpdate) {
    const saved = await this.publications.createQueryBuilder()
      .insert()
      .into(PublishedBoard)
      .values({
        reference,
        itemReference,
        publicReference: randomUUID(),
        title,
        layout,
        snapshot: () => 'CAST(:pageSnapshot AS jsonb)',
        publishedAt: new Date(),
      })
      .setParameter('pageSnapshot', JSON.stringify(publicSnapshot(snapshot)))
      .orUpdate(['title', 'layout', 'snapshot', 'published_at'], ['reference', 'item_reference'])
      .returning('"public_reference"')
      .execute();
    return { reference: saved.raw[0].public_reference as string };
  }

  async read(reference: string) {
    const publicPage = await this.redis.get(publicPageKey(reference));
    if (publicPage) return JSON.parse(publicPage) as PublishedPage;

    const published = await this.publications.findOneBy({ publicReference: reference });
    if (!published) throw new NotFoundException('Published page not found');

    return { title: published.title, layout: published.layout, snapshot: published.snapshot };
  }
}
