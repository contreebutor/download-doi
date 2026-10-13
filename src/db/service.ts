/** Read/write access to the saved SciHub domains. */
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { getDatabase, type ScihubUrl } from './entities.js';
import { getLogger } from '../logger.js';
import { errorMessage } from '../errors.js';

const logger = getLogger();

export class ScihubUrlService {
  private readonly db: SqliteDatabase;

  constructor(test = false) {
    this.db = getDatabase(test);
  }

  /** Inserts urls, ignoring the ones already stored. */
  addUrls(urls: ReadonlyArray<Pick<ScihubUrl, 'url'>>): void {
    if (urls.length === 0) return;
    const statement = this.db.prepare(
      'INSERT OR IGNORE INTO scihub_url (url, success_times, failed_times) VALUES (?, 0, 0)',
    );
    for (const { url } of urls) {
      try {
        statement.run(url);
      } catch (error) {
        logger.warning(`Cannot save url: ${url}, reason: ${errorMessage(error)}`);
      }
    }
  }

  incrementSuccessTimes(url: string | null | undefined): void {
    this.increment('success_times', url);
  }

  incrementFailedTimes(url: string | null | undefined): void {
    this.increment('failed_times', url);
  }

  private increment(column: 'success_times' | 'failed_times', url: string | null | undefined): void {
    if (typeof url !== 'string' || url.length === 0) return;
    try {
      this.db.prepare(`UPDATE scihub_url SET ${column} = ${column} + 1 WHERE url = ?`).run(url);
    } catch (error) {
      logger.warning(`Cannot increment ${column}: ${url}, reason: ${errorMessage(error)}`);
    }
  }

  getAllUrls(): ScihubUrl[] {
    const rows = this.db.prepare('SELECT url, success_times, failed_times FROM scihub_url').all();
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        url: String(record['url']),
        success_times: Number(record['success_times'] ?? 0),
        failed_times: Number(record['failed_times'] ?? 0),
      };
    });
  }

  /** Removes every saved url. Used by tests. */
  clear(): void {
    this.db.exec('DELETE FROM scihub_url');
  }
}
