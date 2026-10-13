import { describe, expect, it } from 'vitest';
import { configFilePath, getConfig, getInt, getSection, getString, getValue, sectionNames } from '../src/config/index.js';

describe('global config', () => {
  it('points at an existing ini file', () => {
    expect(configFilePath).toMatch(/global\.ini$/);
  });

  it('exposes every section SciDownl defines', () => {
    expect(sectionNames()).toEqual(
      expect.arrayContaining([
        'scihub.task',
        'scihub.task.extractor',
        'scihub.domain.updater.crawl',
        'scihub.domain.updater.search',
        'global_db',
        'log',
        'proxy',
      ]),
    );
  });

  it('reads values, with fallbacks for missing keys', () => {
    expect(getValue('scihub.task.extractor', 'pdf_tag_selector')).toBe('#pdf');
    expect(getValue('scihub.task.extractor', 'PDF_TAG_ATTR')).toBe('src');
    expect(getString('scihub.task.extractor', 'nope', 'fallback')).toBe('fallback');
    expect(getInt('scihub.domain.updater.search', 'num_workers', 1)).toBe(500);
    expect(getInt('scihub.domain.updater.search', 'nope', 7)).toBe(7);
  });

  it('caches the parsed file', () => {
    expect(getConfig()).toBe(getConfig());
  });

  it('returns an empty object for an unknown section', () => {
    expect(getSection('does.not.exist')).toEqual({});
  });
});
