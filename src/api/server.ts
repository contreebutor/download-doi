#!/usr/bin/env node
/** HTTP server entrypoint. */
import '../util/bootstrap.js';
import { createApp, resolveDownloadDir } from './app.js';
import { getInt, getString } from '../config/index.js';
import { getLogger } from '../logger.js';
import { closeDatabases } from '../db/entities.js';
import { pathToFileURL } from 'node:url';

const logger = getLogger();

export function startServer(): ReturnType<ReturnType<typeof createApp>['listen']> {
  const host = process.env.HOST ?? getString('server', 'host', '0.0.0.0');
  const port = process.env.PORT === undefined ? getInt('server', 'port', 3000) : Number.parseInt(process.env.PORT, 10);
  const downloadDir = resolveDownloadDir();

  const app = createApp({ downloadDir });
  const server = app.listen(port, host, () => {
    // Read the address back so `PORT=0` reports the port that was actually bound.
    const address = server.address();
    const boundPort = address !== null && typeof address === 'object' ? address.port : port;
    logger.info(`download-doi API listening on http://${host}:${boundPort}`);
    logger.info(`Downloads are written to: ${downloadDir}`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down.`);
    server.close(() => {
      closeDatabases();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  startServer();
}
