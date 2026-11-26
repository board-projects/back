import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exam } from '../../exam/entities/exam.entity';
import { examIndexBatchSize, synchronizeExamBatch } from './synchronize-exam-batch';
import { ExamIndexMissing, ExamSearchRepository, examSorts } from './exam-search.repository';
import { examLevels } from '../../board/publication-settings';

type SearchInput = Record<string, unknown>;
const pageSize = 20;

function searchValue(input: unknown, maximum: number, lower = true): string {
  if (input === undefined) return '';
  if (typeof input !== 'string' || input.length > maximum) throw new BadRequestException('Invalid search filter');
  return lower ? input.trim().toLowerCase() : input.trim();
}

@Injectable()
export class ExamCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamCatalogService.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(Exam) private readonly publications: Repository<Exam>,
    private readonly index: ExamSearchRepository,
  ) {}

  onModuleInit() {
    if (!this.index.configured) return;
    void this.reconcile();
    this.interval = setInterval(() => void this.reconcile(), 3000);
    this.interval.unref();
  }

  onModuleDestroy() {
    clearInterval(this.interval);
  }

  private indexReady?: Promise<void>;

  private prepareIndex() {
    this.indexReady ??= this.index.ensureIndex().then(async (created) => {
      if (created) await this.publications.update({ visibility: 'public', searchPending: false }, { searchPending: true });
    }).catch((error: unknown) => {
      this.indexReady = undefined;
      this.index.resetIndex();
      throw error;
    });
    return this.indexReady;
  }

  private resetMissingIndex(error: unknown) {
    if (!(error instanceof ExamIndexMissing)) return;
    this.indexReady = undefined;
    this.index.resetIndex();
  }

  private async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prepareIndex();
      await this.publications.manager.transaction(async (manager) => {
        const repository = manager.getRepository(Exam);
        const pages = await repository.createQueryBuilder('publication')
          .where({ searchPending: true }).orderBy('publication.publishedAt', 'ASC').take(examIndexBatchSize)
          .setLock('pessimistic_write').setOnLocked('skip_locked').getMany();
        const synced = await synchronizeExamBatch(repository, this.index, pages);
        if (synced !== pages.length) this.logger.warn('Some exam catalog updates will be retried');
      });
    } catch (error) {
      this.resetMissingIndex(error);
      this.logger.warn(error instanceof Error ? error.message : 'Exam catalog update failed');
    } finally {
      this.running = false;
    }
  }

  async search(input: SearchInput) {
    const query = searchValue(input.query, 200, false);
    const topic = searchValue(input.topic, 80);
    const level = searchValue(input.level, 16);
    const locale = searchValue(input.locale, 12);
    const sort = searchValue(input.sort, 16) || (query ? 'relevance' : 'newest');
    const page = Number(searchValue(input.page, 3) || '1');
    if (!Object.hasOwn(examSorts, sort) || (level && !examLevels.includes(level)) ||
        (locale && !/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(locale)) ||
        !Number.isInteger(page) || page < 1 || page > 499) throw new BadRequestException('Invalid search filter');

    try {
      await this.prepareIndex();
      const hits = await this.index.search({
        query, filters: { topic, level, locale }, sort: sort as keyof typeof examSorts,
        offset: (page - 1) * pageSize, size: pageSize + 1,
      });
      const references = hits.slice(0, pageSize);
      const publications = references.length ? await this.publications.find({
        select: { id: true, label: true, topic: true, level: true, locale: true },
        where: { id: In(references), visibility: 'public', status: 'published', isActive: true, searchPending: false },
      }) : [];
      const byId = new Map(publications.map(({ id, label, topic, level, locale }) => [
        id, { reference: id, title: label, topic, level, locale },
      ]));
      return { items: references.flatMap((id) => byId.get(id) ?? []), hasNext: page < 499 && hits.length > pageSize };
    } catch (error) {
      this.resetMissingIndex(error);
      throw new ServiceUnavailableException('Exam search is temporarily unavailable');
    }
  }
}
