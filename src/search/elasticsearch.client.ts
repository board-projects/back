import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ElasticsearchClient {
  constructor(private readonly config: ConfigService) {}

  get configured() {
    return Boolean(this.config.get<string>('ELASTICSEARCH_URL'));
  }

  request(index: string, path: string, method: string, body?: string, contentType = 'application/json') {
    const endpoint = this.config.get<string>('ELASTICSEARCH_URL')?.replace(/\/$/, '');
    if (!endpoint) throw new Error('ELASTICSEARCH_URL is missing');
    const apiKey = this.config.get<string>('ELASTICSEARCH_API_KEY');
    return fetch(`${endpoint}/${encodeURIComponent(index)}${path}`, {
      method,
      headers: { 'Content-Type': contentType, ...(apiKey && { Authorization: `ApiKey ${apiKey}` }) },
      body,
      signal: AbortSignal.timeout(4000),
    });
  }
}
