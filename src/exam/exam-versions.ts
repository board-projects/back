import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { EntityManager } from 'typeorm';
import type { PageSnapshot } from '../board/board-page-capture';
import { Board } from '../board/entities/board.entity';
import { publicSnapshot } from '../board/public-board-snapshot';
import { Exam } from './entities/exam.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import type { ExamTiming } from './exam-timing';

export async function lockExamBoard(manager: EntityManager, teacherId: string, reference: string) {
  const board = await manager.findOne(Board, {
    where: { reference, ownerId: teacherId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!board) throw new NotFoundException('Board not found');
}

export function timingForExam(exam: Exam): ExamTiming {
  return {
    ...(exam.opensAt && { opensAt: exam.opensAt.toISOString() }),
    ...(exam.closesAt && { closesAt: exam.closesAt.toISOString() }),
    ...(exam.durationMinutes && { durationMinutes: exam.durationMinutes }),
  };
}

export async function findOrCreateExamVersion(
  manager: EntityManager, teacherId: string, boardReference: string, pageId: string,
  page: PageSnapshot, requestedTiming?: ExamTiming,
) {
  const pageSnapshot = { layout: page.layout, snapshot: publicSnapshot(page.snapshot) };
  const questions = page.snapshot.changes.flatMap(({ kind, id, item }) =>
    item && (kind === 'questions' || kind === 'clozeTests') ? [{ sourceItemId: id, kind, question: item }] : []);
  const versions = await manager.find(Exam, {
    where: { teacherId, boardReference, pageId, status: 'published', isActive: true },
    order: { createdAt: 'DESC', id: 'DESC' },
  });
  const latest = versions[0];
  const timing = requestedTiming ?? (latest ? timingForExam(latest) : {});
  const candidates = versions.filter((version) => version.label === page.title &&
    isDeepStrictEqual(timingForExam(version), timing) && isDeepStrictEqual(version.pageSnapshot, pageSnapshot));
  for (const version of candidates) {
    const stored = await manager.find(ExamQuestion, {
      select: { sourceItemId: true, kind: true, question: true },
      where: { testId: version.id },
      order: { position: 'ASC' },
    });
    const definitions = stored.map(({ sourceItemId, kind, question }) => ({ sourceItemId, kind, question }));
    if (isDeepStrictEqual(definitions, questions)) return version.id;
  }

  const testId = randomUUID();
  await manager.save(Exam, {
    id: testId, teacherId, boardReference, pageId, label: page.title, pageSnapshot,
    status: 'published', opensAt: timing.opensAt ? new Date(timing.opensAt) : null,
    closesAt: timing.closesAt ? new Date(timing.closesAt) : null, durationMinutes: timing.durationMinutes ?? null,
    createdBy: teacherId, updatedBy: teacherId,
  });
  if (questions.length) await manager.save(ExamQuestion, questions.map((question, position) => ({
    ...question, position, testId, createdBy: teacherId, updatedBy: teacherId,
  })));
  return testId;
}
