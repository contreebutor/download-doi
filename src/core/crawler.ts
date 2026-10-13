/** Crawler implementations: fetch the SciHub article page for a source. */
import axios, { type AxiosInstance } from 'axios';
import { HtmlContent } from './content.js';
import type { BaseTask, Crawler, Source } from './base.js';
import { defaultHeaders, proxyRequestConfig, quotePath } from '../http.js';
import { getLogger } from '../logger.js';
import { CrawlError, errorMessage } from '../errors.js';
import { ScihubUrlService } from '../db/service.js';

const logger = getLogger();

const OK_STATUS_CODES = [200];

export class ScihubCrawler implements Crawler<HtmlContent> {
  private readonly client: AxiosInstance;
  private readonly service: ScihubUrlService;

  constructor(
    readonly source: Source,
    readonly scihubUrl: string,
    private readonly task?: BaseTask,
  ) {
    this.client = axios.create({
      headers: defaultHeaders(),
      // SciHub answers 4xx/5xx for missing papers; handled explicitly below.
      validateStatus: () => true,
      maxRedirects: 5,
      timeout: 60_000,
    });
    this.service = new ScihubUrlService();

    if (this.task !== undefined) {
      this.task.context.source = source;
      this.task.context.referer = scihubUrl;
      this.task.context.status = 'crawling';
    }
  }

  async crawl(): Promise<HtmlContent> {
    const proxies = this.task?.context.proxies ?? {};
    const requestConfig = proxyRequestConfig(proxies);
    const identifier = this.source.keyword;

    try {
      logger.info(
        `<- Request: scihub_url=${this.scihubUrl}, source=${String(this.source)}, ` +
          `proxies=${JSON.stringify(proxies)}`,
      );

      // Mirrors now serve the article page at GET {scihub_url}/{identifier};
      // a POST to the root returns the search homepage, which has no #pdf tag.
      let response = await this.client.get<string>(
        `${this.scihubUrl}/${quotePath(identifier)}`,
        { ...requestConfig, responseType: 'text' },
      );

      if (!OK_STATUS_CODES.includes(response.status)) {
        response = await this.client.post<string>(
          this.scihubUrl,
          new URLSearchParams({ request: identifier }).toString(),
          {
            ...requestConfig,
            responseType: 'text',
            headers: defaultHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
          },
        );
      }

      const html = typeof response.data === 'string' ? response.data : String(response.data);
      logger.info(`-> Response: status_code=${response.status}, content_length=${html.length}`);

      if (!OK_STATUS_CODES.includes(response.status)) {
        throw new Error(`Error occurs when crawling source: ${String(this.source)}`);
      }

      const content = new HtmlContent(html);
      if (this.task !== undefined) {
        this.task.context.status = 'crawled';
      }
      return content;
    } catch (error) {
      if (this.task !== undefined) {
        this.task.context.status = 'crawling_failed';
        this.task.context.error = error instanceof Error ? error : new Error(String(error));
        this.service.incrementFailedTimes(this.scihubUrl);
      }
      throw new CrawlError(`Error occurs when crawling: ${errorMessage(error)}`, { cause: error });
    }
  }
}
