import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'test_questions', synchronize: false })
export class ExamQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'test_id', type: 'uuid' })
  testId: string;

  @Column({ name: 'source_item_id', type: 'varchar', length: 128 })
  sourceItemId: string;

  @Column({ type: 'varchar', length: 48 })
  kind: string;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'question_jsonb', type: 'jsonb' })
  question: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
