/** Strategies for picking which SciHub domain to try next. */
import type { ScihubUrlChooser } from './base.js';
import type { ScihubUrl } from '../db/entities.js';
import { ScihubUrlService } from '../db/service.js';
import { getString } from '../config/index.js';

abstract class CursorChooser implements ScihubUrlChooser {
  abstract readonly chooserType: string;
  protected urls: ScihubUrl[] = [];
  protected cursor = 0;

  get size(): number {
    return this.urls.length - this.cursor;
  }

  next(): ScihubUrl | null {
    if (this.cursor < 0 || this.cursor >= this.urls.length) return null;
    const selected = this.urls[this.cursor] as ScihubUrl;
    this.cursor += 1;
    return selected;
  }

  [Symbol.iterator](): Iterator<ScihubUrl> {
    return {
      next: (): IteratorResult<ScihubUrl> => {
        const value = this.next();
        return value === null ? { done: true, value: undefined } : { done: false, value };
      },
    };
  }
}

/** Chooses urls in the order they are stored in the database. */
export class SimpleScihubUrlChooser extends CursorChooser {
  readonly chooserType = 'simple';

  constructor(service: ScihubUrlService = new ScihubUrlService()) {
    super();
    this.urls = service.getAllUrls();
  }
}

/** Chooses urls at random; one url is never handed out twice. */
export class RandomScihubUrlChooser implements ScihubUrlChooser {
  readonly chooserType = 'random';
  private remaining: ScihubUrl[];

  constructor(service: ScihubUrlService = new ScihubUrlService()) {
    this.remaining = service.getAllUrls();
  }

  get size(): number {
    return this.remaining.length;
  }

  next(): ScihubUrl | null {
    if (this.remaining.length === 0) return null;
    const index = Math.floor(Math.random() * this.remaining.length);
    const [selected] = this.remaining.splice(index, 1);
    return selected ?? null;
  }

  [Symbol.iterator](): Iterator<ScihubUrl> {
    return {
      next: (): IteratorResult<ScihubUrl> => {
        const value = this.next();
        return value === null ? { done: true, value: undefined } : { done: false, value };
      },
    };
  }
}

/**
 * Chooses the urls least likely to fail first, where
 * `failed_rate = failed_times / (success_times + failed_times + 0.01)`.
 * The 0.01 avoids dividing by zero for a url that was never tried.
 */
export class AvailabilityFirstScihubUrlChooser extends CursorChooser {
  readonly chooserType = 'availability_first';

  constructor(service: ScihubUrlService = new ScihubUrlService()) {
    super();
    this.urls = service
      .getAllUrls()
      .sort((a, b) => failedRate(a) - failedRate(b));
  }
}

function failedRate(url: ScihubUrl): number {
  return url.failed_times / (url.success_times + url.failed_times + 0.01);
}

export type ChooserFactory = () => ScihubUrlChooser;

export const scihubUrlChoosers: Record<string, ChooserFactory> = {
  simple: () => new SimpleScihubUrlChooser(),
  random: () => new RandomScihubUrlChooser(),
  availability_first: () => new AvailabilityFirstScihubUrlChooser(),
};

export const DEFAULT_CHOOSER_TYPE = 'availability_first';

/** Resolves a chooser factory by name, falling back to availability-first. */
export function getChooserFactory(chooserType?: string): ChooserFactory {
  const name = chooserType ?? getString('scihub.task', 'scihub_url_chooser_type', DEFAULT_CHOOSER_TYPE);
  return scihubUrlChoosers[name] ?? scihubUrlChoosers[DEFAULT_CHOOSER_TYPE]!;
}

export function createChooser(chooserType?: string): ScihubUrlChooser {
  return getChooserFactory(chooserType)();
}
