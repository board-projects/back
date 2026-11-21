import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { BoardUpdate } from '../board.protocol';
import { Board } from './board.entity';

export type SheetLayout = { width: number; height: number; dots: boolean };

@Entity({ name: 'published_boards' })
@Unique('UQ_published_boards_public_reference', ['publicReference'])
export class PublishedBoard {
  @PrimaryColumn('uuid')
  reference: string;

  @Column({ name: 'public_reference', type: 'uuid' })
  publicReference: string;

  @OneToOne(() => Board, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reference', foreignKeyConstraintName: 'FK_published_boards_board' })
  board: Board;

  @Column({ type: 'varchar', length: 80 })
  title: string;

  @Column({ type: 'jsonb' })
  layout: SheetLayout;

  @Column({ type: 'jsonb' })
  snapshot: BoardUpdate;

  @UpdateDateColumn({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;
}
