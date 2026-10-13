/** Errors raised by the core pipeline, mirroring SciDownl's exception module. */

export class ScidownlError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Raised if an empty DOI is given. */
export class EmptyDoiError extends ScidownlError {}

/** Raised if an empty PMID is given. */
export class EmptyPmidError extends ScidownlError {}

/** Raised if an empty title is given. */
export class EmptyTitleError extends ScidownlError {}

/** Raised if an error occurs while crawling. */
export class CrawlError extends ScidownlError {}

/** Raised if no pdf tag is found in the crawled page. */
export class PdfTagNotFoundError extends ScidownlError {}

/** Raised if the pdf tag carries no url. */
export class PdfUrlNotFoundError extends ScidownlError {}

/** Raised if an error occurs while extracting. */
export class ExtractError extends ScidownlError {}

/** Raised if an error occurs while downloading. */
export class DownloadError extends ScidownlError {}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
