import { Injectable } from '@nestjs/common';

@Injectable()
export class ExamSearchRepository {
  private readonly endpoint = process.env.ELASTICSEARCH_URL?.replace(/\/$/, '');
  private readonly index = process.env.ELASTICSEARCH_EXAM_INDEX || 'dequizma-exams-v2';
  private initialized?: Promise<boolean>;

  get configured() {
    return Boolean(this.endpoint);
  }

  resetIndex() {
    this.initialized = undefined;
  }

  request(path: string, method: string, body?: string, contentType = 'application/json') {
    if (!this.endpoint) throw new Error('ELASTICSEARCH_URL is missing');
    const apiKey = process.env.ELASTICSEARCH_API_KEY;
    return fetch(`${this.endpoint}/${encodeURIComponent(this.index)}${path}`, {
      method,
      headers: { 'Content-Type': contentType, ...(apiKey && { Authorization: `ApiKey ${apiKey}` }) },
      body,
      signal: AbortSignal.timeout(4000),
    });
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

}
