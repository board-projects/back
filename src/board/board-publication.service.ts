import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Exam } from '../exam/entities/exam.entity';
import { findOrCreateExamVersion, lockExamBoard } from '../exam/exam-versions';
import { captureBoardPage, capturePageDraft } from './board-page-capture';
import { BoardRoomService } from './board-room.service';
import { Board } from './entities/board.entity';
import { publicSnapshot } from './public-board-snapshot';

@Injectable()
export class BoardPublicationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    private readonly rooms: BoardRoomService,
  ) {}

  async previewPage(ownerId: string, reference: string, itemReference: string) {
    const board = await this.boards.findOneBy({ reference, ownerId });
    if (!board) throw new NotFoundException('Board not found');
    const page = captureBoardPage(await this.rooms.snapshot(reference), itemReference);
    return { ...page, snapshot: publicSnapshot(page.snapshot) };
  }

  async publishPage(ownerId: string, reference: string, pageId: string, draft: unknown) {
    const page = capturePageDraft(pageId, draft);
    const settings = (draft as { page: Partial<Pick<Exam, 'visibility' | 'topic' | 'level' | 'locale'>> }).page;
    const visibility = settings.visibility ?? 'private';
    return this.dataSource.transaction(async (manager) => {
      await lockExamBoard(manager, ownerId, reference);
      const testId = await findOrCreateExamVersion(manager, ownerId, reference, pageId, page);
      const updatedAt = new Date();
      await manager.update(Exam, { id: Not(testId), boardReference: reference, pageId, visibility: 'public' }, {
        visibility: 'private', searchPending: true, updatedAt, updatedBy: ownerId,
      });
      await manager.update(Exam, testId, {
        visibility, topic: settings.topic?.trim() ?? '', level: settings.level ?? '', locale: settings.locale ?? '',
        publishedAt: visibility === 'public' ? updatedAt : null, searchPending: true,
        updatedAt, updatedBy: ownerId,
      });
      return { visibility, ...(visibility === 'public' && { reference: testId }) };
    });
  }

  async read(reference: string) {
    const exam = await this.exams.findOneBy({ id: reference, visibility: 'public', status: 'published', isActive: true });
    if (!exam) throw new NotFoundException('Published page not found');
    return { title: exam.label, layout: exam.pageSnapshot.layout, snapshot: publicSnapshot(exam.pageSnapshot.snapshot) };
  }
}
