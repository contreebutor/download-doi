/** Strategies for refreshing the list of available SciHub domains. */
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { DomainUpdater } from './base.js';
import { ScihubUrlService } from '../db/service.js';
import { getInt, getString } from '../config/index.js';
import { getLogger } from '../logger.js';
import { errorMessage } from '../errors.js';
import { defaultHeaders } from '../http.js';
import { mapWithConcurrency } from '../util/concurrency.js';

const logger = getLogger();

/** Finds domains by crawling a page that tracks live SciHub mirrors. */
export class CrawlingScihubDomainUpdater implements DomainUpdater {
  readonly updaterType = 'crawl';
  private readonly service: ScihubUrlService;
  private readonly domainSourceUrl: string;
  private readonly domainUrlPattern: string;
  private readonly excludeUrlPattern: string;

  constructor(domainSourceUrl?: string) {
    this.service = new ScihubUrlService();
    this.domainSourceUrl =
      domainSourceUrl ??
      getString('scihub.domain.updater.crawl', 'scihub_domain_source', 'http://tool.yovisun.com/scihub');
    this.domainUrlPattern = getString(
      'scihub.domain.updater.crawl',
      'scihub_url_pattern',
      'htt[^:]+://sci-hub\\.[^</" ]+',
    );
    this.excludeUrlPattern = getString('scihub.domain.updater.crawl', 'exclude_url_pattern', '\\.fun');
  }

  async updateDomains(): Promise<string[]> {
    const response = await axios.get<string>(this.domainSourceUrl, {
      responseType: 'text',
      headers: defaultHeaders(),
      timeout: 30_000,
    });
    const html = typeof response.data === 'string' ? response.data : String(response.data);

    const matches = html.match(new RegExp(this.domainUrlPattern, 'g')) ?? [];
    const unique = [...new Set(matches)];
    const available = this.excludeDomainUrls(unique);

    logger.info(
      `Found ${available.length} valid SciHub domains in total: ${JSON.stringify(available)}`,
    );

    this.service.addUrls(available.map((url) => ({ url })));
    logger.info(`Saved ${available.length} SciHub domains to local db.`);
    return available;
  }

  private excludeDomainUrls(domainUrls: string[], excludeUrlPattern?: string): string[] {
    const pattern = new RegExp(excludeUrlPattern ?? this.excludeUrlPattern);
    return domainUrls.filter((url) => !pattern.test(url));
  }
}

/** Finds domains by probing every `sci-hub.xx` two-letter combination. */
export class SearchScihubDomainUpdater implements DomainUpdater {
  readonly updaterType = 'search';
  private static readonly DOMAIN_PREFIXES = ['http://sci-hub.', 'https://sci-hub.'];
  private static readonly OK_STATUS_CODES = [200];

  private readonly service: ScihubUrlService;
  private readonly keywordPattern: string;
  private readonly numWorkers: number;
  private readonly timeoutSeconds: number;

  constructor(options: { titleKeywordPattern?: string; numWorkers?: number; timeout?: number } = {}) {
    this.service = new ScihubUrlService();
    this.keywordPattern =
      options.titleKeywordPattern ??
      getString('scihub.domain.updater.search', 'scihub_title_keyword_pattern', 'Sci-Hub');
    this.numWorkers = options.numWorkers ?? getInt('scihub.domain.updater.search', 'num_workers', 500);
    this.timeoutSeconds = options.timeout ?? getInt('scihub.domain.updater.search', 'check_timeout', 10);
  }

  async updateDomains(): Promise<string[]> {
    const searchUrls = SearchScihubDomainUpdater.getSearchUrls();
    logger.info(`# Search valid SciHub domains from ${searchUrls.length} urls`);

    const checks = await mapWithConcurrency(searchUrls, this.numWorkers, async (url) => {
      try {
        return (await this.checkValidUrl(url)) ? url : null;
      } catch (error) {
        logger.error(`${url} generated an exception: ${errorMessage(error)}`);
        return null;
      }
    });

    const validUrls = checks.filter((url): url is string => url !== null);
    logger.info(`Found ${validUrls.length} valid SciHub domains in total: ${JSON.stringify(validUrls)}`);

    this.service.addUrls(validUrls.map((url) => ({ url })));
    logger.info(`Saved ${validUrls.length} SciHub domains to local db.`);
    return validUrls;
  }

  static getSearchUrls(): string[] {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const urls: string[] = [];
    for (const first of letters) {
      for (const second of letters) {
        for (const prefix of SearchScihubDomainUpdater.DOMAIN_PREFIXES) {
          urls.push(prefix + first + second);
        }
      }
    }
    return urls;
  }

  private async checkValidUrl(url: string): Promise<boolean> {
    let response;
    try {
      response = await axios.get<string>(url, {
        responseType: 'text',
        headers: defaultHeaders(),
        timeout: this.timeoutSeconds * 1000,
        validateStatus: () => true,
      });
    } catch {
      // Cannot connect to the url, skip it.
      return false;
    }

    if (!SearchScihubDomainUpdater.OK_STATUS_CODES.includes(response.status)) return false;

    const html = typeof response.data === 'string' ? response.data : String(response.data);
    const title = cheerio.load(html)('title').first().text();
    if (title.length > 0 && new RegExp(this.keywordPattern).test(title)) {
      logger.info(`# Found a SciHub domain url: ${url}`);
      return true;
    }
    return false;
  }
}

export type UpdaterFactory = () => DomainUpdater;

export const scihubDomainUpdaters: Record<string, UpdaterFactory> = {
  crawl: () => new CrawlingScihubDomainUpdater(),
  search: () => new SearchScihubDomainUpdater(),
};

export const UPDATE_MODES = Object.keys(scihubDomainUpdaters);
