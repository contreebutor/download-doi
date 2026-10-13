/** Downloader implementation: stream a pdf url to disk. */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import axios from 'axios';
import type { Readable } from 'node:stream';
import type { BaseTask, Downloader } from './base.js';
import type { UrlInformation } from './information.js';
import { defaultHeaders, proxyRequestConfig } from '../http.js';
import { getLogger } from '../logger.js';
import { DownloadError, errorMessage } from '../errors.js';
import { ScihubUrlService } from '../db/service.js';

const logger = getLogger();

const PROGRESS_BAR_WIDTH = 50;

export interface UrlDownloaderOptions {
  /** Draw a progress bar on stdout. Defaults to on for an interactive terminal. */
  progress?: boolean;
}

export class UrlDownloader implements Downloader {
  private readonly service: ScihubUrlService;
  private readonly progress: boolean;

  constructor(
    private readonly information: UrlInformation,
    private readonly task?: BaseTask,
    options: UrlDownloaderOptions = {},
  ) {
    this.service = new ScihubUrlService();
    this.progress = options.progress ?? process.stdout.isTTY === true;
    if (this.task !== undefined) {
      this.task.context.status = 'downloading';
    }
  }

  /** Downloads the url to `out` and returns the written file name. */
  async download(out: string): Promise<string> {
    try {
      const url = this.information.getUrl();
      const proxies = this.task?.context.proxies ?? {};

      const response = await axios.get<Readable>(url, {
        ...proxyRequestConfig(proxies),
        responseType: 'stream',
        headers: defaultHeaders(),
        maxRedirects: 5,
        timeout: 120_000,
      });

      const header = response.headers['content-length'];
      const totalLength = header === undefined ? null : Number.parseInt(String(header), 10);

      await mkdir(dirname(out), { recursive: true });

      const source = response.data;
      const sink = createWriteStream(out);

      if (totalLength === null || Number.isNaN(totalLength) || !this.progress) {
        await pipeline(source, sink);
      } else {
        await pipeline(source, this.progressReporter(totalLength), sink);
        process.stdout.write('\n');
      }

      const filename = basename(out);
      logger.info(`Successfully downloaded the url to: ${out}`);

      if (this.task !== undefined) {
        this.task.context.out = out;
        this.task.context.filename = filename;
        this.task.context.status = 'downloaded';
      }
      return filename;
    } catch (error) {
      if (this.task !== undefined) {
        this.task.context.status = 'downloading_failed';
        this.task.context.error = error instanceof Error ? error : new Error(String(error));
        this.service.incrementFailedTimes(this.task.context.referer);
      }
      throw new DownloadError(`Error occurs when downloading: ${errorMessage(error)}`, { cause: error });
    }
  }

  private progressReporter(totalLength: number): Transform {
    let downloaded = 0;
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloaded += chunk.length;
        const doneWidth = Math.floor((PROGRESS_BAR_WIDTH * downloaded) / totalLength);
        const percent = Math.floor((100 * downloaded) / totalLength);
        const bar = '='.repeat(doneWidth) + ' '.repeat(Math.max(0, PROGRESS_BAR_WIDTH - doneWidth));
        process.stdout.write(
          `\r${String(percent).padStart(3)}% [${bar}] ${downloaded}/${totalLength}`,
        );
        callback(null, chunk);
      },
    });
  }
}
