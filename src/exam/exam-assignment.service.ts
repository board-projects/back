import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isEmail } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DataSource, In, Repository } from 'typeorm';
import { countClozeBlanks } from '../board/cloze-content';
import { capturePageDraft } from '../board/board-page-capture';
import { Board } from '../board/entities/board.entity';
import { publicSnapshot } from '../board/public-board-snapshot';
import { User } from '../user/entities/user.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { Exam, type ExamPageSnapshot } from './entities/exam.entity';

@Injectable()
export class ExamAssignmentService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ExamAssignment) private readonly assignments: Repository<ExamAssignment>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
  ) {}

  async assign(teacherId: string, boardReference: string, pageId: string, draft: unknown, recipients: unknown) {
    if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100 ||
        recipients.some((email) => typeof email !== 'string' || !isEmail(email.trim()))) {
      throw new BadRequestException('Enter 1 to 100 valid email addresses');
    }
    const emails = [...new Set((recipients as string[]).map((email) => email.trim().toLowerCase()))];
    const page = capturePageDraft(pageId, draft);
    const pageSnapshot: ExamPageSnapshot = { layout: page.layout, snapshot: publicSnapshot(page.snapshot) };
    const questions = page.snapshot.changes.flatMap(({ kind, id, item }) =>
      item && (kind === 'questions' || kind === 'clozeTests') ? [{ sourceItemId: id, kind, question: item }] : []);

    return this.dataSource.transaction(async (manager) => {
      const board = await manager.findOne(Board, { where: { reference: boardReference, ownerId: teacherId }, lock: { mode: 'pessimistic_write' } });
      if (!board) throw new NotFoundException('Board not found');

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

      const previous = await manager.findOne(Exam, {
        where: { teacherId, boardReference, pageId, status: 'published', isActive: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      const previousQuestions = previous ? await manager.find(ExamQuestion, {
        select: { sourceItemId: true, kind: true, question: true },
        where: { testId: previous.id },
        order: { position: 'ASC' },
      }) : [];
      const previousDefinitions = previousQuestions.map(({ sourceItemId, kind, question }) => ({ sourceItemId, kind, question }));
      const sameVersion = previous && previous.label === page.title &&
        isDeepStrictEqual(previous.pageSnapshot, pageSnapshot) && isDeepStrictEqual(previousDefinitions, questions);
      const testId = sameVersion ? previous.id : randomUUID();

      if (!sameVersion) {
        await manager.save(Exam, {
          id: testId, teacherId, boardReference, pageId, label: page.title, pageSnapshot,
          status: 'published', createdBy: teacherId, updatedBy: teacherId,
        });
        if (questions.length) await manager.save(ExamQuestion, questions.map((question, position) => ({
          ...question, position, testId, createdBy: teacherId, updatedBy: teacherId,
        })));
      }

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
    return { testId: exam.id, title: exam.label, layout: exam.pageSnapshot.layout, snapshot: publicSnapshot(exam.pageSnapshot.snapshot) };
  }
  async readTest(studentId: string, testId: string) {
    const assignment = await this.assignments.findOneBy({ testId, studentId, isActive: true });
    if (!assignment) throw new NotFoundException('Assigned exam not found');
    const page = await this.read(studentId, assignment.id);
    const attempt = await this.dataSource.getRepository(ExamAttempt).findOneBy({ assignmentId: assignment.id, isActive: true });
    return { ...page, submittedAt: attempt?.submittedAt ?? null, answers: attempt?.submittedAt ? attempt.answers : {} };
  }

  async submitTest(studentId: string, testId: string, draft: unknown) {
    return this.dataSource.transaction(async (manager) => {
      const assignment = await manager.findOne(ExamAssignment, {
        where: { testId, studentId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      const exam = assignment && await manager.findOneBy(Exam, { id: testId, status: 'published', isActive: true });
      if (!assignment || !exam) throw new NotFoundException('Assigned exam not found');

      const existing = await manager.findOneBy(ExamAttempt, { assignmentId: assignment.id });
      if (existing?.isActive && existing.submittedAt) return { submittedAt: existing.submittedAt };
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
      const submittedAt = new Date();
      await manager.save(ExamAttempt, {
        id: existing?.id,
        assignmentId: assignment.id,
        answers,
        startedAt: existing?.startedAt ?? submittedAt,
        submittedAt,
        createdBy: existing?.createdBy ?? studentId,
        updatedBy: studentId,
        updatedAt: submittedAt,
        isActive: true,
      });
      return { submittedAt };
    });
  }
}
