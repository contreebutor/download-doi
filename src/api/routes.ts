/** Express routes mirroring the CLI commands. */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { ScihubTask } from '../core/task.js';
import { scihubDomainUpdaters, UPDATE_MODES } from '../core/updater.js';
import { ScihubUrlService } from '../db/service.js';
import { configFilePath, getConfig, getSection, getValue, sectionNames } from '../config/index.js';
import { isSourceType } from '../core/source.js';
import { parseProxyOption } from '../http.js';
import { mergeProxies, planTasks } from './tasks.js';
import { getLogger } from '../logger.js';
import { errorMessage } from '../errors.js';
import type { Proxies } from '../core/base.js';

const logger = getLogger();

export interface RouterOptions {
  /** Directory every download is written into. Client paths cannot escape it. */
  downloadDir: string;
}

/** Express 4 does not forward a rejected promise, so async handlers are wrapped. */
function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function asList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined).map((item) => String(item));
  }
  return [String(value)];
}

function readProxies(body: Record<string, unknown>): Proxies {
  const proxies: Proxies = {};
  const raw = body['proxies'];
  if (raw !== null && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (typeof record['http'] === 'string') proxies.http = record['http'];
    if (typeof record['https'] === 'string') proxies.https = record['https'];
  }
  if (typeof body['proxy'] === 'string') {
    Object.assign(proxies, parseProxyOption(body['proxy']));
  }
  return proxies;
}

/** Proxies configured in global.ini. */
export function configuredProxies(): Proxies {
  const section = getSection('proxy');
  const proxies: Proxies = {};
  if (typeof section['http'] === 'string' && section['http'].length > 0) proxies.http = section['http'];
  if (typeof section['https'] === 'string' && section['https'].length > 0) proxies.https = section['https'];
  return proxies;
}

/**
 * Resolves a client-supplied output path inside `downloadDir`.
 * Absolute paths and `..` segments are rejected so a request cannot write
 * anywhere else on the server.
 */
export function resolveDownloadPath(downloadDir: string, out: unknown): string {
  const root = resolve(downloadDir);
  if (out === undefined || out === null || out === '') {
    return `${root}/`;
  }
  const candidate = String(out);
  if (isAbsolute(candidate)) {
    throw new HttpError(400, 'out must be a relative path inside the server download directory');
  }
  const trailingSlash = candidate.endsWith('/');
  const target = resolve(root, candidate);
  const rel = relative(root, target);
  if (rel.startsWith('..')) {
    throw new HttpError(400, 'out must stay inside the server download directory');
  }
  return trailingSlash ? `${target}/` : target;
}

export function createRouter(options: RouterOptions): Router {
  const router = Router();
  const service = new ScihubUrlService();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', downloadDir: resolve(options.downloadDir) });
  });

  router.get('/config', (_req: Request, res: Response) => {
    res.json({ path: configFilePath, sections: sectionNames(), configs: getConfig() });
  });

  router.get('/config/:section', (req: Request, res: Response) => {
    const section = req.params['section'] as string;
    if (!sectionNames().includes(section)) {
      throw new HttpError(404, `Section '${section}' is not found. Valid sections: ${sectionNames().join(', ')}`);
    }
    res.json({ section, values: getSection(section) });
  });

  router.get('/config/:section/:key', (req: Request, res: Response) => {
    const section = req.params['section'] as string;
    const key = req.params['key'] as string;
    if (!sectionNames().includes(section)) {
      throw new HttpError(404, `Section '${section}' is not found. Valid sections: ${sectionNames().join(', ')}`);
    }
    const value = getValue(section, key);
    if (value === undefined) {
      throw new HttpError(404, `Key '${key}' is not found. Valid keys: ${Object.keys(getSection(section)).join(', ')}`);
    }
    res.json({ section, key, value });
  });

  router.get('/domains', (_req: Request, res: Response) => {
    const urls = service.getAllUrls().sort((a, b) => b.success_times - a.success_times);
    res.json({ count: urls.length, domains: urls });
  });

  router.post('/domains/update', wrap(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const mode = typeof body['mode'] === 'string' ? body['mode'] : 'crawl';
    const factory = scihubDomainUpdaters[mode];
    if (factory === undefined) {
      throw new HttpError(400, `mode must be one of ${UPDATE_MODES.join(', ')}, got '${mode}' instead.`);
    }
    const domains = await factory().updateDomains();
    res.json({ mode, count: domains.length, domains });
  }));

  router.post('/papers/download', wrap(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const results = await runDownloads(body, options.downloadDir);
    res.json({ count: results.length, results });
  }));

  /** Downloads one paper and streams the pdf straight back to the client. */
  router.post('/papers/stream', wrap(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const results = await runDownloads(body, options.downloadDir, { single: true });
    const result = results[0];
    if (result === undefined || result.status !== 'ok' || result.out === undefined) {
      throw new HttpError(502, result?.error ?? 'Failed to download the paper from every known SciHub mirror.');
    }

    const filePath = result.out;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(filePath))}"`);
    const fileStat = await stat(filePath);
    res.setHeader('Content-Length', String(fileStat.size));

    const stream = createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }));

  router.get('/papers/files/:filename', wrap(async (req: Request, res: Response) => {
    const filename = basename(req.params['filename'] as string);
    const filePath = join(resolve(options.downloadDir), filename);
    try {
      await stat(filePath);
    } catch {
      throw new HttpError(404, `No such downloaded file: ${filename}`);
    }
    res.sendFile(filePath);
  }));

  router.delete('/papers/files/:filename', wrap(async (req: Request, res: Response) => {
    const filename = basename(req.params['filename'] as string);
    const filePath = join(resolve(options.downloadDir), filename);
    try {
      await unlink(filePath);
    } catch {
      throw new HttpError(404, `No such downloaded file: ${filename}`);
    }
    res.status(204).end();
  }));

  return router;
}

interface DownloadResponseItem {
  status: 'ok' | 'failed';
  sourceType: string;
  sourceKeyword: string;
  out?: string;
  filename?: string;
  title?: string;
  pdfUrl?: string;
  scihubUrl?: string;
  fileUrl?: string;
  error?: string;
}

async function runDownloads(
  body: Record<string, unknown>,
  downloadDir: string,
  options: { single?: boolean } = {},
): Promise<DownloadResponseItem[]> {
  const doi = asList(body['doi']);
  const pmid = asList(body['pmid']);
  const title = asList(body['title']);

  // `keyword` + `type` is an alternative shape for a single paper.
  if (typeof body['keyword'] === 'string' && body['keyword'].length > 0) {
    const type = typeof body['type'] === 'string' ? body['type'].toLowerCase() : 'doi';
    if (!isSourceType(type)) {
      throw new HttpError(400, `type must be one of doi, pmid, title, got '${type}' instead.`);
    }
    if (type === 'doi') doi.push(body['keyword']);
    else if (type === 'pmid') pmid.push(body['keyword']);
    else title.push(body['keyword']);
  }

  if (doi.length + pmid.length + title.length === 0) {
    throw new HttpError(400, 'Provide at least one of: doi, pmid, title, or keyword with type.');
  }
  if (options.single === true && doi.length + pmid.length + title.length > 1) {
    throw new HttpError(400, 'This endpoint streams a single paper; provide exactly one identifier.');
  }

  const out = resolveDownloadPath(downloadDir, body['out']);
  const scihubUrl = typeof body['scihubUrl'] === 'string' && body['scihubUrl'].length > 0 ? body['scihubUrl'] : null;
  const proxies = mergeProxies(configuredProxies(), readProxies(body));

  const planned = planTasks({ doi, pmid, title, out, scihubUrl, proxies, progress: false });

  const results: DownloadResponseItem[] = [];
  for (const taskOptions of planned) {
    const task = new ScihubTask(taskOptions);
    try {
      const result = await task.run();
      if (result === null) {
        results.push({
          status: 'failed',
          sourceType: taskOptions.sourceType,
          sourceKeyword: String(taskOptions.sourceKeyword),
          error: 'Failed to download the paper from every known SciHub mirror.',
        });
        continue;
      }
      results.push({
        status: 'ok',
        sourceType: result.sourceType,
        sourceKeyword: result.sourceKeyword,
        out: resolve(result.out),
        filename: result.filename,
        title: result.title,
        pdfUrl: result.pdfUrl,
        scihubUrl: result.scihubUrl,
        fileUrl: `/api/papers/files/${encodeURIComponent(result.filename)}`,
      });
    } catch (error) {
      logger.error(
        `final status: ${task.context.status}, error: ${errorMessage(task.context.error ?? error)}`,
      );
      results.push({
        status: 'failed',
        sourceType: taskOptions.sourceType,
        sourceKeyword: String(taskOptions.sourceKeyword),
        error: errorMessage(task.context.error ?? error),
      });
    }
  }
  return results;
}

export { HttpError };
