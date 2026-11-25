import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exam } from '../exam/entities/exam.entity';
import { examSearchDocument } from './exam-search-document';
import { ExamSearchRepository } from './exam-search.repository';
import { examLevels } from './publication-settings';

type SearchInput = Record<string, unknown>;
type SearchHit = { _id: string };

const pageSize = 20;
const sortOptions = {
  relevance: ['_score', { publishedAt: 'desc' }, 'reference'],
  newest: [{ publishedAt: 'desc' }, 'reference'],
  oldest: [{ publishedAt: 'asc' }, 'reference'],
  title: ['title.sort', 'reference'],
};

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

  private async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prepareIndex();
      await this.publications.manager.transaction(async (manager) => {
        const repository = manager.getRepository(Exam);
        const pages = await repository.createQueryBuilder('publication')
          .where({ searchPending: true }).orderBy('publication.publishedAt', 'ASC').take(30)
          .setLock('pessimistic_write').setOnLocked('skip_locked').getMany();
        if (!pages.length) return;

        const operations = pages.flatMap<Record<string, unknown>>((page) => {
          const _id = page.id;
          if (page.visibility !== 'public' || page.status !== 'published' || !page.isActive) return [{ delete: { _id } }];
          return [{ index: { _id } }, examSearchDocument(page)];
        });
        const response = await this.index.request('/_bulk?refresh=wait_for', 'POST',
          operations.map((operation) => JSON.stringify(operation)).join('\n') + '\n', 'application/x-ndjson');
        if (!response.ok) {
          if (response.status === 404) {
            this.indexReady = undefined;
            this.index.resetIndex();
          }
          throw new Error(`Elasticsearch bulk write returned ${response.status}`);
        }
        const result = await response.json() as { items: Array<Record<string, { status: number }>> };
        const synced = pages.filter((_, index) => {
          const item = result.items[index];
          return (item?.index?.status >= 200 && item.index.status < 300) ||
            item?.delete?.status === 200 || item?.delete?.status === 404;
        });
        if (synced.length) await repository.update({ id: In(synced.map((page) => page.id)) }, { searchPending: false });
        if (synced.length !== pages.length) this.logger.warn('Some exam catalog updates will be retried');
      });
    } catch (error) {
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
    if (!Object.hasOwn(sortOptions, sort) || (level && !examLevels.includes(level)) ||
        (locale && !/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(locale)) ||
        !Number.isInteger(page) || page < 1 || page > 499) throw new BadRequestException('Invalid search filter');

    try {
      await this.prepareIndex();
      const response = await this.index.request('/_search', 'POST', JSON.stringify({
        _source: false,
        from: (page - 1) * pageSize,
        size: pageSize + 1,
        sort: sortOptions[sort as keyof typeof sortOptions],
        query: { bool: {
          must: query ? [{ multi_match: { query, fields: ['title^4', 'questions'] } }] : [],
          filter: Object.entries({ topic, level, locale }).filter(([, value]) => value).map(([key, value]) => ({ term: { [key]: value } })),
        } },
      }));
      if (!response.ok) {
        if (response.status === 404) {
            this.indexReady = undefined;
            this.index.resetIndex();
          }
        throw new Error(`Elasticsearch search returned ${response.status}`);
      }
      const { hits } = await response.json() as { hits: { hits: SearchHit[] } };
      const references = hits.hits.slice(0, pageSize).map(({ _id }) => _id);
      const publications = references.length ? await this.publications.find({
        select: { id: true, label: true, topic: true, level: true, locale: true },
        where: { id: In(references), visibility: 'public', status: 'published', isActive: true, searchPending: false },
      }) : [];
      const byId = new Map(publications.map(({ id, label, topic, level, locale }) => [
        id, { reference: id, title: label, topic, level, locale },
      ]));
      return { items: references.flatMap((id) => byId.get(id) ?? []), hasNext: page < 499 && hits.hits.length > pageSize };
    } catch {
      throw new ServiceUnavailableException('Exam search is temporarily unavailable');
    }
  }
}
