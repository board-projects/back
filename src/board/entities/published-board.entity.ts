import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { BoardUpdate } from '../board.protocol';
import { Board } from './board.entity';

export type SheetLayout = { width: number; height: number; dots: boolean; backgroundColor?: string };

@Entity({ name: 'published_boards' })
@Unique('UQ_published_boards_public_reference', ['publicReference'])
export class PublishedBoard {
  @PrimaryColumn('uuid')
  reference: string;

  @PrimaryColumn({ name: 'item_reference', type: 'uuid' })
  itemReference: string;

  @Column({ name: 'public_reference', type: 'uuid' })
  publicReference: string;

  @ManyToOne(() => Board, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reference', foreignKeyConstraintName: 'FK_published_boards_board' })
  board: Board;

  @Column({ type: 'varchar', length: 80 })
  title: string;

  @Column({ type: 'jsonb' })
  layout: SheetLayout;

  @Column({ type: 'jsonb' })
  snapshot: BoardUpdate;

  @Column({ type: 'varchar', length: 7, default: 'public' })
  visibility: 'public' | 'private';

  @Column({ type: 'varchar', length: 80, default: '' })
  topic: string;

  @Column({ type: 'varchar', length: 16, default: '' })
  level: string;

  @Column({ type: 'varchar', length: 12, default: '' })
  locale: string;

  @Column({ name: 'search_pending', type: 'boolean', default: true })
  searchPending: boolean;

  @UpdateDateColumn({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;
}
