import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/api/app.js';
import { resolveDownloadPath } from '../src/api/routes.js';
import { ScihubUrlService } from '../src/db/service.js';
import { FAKE_PDF, startFakeScihub, type FakeScihub } from './fake-scihub.js';

describe('Express API', () => {
  let server: Server;
  let baseUrl: string;
  let downloadDir: string;
  let scihub: FakeScihub;
  const service = new ScihubUrlService();

  beforeAll(async () => {
    downloadDir = await mkdtemp(join(tmpdir(), 'download-doi-api-'));
    server = createApp({ downloadDir, requestLogging: false }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(downloadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    scihub = await startFakeScihub();
    service.clear();
  });

  afterEach(async () => {
    await scihub.close();
  });

  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('reports health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('exposes the global config', async () => {
    const response = await fetch(`${baseUrl}/api/config/scihub.task.extractor/pdf_tag_selector`);
    expect(await response.json()).toMatchObject({ value: '#pdf' });

    expect((await fetch(`${baseUrl}/api/config/nope`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/config/scihub.task/nope`)).status).toBe(404);
  });

  it('lists saved domains, most successful first', async () => {
    service.addUrls([{ url: 'https://a.example' }, { url: 'https://b.example' }]);
    service.incrementSuccessTimes('https://b.example');

    const body = (await (await fetch(`${baseUrl}/api/domains`)).json()) as {
      count: number;
      domains: { url: string }[];
    };
    expect(body.count).toBe(2);
    expect(body.domains[0]?.url).toBe('https://b.example');
  });

  it('rejects an unknown domain update mode', async () => {
    const response = await post('/api/domains/update', { mode: 'telepathy' });
    expect(response.status).toBe(400);
  });

  it('downloads a paper and serves the stored file back', async () => {
    const response = await post('/api/papers/download', {
      doi: '10.1145/3375633',
      scihubUrl: scihub.url,
      out: 'api-paper.pdf',
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { count: number; results: Record<string, string>[] };
    expect(body.count).toBe(1);
    expect(body.results[0]).toMatchObject({ status: 'ok', filename: 'api-paper.pdf', title: 'A Great Paper' });

    const file = await fetch(`${baseUrl}${body.results[0]?.['fileUrl']}`);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(FAKE_PDF);

    expect((await fetch(`${baseUrl}${body.results[0]?.['fileUrl']}`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${baseUrl}${body.results[0]?.['fileUrl']}`)).status).toBe(404);
  });

  it('accepts several identifiers in one request', async () => {
    const response = await post('/api/papers/download', {
      doi: ['10.1145/3375633', '10.1145/3375634'],
      scihubUrl: scihub.url,
      out: 'batch/',
    });
    const body = (await response.json()) as { count: number; results: { status: string }[] };
    expect(body.count).toBe(2);
    expect(body.results.every((result) => result.status === 'ok')).toBe(true);
  });

  it('streams a single paper back as a pdf', async () => {
    const response = await post('/api/papers/stream', {
      keyword: '10.1145/3375633',
      type: 'doi',
      scihubUrl: scihub.url,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_PDF);
  });

  it('refuses a stream request carrying several identifiers', async () => {
    const response = await post('/api/papers/stream', { doi: ['a', 'b'], scihubUrl: scihub.url });
    expect(response.status).toBe(400);
  });

  it('requires at least one identifier', async () => {
    const response = await post('/api/papers/download', { out: 'x.pdf' });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown source type', async () => {
    const response = await post('/api/papers/download', { keyword: 'x', type: 'isbn' });
    expect(response.status).toBe(400);
  });

  it('reports a failed download without failing the request', async () => {
    const response = await post('/api/papers/download', {
      doi: '10.1145/3375633',
      scihubUrl: 'http://127.0.0.1:1',
      out: 'never.pdf',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { status: string; error: string }[] };
    expect(body.results[0]?.status).toBe('failed');
  });

  it('404s an unknown route', async () => {
    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404);
  });
});

describe('resolveDownloadPath', () => {
  const root = '/srv/papers';

  it('defaults to the download directory', () => {
    expect(resolveDownloadPath(root, undefined)).toBe('/srv/papers/');
  });

  it('keeps a relative path inside the download directory', () => {
    expect(resolveDownloadPath(root, 'a/b.pdf')).toBe('/srv/papers/a/b.pdf');
    expect(resolveDownloadPath(root, 'a/')).toBe('/srv/papers/a/');
  });

  it('rejects absolute paths and traversal', () => {
    expect(() => resolveDownloadPath(root, '/etc/passwd')).toThrow(/relative path/);
    expect(() => resolveDownloadPath(root, '../../etc/passwd')).toThrow(/inside the server/);
  });
});
