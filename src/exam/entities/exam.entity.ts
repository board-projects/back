import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tests', synchronize: false })
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ type: 'varchar', length: 80 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'draft' | 'published' | 'archived';

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
