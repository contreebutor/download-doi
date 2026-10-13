/** Information implementations: what an extractor hands to a downloader. */
import type { Information } from './base.js';

export const PROTOCOL_PREFIXES = ['https://', 'http://'] as const;
export const DEFAULT_PROTOCOL_PREFIX = PROTOCOL_PREFIXES[0];

export class UrlInformation implements Information {
  constructor(readonly url: string) {}

  getUrl(): string {
    return this.url;
  }

  toJSON(): Record<string, string> {
    return { url: this.url };
  }
}

export class PdfUrlTitleInformation extends UrlInformation {
  constructor(
    url: string,
    readonly title: string,
  ) {
    super(url);
  }

  getTitle(): string {
    return this.title;
  }

  override toJSON(): Record<string, string> {
    return { url: this.url, title: this.title };
  }

  override toString(): string {
    return `PdfUrlTitleInformation[url=${this.url}, title=${this.title}]`;
  }
}
