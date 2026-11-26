import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../../data-source';
import { Exam } from '../../exam/entities/exam.entity';
import { ElasticsearchClient } from '../elasticsearch.client';
import { ExamSearchRepository } from '../exams/exam-search.repository';
import { examIndexBatchSize, synchronizeExamBatch } from '../exams/synchronize-exam-batch';

async function run() {
  const config = new ConfigService();
  const index = new ExamSearchRepository(new ElasticsearchClient(config), config);
  if (!index.configured) throw new Error('Set ELASTICSEARCH_URL before reindexing exams');

  const dataSource = new DataSource({ ...AppDataSource.options, synchronize: false, migrationsRun: false });
  await dataSource.initialize();
  try {
    await index.ensureIndex();
    let after: string | undefined;
    let processed = 0;
    for (;;) {
      const batch = await dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Exam);
        const query = repository.createQueryBuilder('exam').orderBy('exam.id', 'ASC')
          .take(examIndexBatchSize).setLock('pessimistic_write');
        if (after) query.where('exam.id > :after', { after });
        const exams = await query.getMany();
        const synced = await synchronizeExamBatch(repository, index, exams);
        return { synced, count: exams.length, lastId: exams.at(-1)?.id };
      });
      processed += batch.synced;
      if (batch.synced !== batch.count) throw new Error(`Elasticsearch accepted ${processed} changes before a partial failure. Rerun the command to retry.`);
      if (!batch.lastId) break;
      after = batch.lastId;
    }
    console.log(`Reindex complete. Synchronized ${processed} exam records.`);
  } finally {
    await dataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Exam reindex failed');
  process.exitCode = 1;
});
