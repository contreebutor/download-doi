import { describe, expect, it } from 'vitest';
import { splitPath } from '../src/core/task.js';
import { planTasks, mergeProxies } from '../src/api/tasks.js';
import { parseProxyOption } from '../src/http.js';

describe('splitPath', () => {
  it('keeps a trailing separator meaningful', () => {
    expect(splitPath('./paper/')).toEqual(['./paper', '']);
    expect(splitPath('./paper')).toEqual(['.', 'paper']);
    expect(splitPath('paper.pdf')).toEqual(['', 'paper.pdf']);
    expect(splitPath('/abs/dir/paper.pdf')).toEqual(['/abs/dir', 'paper.pdf']);
    expect(splitPath('/')).toEqual(['/', '']);
  });
});

describe('planTasks', () => {
  it('creates one task per identifier, grouped by type', () => {
    const tasks = planTasks({ doi: ['a', 'b'], pmid: ['1'], title: ['t'] });
    expect(tasks.map((task) => task.sourceType)).toEqual(['doi', 'doi', 'pmid', 'title']);
    expect(tasks.map((task) => task.sourceKeyword)).toEqual(['a', 'b', '1', 't']);
  });

  it('treats out as a directory once there is more than one identifier', () => {
    expect(planTasks({ doi: ['a', 'b'], out: './papers' })[0]?.out).toBe('./papers/');
    expect(planTasks({ doi: ['a'], out: './papers' })[0]?.out).toBe('./papers');
  });

  it('returns nothing without identifiers', () => {
    expect(planTasks({})).toEqual([]);
  });
});

describe('proxy handling', () => {
  it('parses SCHEME=ADDRESS', () => {
    expect(parseProxyOption('http=http://127.0.0.1:7890')).toEqual({ http: 'http://127.0.0.1:7890' });
    expect(parseProxyOption('https=socks5://127.0.0.1:7890')).toEqual({ https: 'socks5://127.0.0.1:7890' });
  });

  it('ignores a malformed or unknown scheme', () => {
    expect(parseProxyOption('nonsense')).toEqual({});
    expect(parseProxyOption('ftp=ftp://x')).toEqual({});
    expect(parseProxyOption(undefined)).toEqual({});
  });

  it('lets the user proxy win over the configured one', () => {
    expect(mergeProxies({ http: 'http://config' }, { http: 'http://user' })).toEqual({ http: 'http://user' });
  });
});
