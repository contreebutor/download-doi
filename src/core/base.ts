/** Shared contracts for the crawl -> extract -> download pipeline. */
import type { ScihubUrl } from '../db/entities.js';

export type SourceType = 'doi' | 'pmid' | 'title';

/** A paper identifier plus the metadata needed to build a request for it. */
export interface Source {
  readonly type: SourceType;
  /** The identifier itself: the DOI, the PMID or the title. */
  readonly keyword: string;
  toJSON(): Record<string, string>;
}

export interface Content<T> {
  readonly type: string;
  readonly content: T;
}

export interface Information {
  toJSON(): Record<string, string>;
}

export type TaskStatus =
  | 'initialized'
  | 'crawling'
  | 'crawled'
  | 'crawling_failed'
  | 'extracting'
  | 'extracted'
  | 'extracting_failed'
  | 'downloading'
  | 'downloaded'
  | 'downloading_failed';

/** Proxy map keyed by scheme, e.g. `{ http: 'http://127.0.0.1:7890' }`. */
export type Proxies = Partial<Record<'http' | 'https', string>>;

/** Mutable state shared by every step of one task. */
export interface TaskContext {
  status: TaskStatus;
  proxies: Proxies;
  source?: Source;
  /** The SciHub domain the current attempt is using. */
  referer?: string;
  title?: string;
  pdfUrl?: string;
  out?: string;
  filename?: string;
  error?: Error;
}

export abstract class BaseTask {
  readonly context: TaskContext;

  constructor(proxies: Proxies = {}) {
    this.context = { status: 'initialized', proxies };
  }

  abstract run(): Promise<unknown>;
}

export interface Crawler<C> {
  crawl(): Promise<C>;
}

export interface Extractor<I> {
  extract(): I;
}

export interface Downloader {
  download(out: string): Promise<string>;
}

export interface DomainUpdater {
  updateDomains(): Promise<string[]>;
}

/**
 * Yields SciHub urls in the order a strategy prefers. `size` reports how many
 * urls are still available, which the task uses to decide whether to refresh
 * the local domain list first.
 */
export interface ScihubUrlChooser extends Iterable<ScihubUrl> {
  readonly chooserType: string;
  readonly size: number;
  next(): ScihubUrl | null;
}
