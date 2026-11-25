import type { BoardUpdate } from '../../board/board.protocol';
import type { SheetLayout } from '../../board/sheet-layout';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ExamPageSnapshot = { layout: SheetLayout; snapshot: BoardUpdate };

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

  @Column({ type: 'varchar', length: 7, default: 'private' })
  visibility: 'public' | 'private';

  @Column({ type: 'varchar', length: 80, default: '' })
  topic: string;

  @Column({ type: 'varchar', length: 16, default: '' })
  level: string;

  @Column({ type: 'varchar', length: 12, default: '' })
  locale: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'opens_at', type: 'timestamptz', nullable: true })
  opensAt: Date | null;

  @Column({ name: 'closes_at', type: 'timestamptz', nullable: true })
  closesAt: Date | null;

  @Column({ name: 'duration_minutes', type: 'integer', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'search_pending', type: 'boolean', default: false })
  searchPending: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
