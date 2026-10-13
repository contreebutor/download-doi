/** Shared task planning used by both the CLI and the HTTP API. */
import type { Proxies, SourceType } from '../core/base.js';
import type { ScihubTaskOptions } from '../core/task.js';

export interface TaskPlanInput {
  doi?: readonly (string | number)[];
  pmid?: readonly (string | number)[];
  title?: readonly (string | number)[];
  out?: string | null;
  scihubUrl?: string | null;
  proxies?: Proxies;
  progress?: boolean;
}

export interface PlannedTask extends ScihubTaskOptions {
  sourceType: SourceType;
}

/**
 * Expands the identifier lists into one task each. With more than one
 * identifier, `out` is always treated as a directory, matching SciDownl.
 */
export function planTasks(input: TaskPlanInput): PlannedTask[] {
  const doi = input.doi ?? [];
  const pmid = input.pmid ?? [];
  const title = input.title ?? [];

  let out = input.out ?? null;
  const total = doi.length + pmid.length + title.length;
  if (total > 1 && out !== null && !out.endsWith('/')) {
    out = `${out}/`;
  }

  const common = {
    scihubUrl: input.scihubUrl ?? null,
    out,
    proxies: input.proxies ?? {},
    ...(input.progress === undefined ? {} : { progress: input.progress }),
  };

  return [
    ...doi.map((keyword): PlannedTask => ({ sourceKeyword: keyword, sourceType: 'doi', ...common })),
    ...pmid.map((keyword): PlannedTask => ({ sourceKeyword: keyword, sourceType: 'pmid', ...common })),
    ...title.map((keyword): PlannedTask => ({ sourceKeyword: keyword, sourceType: 'title', ...common })),
  ];
}

/** Merges the proxies configured in global.ini with a user-supplied override. */
export function mergeProxies(configured: Proxies, override: Proxies): Proxies {
  return { ...configured, ...override };
}
