/** Source implementations: the paper identifier a task starts from. */
import type { Source, SourceType } from './base.js';
import { EmptyDoiError, EmptyPmidError, EmptyTitleError } from '../errors.js';

const DOI_PROTOCOLS = ['http://', 'https://'] as const;

export class DoiSource implements Source {
  readonly type = 'doi' as const;
  readonly keyword: string;
  readonly protocol: string;

  constructor(doi: string) {
    this.keyword = DoiSource.cleanDoi(doi);
    this.protocol = DoiSource.extractProtocol(doi);
  }

  static cleanDoi(doi: string): string {
    if (doi === null || doi === undefined) {
      throw new EmptyDoiError('Empty doi is given');
    }
    if (typeof doi !== 'string') {
      throw new TypeError(`Doi must be a string, got a ${typeof doi} instead`);
    }
    if (doi.length === 0) {
      throw new EmptyDoiError('Empty doi is given');
    }
    let cleaned = doi;
    for (const protocol of DOI_PROTOCOLS) {
      cleaned = cleaned.split(protocol).join('');
    }
    return cleaned;
  }

  static extractProtocol(doi: string): string {
    for (const protocol of DOI_PROTOCOLS) {
      if (typeof doi === 'string' && doi.includes(protocol)) {
        return protocol.split(':')[0] as string;
      }
    }
    return 'https';
  }

  get doi(): string {
    return this.keyword;
  }

  toJSON(): Record<string, string> {
    return { type: this.type, doi: this.keyword, protocol: this.protocol };
  }

  toString(): string {
    return `DoiSource[type=${this.type}, id=${this.keyword}]`;
  }
}

export class PmidSource implements Source {
  readonly type = 'pmid' as const;
  readonly keyword: string;

  constructor(pmid: string | number) {
    this.keyword = PmidSource.cleanPmid(pmid);
  }

  static cleanPmid(pmid: string | number): string {
    if (pmid === null || pmid === undefined) {
      throw new EmptyPmidError('Empty pmid is given');
    }
    if (typeof pmid !== 'string' && typeof pmid !== 'number') {
      throw new TypeError(`PMID must be either a string or a number, got a ${typeof pmid} instead`);
    }
    if (typeof pmid === 'number' && !Number.isFinite(pmid)) {
      throw new TypeError('PMID must be a finite number');
    }
    const asString = String(pmid);
    if (asString.length === 0) {
      throw new EmptyPmidError('Empty pmid is given');
    }
    return asString;
  }

  get pmid(): string {
    return this.keyword;
  }

  toJSON(): Record<string, string> {
    return { type: this.type, pmid: this.keyword };
  }

  toString(): string {
    return `PmidSource[type=${this.type}, id=${this.keyword}]`;
  }
}

export class TitleSource implements Source {
  readonly type = 'title' as const;
  readonly keyword: string;

  constructor(title: string) {
    this.keyword = TitleSource.cleanTitle(title);
  }

  static cleanTitle(title: string): string {
    if (title === null || title === undefined) {
      throw new EmptyTitleError('Empty title is given');
    }
    if (typeof title !== 'string') {
      throw new TypeError(`Title must be a string, got a ${typeof title} instead`);
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new EmptyTitleError('Empty title is given');
    }
    return trimmed;
  }

  get title(): string {
    return this.keyword;
  }

  toJSON(): Record<string, string> {
    return { type: this.type, title: this.keyword };
  }

  toString(): string {
    return `TitleSource[type=${this.type}, id=${this.keyword}]`;
  }
}

const FACTORIES: Record<SourceType, (keyword: string) => Source> = {
  doi: (keyword) => new DoiSource(keyword),
  pmid: (keyword) => new PmidSource(keyword),
  title: (keyword) => new TitleSource(keyword),
};

export const SOURCE_TYPES = Object.keys(FACTORIES) as SourceType[];

export function isSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as string[]).includes(value.toLowerCase());
}

/** Builds a source, falling back to DOI for an unknown type, as SciDownl does. */
export function createSource(keyword: string | number, sourceType: string = 'doi'): Source {
  const normalized = String(sourceType).toLowerCase();
  const factory = FACTORIES[normalized as SourceType] ?? FACTORIES.doi;
  return factory(String(keyword));
}
