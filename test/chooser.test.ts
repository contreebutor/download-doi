import { beforeEach, describe, expect, it } from 'vitest';
import {
  AvailabilityFirstScihubUrlChooser,
  createChooser,
  RandomScihubUrlChooser,
  SimpleScihubUrlChooser,
} from '../src/core/chooser.js';
import { ScihubUrlService } from '../src/db/service.js';

const service = new ScihubUrlService();

describe('scihub url choosers', () => {
  beforeEach(() => {
    service.clear();
    service.addUrls([{ url: 'https://a.example' }, { url: 'https://b.example' }, { url: 'https://c.example' }]);
  });

  it('simple chooser walks the stored order and then stops', () => {
    const chooser = new SimpleScihubUrlChooser();
    expect(chooser.size).toBe(3);
    expect([...chooser].map((url) => url.url)).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ]);
    expect(chooser.next()).toBeNull();
    expect(chooser.size).toBe(0);
  });

  it('random chooser never repeats a url', () => {
    const chooser = new RandomScihubUrlChooser();
    const seen = [...chooser].map((url) => url.url);
    expect(new Set(seen).size).toBe(3);
    expect(chooser.next()).toBeNull();
  });

  it('availability-first chooser puts the least-failing url first', () => {
    service.incrementFailedTimes('https://a.example');
    service.incrementFailedTimes('https://a.example');
    service.incrementSuccessTimes('https://b.example');
    service.incrementFailedTimes('https://b.example');

    const order = [...new AvailabilityFirstScihubUrlChooser()].map((url) => url.url);
    expect(order).toEqual(['https://c.example', 'https://b.example', 'https://a.example']);
  });

  it('createChooser falls back to availability-first for an unknown type', () => {
    expect(createChooser('does-not-exist').chooserType).toBe('availability_first');
    expect(createChooser('random').chooserType).toBe('random');
  });

  it('reports a size of zero when the db is empty', () => {
    service.clear();
    expect(new SimpleScihubUrlChooser().size).toBe(0);
  });
});
