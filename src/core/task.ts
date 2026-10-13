/** Task implementation: choose a mirror, crawl, extract, download. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BaseTask, type Proxies, type ScihubUrlChooser, type SourceType } from './base.js';
import { createSource } from './source.js';
import { ScihubCrawler } from './crawler.js';
import { HtmlPdfExtractor } from './extractor.js';
import { UrlDownloader } from './downloader.js';
import { createChooser, type ChooserFactory, getChooserFactory } from './chooser.js';
import { CrawlingScihubDomainUpdater } from './updater.js';
import type { DomainUpdater } from './base.js';
import { ScihubUrlService } from '../db/service.js';
import { getLogger } from '../logger.js';
import { errorMessage } from '../errors.js';

const logger = getLogger();

export interface ScihubTaskOptions {
  sourceKeyword: string | number;
  sourceType?: SourceType | string;
  /** A specific mirror to use. When omitted, one is chosen from the local db. */
  scihubUrl?: string | null;
  chooserFactory?: ChooserFactory;
  /** Output directory (trailing separator) or file path. */
  out?: string | null;
  proxies?: Proxies;
  /** Draw a download progress bar. Defaults to on for an interactive terminal. */
  progress?: boolean;
}

export interface ScihubTaskResult {
  out: string;
  filename: string;
  title: string;
  pdfUrl: string;
  scihubUrl: string;
  sourceType: string;
  sourceKeyword: string;
}

/**
 * Mirrors `posixpath.split`: splits at the last separator and keeps a trailing
 * separator meaningful, so `./paper/` is a directory and `./paper` is a file.
 */
export function splitPath(pathname: string): [string, string] {
  const index = pathname.lastIndexOf('/') + 1;
  let head = pathname.slice(0, index);
  const tail = pathname.slice(index);
  if (head.length > 0 && !/^\/+$/.test(head)) {
    head = head.replace(/\/+$/, '');
  }
  return [head, tail];
}

export class ScihubTask extends BaseTask {
  readonly sourceKeyword: string;
  readonly sourceType: string;
  private readonly scihubUrl: string | null;
  private readonly chooserFactory: ChooserFactory;
  private chooser: ScihubUrlChooser;
  private readonly out: string | null;
  private readonly progress: boolean | undefined;
  private readonly service: ScihubUrlService;
  private readonly updater: DomainUpdater;

  constructor(options: ScihubTaskOptions) {
    super(options.proxies ?? {});
    this.sourceKeyword = String(options.sourceKeyword);
    this.sourceType = options.sourceType ?? 'doi';
    this.scihubUrl = options.scihubUrl ?? null;
    this.chooserFactory = options.chooserFactory ?? getChooserFactory();
    this.chooser = this.chooserFactory();
    this.out = options.out ?? null;
    this.progress = options.progress;
    this.service = new ScihubUrlService();
    this.updater = new CrawlingScihubDomainUpdater();
  }

  /**
   * Runs the task. Returns the download result, or `null` if every known
   * mirror failed.
   */
  async run(): Promise<ScihubTaskResult | null> {
    if (this.scihubUrl !== null) {
      logger.info(`Choose the scihub url: ${this.scihubUrl}`);
      return await this.runWith(this.scihubUrl);
    }

    // Refresh the domain list if we have nothing saved yet.
    if (this.chooser.size === 0) {
      await this.updater.updateDomains();
      this.chooser = this.chooserFactory();
    }

    let index = 0;
    for (const scihubUrl of this.chooser) {
      try {
        logger.info(`Choose scihub url [${index}]: ${scihubUrl.url}`);
        return await this.runWith(scihubUrl.url);
      } catch {
        logger.warning(
          `Error occurs, task status: ${this.context.status}, ` +
            `error: ${errorMessage(this.context.error)}`,
        );
        index += 1;
      }
    }

    logger.error(`Failed to download the paper: ${this.sourceKeyword}. Please try again.`);
    return null;
  }

  private async runWith(scihubUrl: string): Promise<ScihubTaskResult> {
    const source = createSource(this.sourceKeyword, this.sourceType);

    const crawler = new ScihubCrawler(source, scihubUrl, this);
    const content = await crawler.crawl();

    const extractor = new HtmlPdfExtractor(content, this);
    const info = extractor.extract();

    const out = await this.resolveOutPath(info.getTitle());

    const downloader = new UrlDownloader(info, this, { progress: this.progress });
    const filename = await downloader.download(out);

    const referer = this.context.referer ?? scihubUrl;
    this.service.incrementSuccessTimes(referer);

    return {
      out,
      filename,
      title: info.getTitle(),
      pdfUrl: info.getUrl(),
      scihubUrl: referer,
      sourceType: source.type,
      sourceKeyword: source.keyword,
    };
  }

  /** Turns `out` plus the paper title into a concrete file path. */
  private async resolveOutPath(title: string): Promise<string> {
    const fallbackName = `${title.length > 0 ? title : this.sourceKeyword.replace(/[/\\:*?"<>|]/g, ' ').trim()}.pdf`;

    if (this.out === null) {
      // Save to the current directory under the paper's title.
      return fallbackName;
    }

    const [dirpath, rawFilename] = splitPath(this.out);
    if (dirpath.length > 0) {
      await mkdir(dirpath, { recursive: true });
    }

    let filename = rawFilename;
    if (filename.length === 0) {
      filename = fallbackName;
    }
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename += '.pdf';
    }
    return dirpath.length > 0 ? join(dirpath, filename) : filename;
  }
}

export { createChooser };
