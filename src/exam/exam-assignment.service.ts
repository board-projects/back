import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isEmail } from 'class-validator';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { countClozeBlanks } from '../board/cloze-content';
import { capturePageDraft } from '../board/board-page-capture';
import { validStructuredAnswer } from '../board/structured-question';
import { publicSnapshot } from '../board/public-board-snapshot';
import { User } from '../user/entities/user.entity';
import { examAccess, parseExamTiming, requireOpenExam } from './exam-timing';
import { gradeExam } from './exam-grading';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { findOrCreateExamVersion, lockExamBoard, timingForExam } from './exam-versions';
import { Exam } from './entities/exam.entity';

@Injectable()
export class ExamAssignmentService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ExamAssignment) private readonly assignments: Repository<ExamAssignment>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
  ) {}

  async assign(teacherId: string, boardReference: string, pageId: string, draft: unknown, recipients: unknown, schedule?: unknown) {
    if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100 ||
        recipients.some((email) => typeof email !== 'string' || !isEmail(email.trim()))) {
      throw new BadRequestException('Enter 1 to 100 valid email addresses');
    }
    const emails = [...new Set((recipients as string[]).map((email) => email.trim().toLowerCase()))];
    const page = capturePageDraft(pageId, draft);
    const timing = parseExamTiming(schedule);
    return this.dataSource.transaction(async (manager) => {
      await lockExamBoard(manager, teacherId, boardReference);

      const accounts = await manager.getRepository(User).createQueryBuilder('account')
        .select(['account.id', 'account.email'])
        .where('LOWER(account.email) IN (:...emails)', { emails })
        .andWhere('account.isActive = :active', { active: true })
        .getMany();
      const matches = new Map<string, string | null>();
      for (const account of accounts) {
        const email = account.email.toLowerCase();
        matches.set(email, matches.has(email) ? null : account.id);
      }
      const studentIds = emails.flatMap((email) => matches.get(email) ? [matches.get(email)!] : []);
      const unknownEmails = emails.filter((email) => !matches.get(email));
      if (!studentIds.length) return { assigned: 0, alreadyAssigned: 0, unknownEmails };

      const testId = await findOrCreateExamVersion(manager, teacherId, boardReference, pageId, page, timing);

      const existing = await manager.findBy(ExamAssignment, { testId, studentId: In(studentIds) });
      const existingByStudent = new Map(existing.map((assignment) => [assignment.studentId, assignment]));
      const newStudents = studentIds.filter((studentId) => !existingByStudent.has(studentId));
      if (newStudents.length) {
        await manager.insert(ExamAssignment, newStudents.map((studentId) => ({
          testId, studentId, createdBy: teacherId, updatedBy: teacherId,
        })));
      }
      const inactive = existing.filter((assignment) => !assignment.isActive);
      if (inactive.length) {
        await manager.update(ExamAssignment, { id: In(inactive.map(({ id }) => id)) },
          { isActive: true, updatedBy: teacherId, updatedAt: new Date() });
      }
      return { assigned: newStudents.length + inactive.length, alreadyAssigned: existing.length - inactive.length, unknownEmails };
    });
  }

  async read(studentId: string, assignmentId: string) {
    const assignment = await this.assignments.findOneBy({ id: assignmentId, studentId, isActive: true });
    if (!assignment) throw new NotFoundException('Assigned exam not found');
    const exam = await this.exams.findOneBy({ id: assignment.testId, status: 'published', isActive: true });
    if (!exam) throw new NotFoundException('Assigned exam not found');
    return { testId: exam.id };
  }

  async readTest(studentId: string, testId: string) {
    const assignment = await this.assignments.findOneBy({ testId, studentId, isActive: true });
    const exam = assignment && await this.exams.findOneBy({ id: testId, status: 'published', isActive: true });
    if (!assignment || !exam) throw new NotFoundException('Assigned exam not found');

    const attempt = await this.dataSource.getRepository(ExamAttempt).findOneBy({ assignmentId: assignment.id, isActive: true });
    const { layout, snapshot } = exam.pageSnapshot;
    const access = examAccess(timingForExam(exam), new Date(), attempt?.startedAt);
    const page = { testId, title: exam.label, layout, access };
    if (!attempt?.submittedAt) {
      return { ...page, submittedAt: null, ...(access.status === 'open' ? { snapshot: publicSnapshot(snapshot) } : {}) };
    }
    const questions = await this.dataSource.getRepository(ExamQuestion).findBy({ testId });
    return { ...page, snapshot: publicSnapshot(snapshot), submittedAt: attempt.submittedAt, answers: attempt.answers, grade: gradeExam(questions, attempt.answers) };
  }

  private async lockAssignedExam(manager: EntityManager, studentId: string, testId: string) {
    const assignment = await manager.findOne(ExamAssignment, {
      where: { testId, studentId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });
    const exam = assignment && await manager.findOneBy(Exam, { id: testId, status: 'published', isActive: true });
    if (!assignment || !exam) throw new NotFoundException('Assigned exam not found');
    const attempt = await manager.findOneBy(ExamAttempt, { assignmentId: assignment.id });
    return { assignment, exam, attempt };
  }

  async startTest(studentId: string, testId: string) {
    return this.dataSource.transaction(async (manager) => {
      const { assignment, exam, attempt } = await this.lockAssignedExam(manager, studentId, testId);
      if (attempt?.isActive && attempt.submittedAt) return { startedAt: attempt.startedAt };

      const now = new Date();
      const activeAttempt = attempt?.isActive ? attempt : undefined;
      const access = examAccess(timingForExam(exam), now, activeAttempt?.startedAt);
      requireOpenExam(access, true);
      if (activeAttempt) return { startedAt: activeAttempt.startedAt };
      if (!access.durationMinutes) return { startedAt: null };

      await manager.save(ExamAttempt, {
        id: attempt?.id, assignmentId: assignment.id, answers: {}, startedAt: now, submittedAt: null,
        createdBy: attempt?.createdBy ?? studentId, updatedBy: studentId, updatedAt: now, isActive: true,
      });
      return { startedAt: now };
    });
  }

  async submitTest(studentId: string, testId: string, draft: unknown) {
    const submittedAt = new Date();
    return this.dataSource.transaction(async (manager) => {
      const { assignment, exam, attempt: existing } = await this.lockAssignedExam(manager, studentId, testId);
      if (existing?.isActive && existing.submittedAt) {
        const questions = await manager.findBy(ExamQuestion, { testId });
        return { submittedAt: existing.submittedAt, grade: gradeExam(questions, existing.answers) };
      }
      requireOpenExam(examAccess(timingForExam(exam), submittedAt, existing?.isActive ? existing.startedAt : undefined));
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new BadRequestException('Invalid answers');

      const questions = await manager.findBy(ExamQuestion, { testId });
      const questionsById = new Map(questions.map((question) => [question.sourceItemId, question]));
      const answers = Object.fromEntries(Object.entries(draft).map(([questionId, selected]) => {
        const entry = questionsById.get(questionId);
        if (entry?.kind === 'clozeTests') {
          const content = entry.question.content;
          if (typeof content !== 'string' || !Array.isArray(selected) ||
              selected.length !== countClozeBlanks(content) ||
              selected.some((value) => typeof value !== 'string')) {
            throw new BadRequestException('Invalid blank answers for this exam');
          }
          return [questionId, selected as string[]];
        }

        if (entry?.kind === 'questions' && Array.isArray(selected) && selected.every((value) => typeof value === 'string')) {
          const valid = validStructuredAnswer(entry.question, selected);
          if (valid !== undefined) {
            if (!valid) throw new BadRequestException('Invalid answer for this exam');
            return [questionId, selected as string[]];
          }
        }

        const options = entry?.kind === 'questions' && Array.isArray(entry.question.options)
          ? entry.question.options as Array<{ id: string; correct?: boolean }> : undefined;
        if (!options || !Array.isArray(selected) || selected.length > options.length ||
            (options.filter(({ correct }) => correct).length <= 1 && selected.length > 1) ||
            new Set(selected).size !== selected.length ||
            selected.some((value) => typeof value !== 'string' || !options.some(({ id }) => id === value))) {
          throw new BadRequestException('Invalid choice for this exam');
        }
        return [questionId, selected as string[]];
      }));
      await manager.save(ExamAttempt, {
        id: existing?.id,
        assignmentId: assignment.id,
        answers,
        startedAt: existing?.isActive ? existing.startedAt : submittedAt,
        submittedAt,
        createdBy: existing?.createdBy ?? studentId,
        updatedBy: studentId,
        updatedAt: submittedAt,
        isActive: true,
      });
      return { submittedAt, grade: gradeExam(questions, answers) };
    });
  }
}
