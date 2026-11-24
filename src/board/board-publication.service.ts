import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { BoardUpdate } from './board.protocol';
import { publicSnapshot } from './public-board-snapshot';
import { captureBoardPage, capturePageDraft } from './board-page-capture';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';
import { PublishedBoard, type SheetLayout } from './entities/published-board.entity';

@Injectable()
export class BoardPublicationService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(PublishedBoard) private readonly publications: Repository<PublishedBoard>,
    private readonly rooms: BoardRoomService,
  ) {}

  async previewPage(ownerId: string, reference: string, itemReference: string) {
    await this.requireOwnedBoard(ownerId, reference);
    const page = captureBoardPage(await this.rooms.snapshot(reference), itemReference);
    return { ...page, snapshot: publicSnapshot(page.snapshot) };
  }

  async publishPage(ownerId: string, reference: string, itemReference: string, draft?: unknown) {
    await this.requireOwnedBoard(ownerId, reference);
    const page = capturePageDraft(itemReference, draft);
    const settings = (draft as { page: Partial<Pick<PublishedBoard, 'visibility' | 'topic' | 'level' | 'locale'>> }).page;
    return this.save(reference, itemReference, page.title, page.layout, page.snapshot, {
      visibility: settings.visibility ?? 'private',
      topic: settings.topic?.trim() ?? '',
      level: settings.level ?? '',
      locale: settings.locale ?? '',
    });
  }

  private async requireOwnedBoard(ownerId: string, reference: string) {
    const board = await this.boards.findOneBy({ reference, ownerId });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  private async save(reference: string, itemReference: string, title: string, layout: SheetLayout, snapshot: BoardUpdate, settings: Pick<PublishedBoard, 'visibility' | 'topic' | 'level' | 'locale'>) {
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
        ...settings,
        searchPending: true,
      })
      .setParameter('pageSnapshot', JSON.stringify(publicSnapshot(snapshot)))
      .orUpdate(['title', 'layout', 'snapshot', 'published_at', 'visibility', 'topic', 'level', 'locale', 'search_pending'], ['reference', 'item_reference'])
      .returning('"public_reference"')
      .execute();
    return { visibility: settings.visibility, ...(settings.visibility === 'public' && { reference: saved.raw[0].public_reference as string }) };
  }

  async read(reference: string) {
    const published = await this.publications.findOneBy({ publicReference: reference, visibility: 'public' });
    if (!published) throw new NotFoundException('Published page not found');

    return { title: published.title, layout: published.layout, snapshot: publicSnapshot(published.snapshot) };
  }
}
