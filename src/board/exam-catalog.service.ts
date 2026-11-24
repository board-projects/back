import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PublishedBoard } from './entities/published-board.entity';
import { publicSnapshot } from './public-board-snapshot';
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
  private readonly endpoint = process.env.ELASTICSEARCH_URL?.replace(/\/$/, '');
  private readonly index = process.env.ELASTICSEARCH_EXAM_INDEX || 'dequizma-exams-v1';
  private initialized?: Promise<void>;
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(@InjectRepository(PublishedBoard) private readonly publications: Repository<PublishedBoard>) {}

  onModuleInit() {
    if (!this.endpoint) return;
    void this.reconcile();
    this.interval = setInterval(() => void this.reconcile(), 3000);
    this.interval.unref();
  }

  onModuleDestroy() {
    clearInterval(this.interval);
  }

  private request(path: string, method: string, body?: string, contentType = 'application/json') {
    if (!this.endpoint) throw new Error('ELASTICSEARCH_URL is missing');
    const apiKey = process.env.ELASTICSEARCH_API_KEY;
    return fetch(`${this.endpoint}/${encodeURIComponent(this.index)}${path}`, {
      method,
      headers: { 'Content-Type': contentType, ...(apiKey && { Authorization: `ApiKey ${apiKey}` }) },
      body,
      signal: AbortSignal.timeout(4000),
    });
  }

  private async createIndex() {
    const response = await this.request('', 'HEAD');
    if (response.ok) return;
    if (response.status !== 404) throw new Error(`Elasticsearch index lookup returned ${response.status}`);
    const created = await this.request('', 'PUT', JSON.stringify({
      mappings: {
        dynamic: 'strict',
        properties: {
          reference: { type: 'keyword' },
          title: { type: 'text', fields: { sort: { type: 'keyword' } } },
          questions: { type: 'text' },
          topic: { type: 'keyword' },
          level: { type: 'keyword' },
          locale: { type: 'keyword' },
          publishedAt: { type: 'date' },
        },
      },
    }));
    if (created.ok) {
      await this.publications.update({ searchPending: false }, { searchPending: true });
      return;
    }
    const existing = await this.request('', 'HEAD');
    if (!existing.ok) throw new Error(`Elasticsearch index creation returned ${created.status}`);
  }

  private ensureIndex() {
    this.initialized ??= this.createIndex().catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    return this.initialized;
  }

  private async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureIndex();
      await this.publications.manager.transaction(async (manager) => {
        const repository = manager.getRepository(PublishedBoard);
        const pages = await repository.createQueryBuilder('publication')
          .where({ searchPending: true }).orderBy('publication.publishedAt', 'ASC').take(30)
          .setLock('pessimistic_write').setOnLocked('skip_locked').getMany();
        if (!pages.length) return;

        const operations = pages.flatMap<Record<string, unknown>>((page) => {
          const _id = page.publicReference;
          if (page.visibility !== 'public') return [{ delete: { _id } }];
          const questions = publicSnapshot(page.snapshot).changes.flatMap(({ kind, item }) => {
            const content = kind === 'questions' ? item?.prompt : kind === 'clozeTests' ? item?.content : undefined;
            return typeof content === 'string' ? [content] : [];
          }).join(' ').slice(0, 40_000);
          return [{ index: { _id } }, {
            reference: _id, title: page.title, questions, topic: page.topic.toLowerCase(),
            level: page.level, locale: page.locale, publishedAt: page.publishedAt,
          }];
        });
        const response = await this.request('/_bulk?refresh=wait_for', 'POST',
          operations.map((operation) => JSON.stringify(operation)).join('\n') + '\n', 'application/x-ndjson');
        if (!response.ok) {
          if (response.status === 404) this.initialized = undefined;
          throw new Error(`Elasticsearch bulk write returned ${response.status}`);
        }
        const result = await response.json() as { items: Array<Record<string, { status: number }>> };
        const synced = pages.filter((_, index) => {
          const item = result.items[index];
          return (item?.index?.status >= 200 && item.index.status < 300) ||
            item?.delete?.status === 200 || item?.delete?.status === 404;
        });
        if (synced.length) await repository.update({ publicReference: In(synced.map((page) => page.publicReference)) }, { searchPending: false });
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
      await this.ensureIndex();
      const response = await this.request('/_search', 'POST', JSON.stringify({
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
        if (response.status === 404) this.initialized = undefined;
        throw new Error(`Elasticsearch search returned ${response.status}`);
      }
      const { hits } = await response.json() as { hits: { hits: SearchHit[] } };
      const references = hits.hits.slice(0, pageSize).map(({ _id }) => _id);
      const publications = references.length ? await this.publications.find({
        select: { publicReference: true, title: true, topic: true, level: true, locale: true },
        where: { publicReference: In(references), visibility: 'public', searchPending: false },
      }) : [];
      const byId = new Map(publications.map(({ publicReference, title, topic, level, locale }) => [
        publicReference, { reference: publicReference, title, topic, level, locale },
      ]));
      return { items: references.flatMap((id) => byId.get(id) ?? []), hasNext: page < 499 && hits.hits.length > pageSize };
    } catch {
      throw new ServiceUnavailableException('Exam search is temporarily unavailable');
    }
  }
}
