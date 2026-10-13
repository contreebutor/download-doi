/** Extractor implementations: pull the pdf url and title out of a SciHub page. */
import * as cheerio from 'cheerio';
import type { BaseTask, Extractor } from './base.js';
import type { HtmlContent } from './content.js';
import { DEFAULT_PROTOCOL_PREFIX, PdfUrlTitleInformation, PROTOCOL_PREFIXES } from './information.js';
import { createChooser } from './chooser.js';
import { ExtractError, PdfTagNotFoundError, PdfUrlNotFoundError, errorMessage } from '../errors.js';
import { ScihubUrlService } from '../db/service.js';
import { getLogger } from '../logger.js';
import { getString } from '../config/index.js';

const logger = getLogger();

export const FALLBACK_REFERER = 'https://sci-hub.se';

/** First url the configured chooser offers, used when a task did not set one. */
export function getDefaultReferer(): string {
  try {
    const chooser = createChooser();
    const first = chooser.size === 0 ? null : chooser.next();
    return first === null ? FALLBACK_REFERER : first.url;
  } catch {
    return FALLBACK_REFERER;
  }
}

/** Illegal filename characters: / \ : * ? " < > | */
const ILLEGAL_TITLE_CHARS = /[/\\:*?"<>|]/g;

export class HtmlPdfExtractor implements Extractor<PdfUrlTitleInformation> {
  private readonly service: ScihubUrlService;
  private readonly pdfTagSelector: string;
  private readonly pdfTagAttr: string;

  constructor(
    private readonly content: HtmlContent,
    private readonly task?: BaseTask,
  ) {
    this.service = new ScihubUrlService();
    this.pdfTagSelector = getString('scihub.task.extractor', 'pdf_tag_selector', '#pdf');
    this.pdfTagAttr = getString('scihub.task.extractor', 'pdf_tag_attr', 'src');

    if (this.task !== undefined) {
      this.task.context.status = 'extracting';
    }
  }

  extract(): PdfUrlTitleInformation {
    try {
      const $ = cheerio.load(this.content.content);
      const url = this.extractUrl($);
      const title = this.extractTitle($);
      const info = new PdfUrlTitleInformation(url, title);

      logger.info(`* Extracted information: ${String(info)}`);
      if (this.task !== undefined) {
        this.task.context.pdfUrl = url;
        this.task.context.title = title;
        this.task.context.status = 'extracted';
      }
      return info;
    } catch (error) {
      if (this.task !== undefined) {
        this.task.context.status = 'extracting_failed';
        this.task.context.error = error instanceof Error ? error : new Error(String(error));
        this.service.incrementFailedTimes(this.task.context.referer);
      }
      throw new ExtractError(`Error occurs when extracting: ${errorMessage(error)}`, { cause: error });
    }
  }

  private extractUrl($: cheerio.CheerioAPI): string {
    const rawUrl = this.extractRawUrl($);

    for (const prefix of PROTOCOL_PREFIXES) {
      if (rawUrl.includes(prefix)) return rawUrl;
    }

    let url = rawUrl.split('#')[0] ?? '';
    if (url.startsWith('//')) {
      url = DEFAULT_PROTOCOL_PREFIX + url.slice(2);
    } else if (url.startsWith('/')) {
      const referer = this.task?.context.referer ?? getDefaultReferer();
      url = referer + url;
    }
    return url;
  }

  private extractRawUrl($: cheerio.CheerioAPI): string {
    const pdfTag = $(this.pdfTagSelector).first();
    if (pdfTag.length === 0) {
      throw new PdfTagNotFoundError(
        `No pdf tag was found in the given content with the selector: ${this.pdfTagSelector}`,
      );
    }
    const rawUrl = pdfTag.attr(this.pdfTagAttr);
    if (rawUrl === undefined || rawUrl.length === 0) {
      throw new PdfUrlNotFoundError(
        `No pdf url was found in the pdf tag: ${pdfTag.text()} with the attr ${this.pdfTagAttr}`,
      );
    }
    return rawUrl;
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    const pageTitle = $('title').first().text();
    if (pageTitle.length === 0 || !pageTitle.includes('|')) {
      return '';
    }
    return HtmlPdfExtractor.cleanTitle(pageTitle.split('|')[1] ?? '');
  }

  static cleanTitle(title: string): string {
    return title.replace(ILLEGAL_TITLE_CHARS, ' ').slice(0, 200).trim();
  }
}
