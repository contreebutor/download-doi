/** Content implementations: what a crawler hands to an extractor. */
import type { Content } from './base.js';

export class HtmlContent implements Content<string> {
  readonly type = 'html' as const;
  readonly content: string;

  constructor(html = '') {
    this.content = html;
  }

  get length(): number {
    return this.content.length;
  }

  toString(): string {
    return `HtmlContent[html = ${this.content}]`;
  }
}

export class JsonContent<T = unknown> implements Content<T | null> {
  readonly type = 'json' as const;
  readonly content: T | null;

  constructor(json: T | null = null) {
    this.content = json;
  }

  toString(): string {
    return `JsonContent[json = ${JSON.stringify(this.content)}]`;
  }
}
