import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { parseBoardChanges, type BoardUpdate } from './board.protocol';
import { captureBoardPage } from './board-page-capture';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';
import { PublishedBoard, type SheetLayout } from './entities/published-board.entity';

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

function publicSnapshot(snapshot: BoardUpdate): BoardUpdate {
  return {
    ...snapshot,
    changes: snapshot.changes.map((change) => {
      if (change.kind !== 'clozeTests' || typeof change.item?.content !== 'string') return change;
      const content = change.item.content.replace(/\[[^\]]*\]|\{\{[^}]*\}\}/g, '[ ]');
      return { ...change, item: { ...change.item, content } };
    }),
  };
}

@Injectable()
export class BoardPublicationService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(PublishedBoard) private readonly publications: Repository<PublishedBoard>,
    private readonly rooms: BoardRoomService,
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
      : this.validateDraft(itemReference, draft);
    return this.save(reference, itemReference, page.title, page.layout, page.snapshot);
  }

  private validateDraft(itemReference: string, draft: unknown) {
    if (!draft || typeof draft !== 'object') throw new BadRequestException('Invalid page snapshot');
    const { page, changes } = draft as { page?: unknown; changes?: unknown };
    if (!Array.isArray(changes)) throw new BadRequestException('Invalid page snapshot');

    const items = parseBoardChanges([{ kind: 'sheets', id: itemReference, item: page }, ...changes]);
    if (!items || !items[0].item || items.slice(1).some((change) => change.kind === 'sheets' || !change.item)) {
      throw new BadRequestException('Invalid page snapshot');
    }
    return captureBoardPage({ revision: 0, changes: items }, itemReference);
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
    const published = await this.publications.findOneBy({ publicReference: reference });
    if (!published) throw new NotFoundException('Published page not found');

    return { title: published.title, layout: published.layout, snapshot: published.snapshot };
  }
}
