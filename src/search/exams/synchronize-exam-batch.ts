import { In, type Repository } from 'typeorm';
import { Exam } from '../../exam/entities/exam.entity';
import { examSearchDocument } from './exam-search-document';
import type { ExamSearchRepository } from './exam-search.repository';

export const examIndexBatchSize = 30;

export async function synchronizeExamBatch(repository: Repository<Exam>, index: ExamSearchRepository, exams: Exam[]) {
  if (!exams.length) return 0;
  const synced = await index.synchronize(exams.map((exam) => ({
    id: exam.id,
    document: exam.visibility === 'public' && exam.status === 'published' && exam.isActive
      ? examSearchDocument(exam) : undefined,
  })));
  if (synced.length) await repository.update({ id: In(synced), searchPending: true }, { searchPending: false });
  return synced.length;
}
