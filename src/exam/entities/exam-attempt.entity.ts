import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ExamAssignment } from './exam-assignment.entity';

@Entity({ name: 'test_attempts', synchronize: false })
export class ExamAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => ExamAssignment)
  @JoinColumn({ name: 'assignment_id' })
  assignment: Relation<ExamAssignment>;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
