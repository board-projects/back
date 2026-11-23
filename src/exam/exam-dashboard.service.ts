import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { Exam } from './entities/exam.entity';

const dashboardModes = ['teacher', 'student'] as const;
type DashboardMode = (typeof dashboardModes)[number];

@Injectable()
export class ExamDashboardService {
  constructor(
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(ExamAssignment) private readonly assignments: Repository<ExamAssignment>,
  ) {}

  async overview(userId: string, role: DashboardMode = 'teacher') {
    const tests = role === 'teacher' ? await this.ownedExams(userId) : await this.assignedExams(userId);
    return { role, roles: dashboardModes, tests };
  }

  private ownedExams(teacherId: string) {
    return this.exams.find({
      select: { id: true, label: true, status: true },
      where: { teacherId, isActive: true },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
  }

  private async assignedExams(studentId: string) {
    const assignments = await this.assignments.createQueryBuilder('assignment')
      .innerJoin(Exam, 'exam', 'exam.id = assignment.testId AND exam.isActive AND exam.status = :status', { status: 'published' })
      .leftJoin(ExamAttempt, 'attempt', 'attempt.assignmentId = assignment.id AND attempt.isActive')
      .select('assignment.id', 'id')
      .addSelect('exam.label', 'label')
      .addSelect('attempt.id', 'attemptId')
      .addSelect('attempt.submittedAt', 'submittedAt')
      .where('assignment.studentId = :studentId AND assignment.isActive', { studentId })
      .orderBy('assignment.createdAt', 'DESC')
      .addOrderBy('assignment.id', 'ASC')
      .getRawMany<{ id: string; label: string; attemptId: string | null; submittedAt: Date | null }>();

    return assignments.map(({ id, label, attemptId, submittedAt }) => ({
      id,
      label,
      status: submittedAt ? 'submitted' : attemptId ? 'in_progress' : 'assigned',
    }));
  }
}
