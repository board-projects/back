import type { BoardUpdate } from '../../board/board.protocol';
import type { SheetLayout } from '../../board/entities/published-board.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import type { ExamTiming } from '../exam-timing';

export type ExamPageSnapshot = { layout: SheetLayout; snapshot: BoardUpdate; timing?: ExamTiming };

@Entity({ name: 'tests', synchronize: false })
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ name: 'board_reference', type: 'uuid', nullable: true })
  boardReference: string | null;

  @Column({ name: 'page_id', type: 'uuid' })
  pageId: string;

  @Column({ type: 'varchar', length: 80 })
  label: string;

  @Column({ name: 'page_snapshot', type: 'jsonb' })
  pageSnapshot: ExamPageSnapshot;

  @Column({ type: 'varchar', length: 16 })
  status: 'draft' | 'published' | 'archived';

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
