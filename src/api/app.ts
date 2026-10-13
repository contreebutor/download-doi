/** Express application factory. */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRouter, HttpError } from './routes.js';
import { getString } from '../config/index.js';
import { getLogger } from '../logger.js';
import { errorMessage } from '../errors.js';

const logger = getLogger();

export interface AppOptions {
  /** Directory every download is written into. Defaults to `[server] download_dir`. */
  downloadDir?: string;
  /** Log one line per request. Defaults to true. */
  requestLogging?: boolean;
}

export function resolveDownloadDir(downloadDir?: string): string {
  const configured = downloadDir ?? process.env.SCIDOWNL_DOWNLOAD_DIR ?? getString('server', 'download_dir', './paper');
  return resolve(configured);
}

export function createApp(options: AppOptions = {}): Express {
  const downloadDir = resolveDownloadDir(options.downloadDir);
  mkdirSync(downloadDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (options.requestLogging !== false) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', downloadDir });
  });

  app.use('/api', createRouter({ downloadDir }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = errorMessage(error);
    if (status >= 500) {
      logger.error(message);
    } else {
      logger.warning(message);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
