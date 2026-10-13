import { beforeEach, describe, expect, it } from 'vitest';
import { ScihubUrlService } from '../src/db/service.js';

describe('ScihubUrlService', () => {
  const service = new ScihubUrlService();

  beforeEach(() => {
    service.clear();
  });

  it('stores urls and ignores duplicates', () => {
    service.addUrls([{ url: 'https://sci-hub.se' }, { url: 'https://sci-hub.ru' }]);
    service.addUrls([{ url: 'https://sci-hub.se' }]);
    expect(service.getAllUrls()).toHaveLength(2);
  });

  it('starts every url at zero successes and failures', () => {
    service.addUrls([{ url: 'https://sci-hub.se' }]);
    expect(service.getAllUrls()[0]).toEqual({ url: 'https://sci-hub.se', success_times: 0, failed_times: 0 });
  });

  it('increments counters', () => {
    service.addUrls([{ url: 'https://sci-hub.se' }]);
    service.incrementSuccessTimes('https://sci-hub.se');
    service.incrementSuccessTimes('https://sci-hub.se');
    service.incrementFailedTimes('https://sci-hub.se');
    expect(service.getAllUrls()[0]).toMatchObject({ success_times: 2, failed_times: 1 });
  });

  it('ignores a null or unknown url when incrementing', () => {
    expect(() => service.incrementSuccessTimes(null)).not.toThrow();
    expect(() => service.incrementFailedTimes(undefined)).not.toThrow();
    expect(() => service.incrementFailedTimes('https://not-saved.example')).not.toThrow();
  });

  it('adding an empty list is a no-op', () => {
    service.addUrls([]);
    expect(service.getAllUrls()).toHaveLength(0);
  });
});
