import { describe, expect, it } from 'vitest';
import { HtmlPdfExtractor } from '../src/core/extractor.js';
import { HtmlContent } from '../src/core/content.js';
import { ScihubTask } from '../src/core/task.js';
import { PdfTagNotFoundError, ExtractError } from '../src/errors.js';

function page(pdfTag: string, title = 'Sci-Hub | A Great Paper | 10.1145/3375633'): HtmlContent {
  return new HtmlContent(`<html><head><title>${title}</title></head><body>${pdfTag}</body></html>`);
}

describe('HtmlPdfExtractor', () => {
  it('extracts an absolute pdf url and the title', () => {
    const info = new HtmlPdfExtractor(page('<embed id="pdf" src="https://sci-hub.se/a/b.pdf#nav=1">')).extract();
    expect(info.getUrl()).toBe('https://sci-hub.se/a/b.pdf#nav=1');
    expect(info.getTitle()).toBe('A Great Paper');
  });

  it('expands a protocol-relative url', () => {
    const info = new HtmlPdfExtractor(page('<embed id="pdf" src="//sci-hub.se/a/b.pdf#nav=1">')).extract();
    expect(info.getUrl()).toBe('https://sci-hub.se/a/b.pdf');
  });

  it('expands a root-relative url against the task referer', () => {
    const task = new ScihubTask({ sourceKeyword: '10.1145/3375633' });
    task.context.referer = 'https://sci-hub.ru';
    const info = new HtmlPdfExtractor(page('<embed id="pdf" src="/downloads/a/b.pdf#nav=1">'), task).extract();
    expect(info.getUrl()).toBe('https://sci-hub.ru/downloads/a/b.pdf');
  });

  it('returns an empty title when the page title has no separator', () => {
    const info = new HtmlPdfExtractor(page('<embed id="pdf" src="https://x/a.pdf">', 'Sci-Hub')).extract();
    expect(info.getTitle()).toBe('');
  });

  it('wraps a missing pdf tag in an ExtractError', () => {
    const extractor = new HtmlPdfExtractor(page('<div>nothing here</div>'));
    expect(() => extractor.extract()).toThrow(ExtractError);
    try {
      extractor.extract();
    } catch (error) {
      expect((error as Error).cause).toBeInstanceOf(PdfTagNotFoundError);
    }
  });

  it('replaces characters that are illegal in filenames and caps the length', () => {
    expect(HtmlPdfExtractor.cleanTitle(' a/b\\c:d*e?f"g<h>i|j ')).toBe('a b c d e f g h i j');
    expect(HtmlPdfExtractor.cleanTitle('x'.repeat(300))).toHaveLength(200);
  });
});
