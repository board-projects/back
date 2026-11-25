import type { Exam } from '../exam/entities/exam.entity';
import { publicSnapshot } from './public-board-snapshot';

export function examSearchDocument(exam: Exam) {
  const questions = publicSnapshot(exam.pageSnapshot.snapshot).changes.flatMap(({ kind, item }) => {
    const content = kind === 'questions' ? item?.prompt : kind === 'clozeTests' ? item?.content : undefined;
    return typeof content === 'string' ? [content] : [];
  }).join(' ').slice(0, 40_000);

  return {
    reference: exam.id, title: exam.label, questions, topic: exam.topic.toLowerCase(),
    level: exam.level, locale: exam.locale, publishedAt: exam.publishedAt,
  };
}
