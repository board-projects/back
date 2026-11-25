import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchClient } from '../elasticsearch.client';
import type { examSearchDocument } from './exam-search-document';

type ExamSearchDocument = ReturnType<typeof examSearchDocument>;
type SearchChange = { id: string; document?: ExamSearchDocument };
export const examSorts = {
  relevance: ['_score', { publishedAt: 'desc' }, 'reference'],
  newest: [{ publishedAt: 'desc' }, 'reference'],
  oldest: [{ publishedAt: 'asc' }, 'reference'],
  title: ['title.sort', 'reference'],
};

export class ExamIndexMissing extends Error {}

@Injectable()
export class ExamSearchRepository {
  private initialized?: Promise<boolean>;

  constructor(private readonly client: ElasticsearchClient, private readonly config: ConfigService) {}

  get configured() {
    return this.client.configured;
  }

  resetIndex() {
    this.initialized = undefined;
  }

  private request(path: string, method: string, body?: string, contentType?: string) {
    const index = this.config.get<string>('ELASTICSEARCH_EXAM_INDEX') || 'dequizma-exams-v2';
    return this.client.request(index, path, method, body, contentType);
  }

  private async createIndex(): Promise<boolean> {
    const response = await this.request('', 'HEAD');
    if (response.ok) return false;
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
    if (created.ok) return true;
    const existing = await this.request('', 'HEAD');
    if (!existing.ok) throw new Error(`Elasticsearch index creation returned ${created.status}`);
    return false;
  }

  ensureIndex() {
    this.initialized ??= this.createIndex().catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    return this.initialized;
  }

  async synchronize(changes: SearchChange[]) {
    const operations = changes.flatMap<Record<string, unknown>>(({ id, document }) =>
      document ? [{ index: { _id: id } }, document] : [{ delete: { _id: id } }]);
    const response = await this.request('/_bulk?refresh=wait_for', 'POST',
      operations.map((operation) => JSON.stringify(operation)).join('\n') + '\n', 'application/x-ndjson');
    if (response.status === 404) throw new ExamIndexMissing('Exam index is missing');
    if (!response.ok) throw new Error(`Elasticsearch bulk write returned ${response.status}`);
    const { items } = await response.json() as { items: Array<Record<string, { status: number }>> };
    return changes.flatMap(({ id }, index) => {
      const item = items[index];
      const result = item?.index ?? item?.delete;
      const success = result && ((result.status >= 200 && result.status < 300) || item.delete?.status === 404);
      return success ? [id] : [];
    });
  }

  async search({ query, filters, sort, offset, size }: {
    query: string; filters: Record<string, string>; sort: keyof typeof examSorts; offset: number; size: number;
  }) {
    const response = await this.request('/_search', 'POST', JSON.stringify({
      _source: false,
      from: offset,
      size,
      sort: examSorts[sort],
      query: { bool: {
        must: query ? [{ multi_match: { query, fields: ['title^4', 'questions'] } }] : [],
        filter: Object.entries(filters).filter(([, value]) => value).map(([key, value]) => ({ term: { [key]: value } })),
      } },
    }));
    if (response.status === 404) throw new ExamIndexMissing('Exam index is missing');
    if (!response.ok) throw new Error(`Elasticsearch search returned ${response.status}`);
    const { hits } = await response.json() as { hits: { hits: Array<{ _id: string }> } };
    return hits.hits.map(({ _id }) => _id);
  }
}
