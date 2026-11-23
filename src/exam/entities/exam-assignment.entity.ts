import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ExamAttempt } from './exam-attempt.entity';
import { Exam } from './exam.entity';

@Entity({ name: 'test_assignments', synchronize: false })
export class ExamAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Exam, { nullable: false })
  @JoinColumn({ name: 'test_id' })
  test: Exam;

  @OneToOne(() => ExamAttempt, (attempt) => attempt.assignment)
  attempt: Relation<ExamAttempt> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
