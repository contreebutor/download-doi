import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScihubTask } from '../src/core/task.js';
import { scihubDownload } from '../src/api/scihub.js';
import { ScihubUrlService } from '../src/db/service.js';
import { FAKE_PDF, startFakeScihub, type FakeScihub } from './fake-scihub.js';

describe('ScihubTask end to end (against a local fake mirror)', () => {
  let scihub: FakeScihub;
  let workdir: string;
  const service = new ScihubUrlService();

  beforeEach(async () => {
    scihub = await startFakeScihub();
    workdir = await mkdtemp(join(tmpdir(), 'download-doi-pipeline-'));
    service.clear();
  });

  afterEach(async () => {
    await scihub.close();
    await rm(workdir, { recursive: true, force: true });
  });

  it('crawls, extracts and downloads to an explicit file path', async () => {
    const out = join(workdir, 'paper-1.pdf');
    const result = await new ScihubTask({
      sourceKeyword: 'https://doi.org/10.1145/3375633',
      sourceType: 'doi',
      scihubUrl: scihub.url,
      out,
      progress: false,
    }).run();

    expect(result).not.toBeNull();
    expect(result?.out).toBe(out);
    expect(result?.title).toBe('A Great Paper');
    expect(result?.pdfUrl).toBe(`${scihub.url}/downloads/paper.pdf`);
    expect(await readFile(out)).toEqual(FAKE_PDF);
  });

  it('names the file after the paper title when out is a directory', async () => {
    const result = await new ScihubTask({
      sourceKeyword: '10.1145/3375633',
      scihubUrl: scihub.url,
      out: `${workdir}/`,
      progress: false,
    }).run();

    expect(result?.filename).toBe('A Great Paper.pdf');
    expect(await readFile(join(workdir, 'A Great Paper.pdf'))).toEqual(FAKE_PDF);
  });

  it('appends .pdf to an extension-less output file', async () => {
    const result = await new ScihubTask({
      sourceKeyword: '10.1145/3375633',
      scihubUrl: scihub.url,
      out: join(workdir, 'my-paper'),
      progress: false,
    }).run();

    expect(result?.filename).toBe('my-paper.pdf');
  });

  it('records a success against the mirror it used', async () => {
    service.addUrls([{ url: scihub.url }]);
    await new ScihubTask({
      sourceKeyword: '10.1145/3375633',
      scihubUrl: scihub.url,
      out: join(workdir, 'p.pdf'),
      progress: false,
    }).run();

    expect(service.getAllUrls()[0]).toMatchObject({ url: scihub.url, success_times: 1 });
  });

  it('falls back to a saved mirror when no url is given, and counts the failure of a bad one', async () => {
    service.addUrls([{ url: 'http://127.0.0.1:1' }, { url: scihub.url }]);
    // The unreachable mirror has no history, so make the good one clearly better.
    service.incrementFailedTimes('http://127.0.0.1:1');

    const result = await scihubDownload({
      keyword: '10.1145/3375633',
      out: join(workdir, 'auto.pdf'),
      progress: false,
    });

    expect(result?.scihubUrl).toBe(scihub.url);
    expect(await readFile(join(workdir, 'auto.pdf'))).toEqual(FAKE_PDF);
  });

  it('returns null when every mirror fails', async () => {
    service.addUrls([{ url: 'http://127.0.0.1:1' }]);
    const result = await new ScihubTask({
      sourceKeyword: '10.1145/3375633',
      out: join(workdir, 'nope.pdf'),
      progress: false,
    }).run();

    expect(result).toBeNull();
    expect(service.getAllUrls()[0]).toMatchObject({ failed_times: 1 });
  });

  it('surfaces a mirror page without a pdf tag as a failed task', async () => {
    const empty = await startFakeScihub({ pdfTag: '<p>no pdf here</p>' });
    try {
      const task = new ScihubTask({
        sourceKeyword: '10.1145/3375633',
        scihubUrl: empty.url,
        out: join(workdir, 'missing.pdf'),
        progress: false,
      });
      await expect(task.run()).rejects.toThrow(/extracting/i);
      expect(task.context.status).toBe('extracting_failed');
    } finally {
      await empty.close();
    }
  });
});
