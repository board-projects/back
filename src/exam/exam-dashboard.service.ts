import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountRolesService, type AccountRole } from '../user/account-roles.service';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { Exam } from './entities/exam.entity';

@Injectable()
export class ExamDashboardService {
  constructor(
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(ExamAssignment) private readonly assignments: Repository<ExamAssignment>,
    private readonly accountRoles: AccountRolesService,
  ) {}

  async overview(userId: string, requestedRole?: AccountRole) {
    const roles = await this.accountRoles.list(userId);
    const role = requestedRole ?? (roles.includes('teacher') ? 'teacher' : roles[0]);
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Sign in with an account registered for this dashboard');
    }

    const tests = role === 'teacher' ? await this.ownedExams(userId) : await this.assignedExams(userId);
    return { role, roles, tests };
  }

  private ownedExams(teacherId: string) {
    return this.exams.find({
      select: { id: true, label: true, status: true },
      where: { teacherId, isActive: true },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
  }

  private async assignedExams(studentId: string) {
    const assignments = await this.assignments.find({
      select: { id: true, test: { id: true, label: true }, attempt: { id: true, isActive: true, submittedAt: true } },
      relations: { test: true, attempt: true },
      where: { studentId, isActive: true, test: { isActive: true, status: 'published' } },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
    return assignments.map(({ id, test, attempt }) => ({
      id,
      label: test.label,
      status: attempt?.isActive ? (attempt.submittedAt ? 'submitted' : 'in_progress') : 'assigned',
    }));
  }
}
