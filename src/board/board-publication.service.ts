import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { BoardUpdate } from './board.protocol';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';
import { PublishedBoard, type SheetLayout } from './entities/published-board.entity';

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
    const board = await this.boards.findOneBy({ reference, ownerId });
    if (!board) throw new NotFoundException('Board not found');

    const snapshot = publicSnapshot(await this.rooms.snapshot(reference));
    const saved = await this.publications.createQueryBuilder()
      .insert()
      .into(PublishedBoard)
      .values({ reference, publicReference: randomUUID(), title: board.title, layout, snapshot, publishedAt: new Date() })
      .orUpdate(['title', 'layout', 'snapshot', 'published_at'], ['reference'])
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
