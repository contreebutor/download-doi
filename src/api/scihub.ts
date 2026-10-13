/** High level API for humans. */
import { ScihubTask, type ScihubTaskResult } from '../core/task.js';
import type { Proxies, SourceType } from '../core/base.js';

export interface ScihubDownloadOptions {
  /** A DOI, a PMID or a paper title. */
  keyword: string | number;
  /** One of 'doi', 'pmid', 'title'. Defaults to 'doi'. */
  paperType?: SourceType | string;
  /**
   * A specific SciHub url to download from. When omitted, one is chosen
   * automatically from the locally saved domains, which is recommended.
   */
  scihubUrl?: string | null;
  /**
   * Output directory or file path, absolute or relative.
   * Directory examples: `/absolute/path/to/download/`, `./relative/path/`.
   * File examples: `/absolute/dir/paper.pdf`, `../relative/dir/paper.pdf`.
   * When omitted, the paper lands in the current directory under its title.
   */
  out?: string | null;
  proxies?: Proxies;
  progress?: boolean;
}

/**
 * Downloads one paper from SciHub.
 * Resolves with the download result, or `null` if every mirror failed.
 */
export async function scihubDownload(options: ScihubDownloadOptions): Promise<ScihubTaskResult | null> {
  const task = new ScihubTask({
    sourceKeyword: options.keyword,
    sourceType: options.paperType ?? 'doi',
    scihubUrl: options.scihubUrl ?? null,
    out: options.out ?? null,
    proxies: options.proxies ?? {},
    ...(options.progress === undefined ? {} : { progress: options.progress }),
  });
  return await task.run();
}
