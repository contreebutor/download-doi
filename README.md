# download-doi

A TypeScript / Node.js / Express rebuild of [SciDownl](https://github.com/Tishacy/SciDownl) — an unofficial API for
downloading papers from SciHub.

- Download by **DOI**, **PMID** or **TITLE**.
- Keep the list of SciHub domains up to date, stored in a local SQLite database.
- Ready for changes: everything SciHub might change is a config value.
- Proxy support (HTTP and SOCKS).
- Three ways in: a **CLI**, an **Express HTTP API**, and a **typed library**.

## Requirements

Node.js **>= 22.5** (the local database uses the built-in `node:sqlite` module). No native
build step, no compiler toolchain.

## Install

```bash
git clone https://github.com/contreebutor/download-doi.git
cd download-doi
npm install
npm run build
```

`npm link` (or `npm install -g .`) puts the `download-doi` binary on your `PATH`. Without it,
run the CLI as `node dist/api/cli.js ...`, or straight from the sources with `npm run cli -- ...`.

## Quick usage

```bash
# Download with a DOI; the filename is the paper's title.
$ download-doi download --doi https://doi.org/10.1145/3375633

# Download with a PMID and a user-defined filepath.
$ download-doi download --pmid 31395057 --out ./paper/paper-1.pdf

# Download with a title.
$ download-doi download --title "ImageNet Classification with Deep Convolutional Neural Networks" --out ./paper/

# Download through a proxy: SCHEME=PROXY_ADDRESS
$ download-doi download --pmid 31395057 --out ./paper/paper-1.pdf --proxy http=socks5://127.0.0.1:7890

# Serve the HTTP API instead.
$ download-doi serve --port 3000
```

## Command line tool

```
$ download-doi --help
Usage: download-doi [options] [command]

Command line tool to download pdfs from SciHub.

Options:
  -h, --help                        Show this message and exit.

Commands:
  config [options] [section] [key]  Get global configs.
  domain.update [options]           Update available SciHub domains and save them to local db.
  domain.list                       List available SciHub domains in local db.
  download [options]                Download paper(s) by DOI, PMID or title.
  serve [options]                   Start the Express HTTP API.
```

### 1. Update available SciHub domains

```bash
$ download-doi domain.update --mode crawl
[INFO] | 2026/09/18 04:39:51 | Found 6 valid SciHub domains in total: ["http://sci-hub.se", ...]
[INFO] | 2026/09/18 04:39:51 | Saved 6 SciHub domains to local db.
```

Two modes, selected with `-m` / `--mode`:

- `crawl` (default): crawls the live SciHub-domain tracker configured under
  `[scihub.domain.updater.crawl]` as `scihub_domain_source`.
- `search`: generates every `sci-hub.xx` combination and probes them concurrently. Slower,
  but finds mirrors the tracker misses.

### 2. List saved SciHub domains

```bash
$ download-doi domain.list
+--------------------+--------------+-------------+
| Url                | SuccessTimes | FailedTimes |
|--------------------+--------------+-------------|
| http://sci-hub.se  |            0 |           0 |
| https://sci-hub.st |            0 |           0 |
+--------------------+--------------+-------------+
```

Success and failure counts drive the default `availability_first` chooser, which tries the
least-failing mirror first.

### 3. Download papers

```bash
$ download-doi download --doi 10.1145/3375633 --out ./paper/
```

`--doi`, `--pmid` and `--title` may each be repeated to queue several papers. With more than
one identifier, `--out` is always treated as a directory.

### 4. Read the config

```bash
$ download-doi config --location
$ download-doi config scihub.task.extractor pdf_tag_selector
$ download-doi config scihub.task
```

## HTTP API

```bash
$ download-doi serve --port 3000 --download-dir ./paper
# or: npm start   (PORT / HOST / SCIDOWNL_DOWNLOAD_DIR env vars)
```

| Method   | Path                          | Description                                              |
| -------- | ----------------------------- | -------------------------------------------------------- |
| `GET`    | `/health`                     | Liveness plus the active download directory.              |
| `GET`    | `/api/config`                 | The whole parsed config.                                  |
| `GET`    | `/api/config/:section`        | One config section.                                       |
| `GET`    | `/api/config/:section/:key`   | One config value.                                         |
| `GET`    | `/api/domains`                | Saved SciHub domains, most successful first.              |
| `POST`   | `/api/domains/update`         | Refresh the domain list. Body: `{"mode":"crawl"\|"search"}`. |
| `POST`   | `/api/papers/download`        | Download one or more papers to the server.                |
| `POST`   | `/api/papers/stream`          | Download one paper and stream the pdf back.               |
| `GET`    | `/api/papers/files/:filename` | Fetch a previously downloaded pdf.                        |
| `DELETE` | `/api/papers/files/:filename` | Delete a previously downloaded pdf.                       |

### Download a paper

```bash
$ curl -X POST http://localhost:3000/api/papers/download \
    -H 'Content-Type: application/json' \
    -d '{"doi": "10.1145/3375633", "out": "acm/"}'
```

```json
{
  "count": 1,
  "results": [
    {
      "status": "ok",
      "sourceType": "doi",
      "sourceKeyword": "10.1145/3375633",
      "out": "/srv/paper/acm/10.1145 3375633_Sci-Hub 2025.pdf",
      "filename": "10.1145 3375633_Sci-Hub 2025.pdf",
      "title": "10.1145 3375633_Sci-Hub 2025",
      "pdfUrl": "https://sci.bban.top/pdf/10.1145/3375633.pdf",
      "scihubUrl": "http://sci-hub.al",
      "fileUrl": "/api/papers/files/10.1145%203375633_Sci-Hub%202025.pdf"
    }
  ]
}
```

Request body fields, all optional except the identifier:

| Field                 | Type                       | Notes                                                       |
| --------------------- | -------------------------- | ----------------------------------------------------------- |
| `doi`/`pmid`/`title`  | `string \| string[]`       | At least one is required.                                    |
| `keyword` + `type`    | `string` + `doi\|pmid\|title` | Alternative single-paper shape.                            |
| `out`                 | `string`                   | Relative to the server's download directory.                 |
| `scihubUrl`           | `string`                   | Pin a mirror instead of choosing one.                        |
| `proxy` / `proxies`   | `"http=..."` / `{http,https}` | Overrides the configured proxy.                           |
| `mode`                | `crawl \| search`          | `/api/domains/update` only.                                  |

A failed paper comes back as `{"status": "failed", "error": "..."}` inside a `200` response, so
a batch is not lost because one identifier could not be resolved. Genuine request errors
(bad input, unknown mirror mode) return `4xx` with `{"error": "..."}`.

**`out` is confined to the download directory.** Absolute paths and `..` segments are rejected,
so an HTTP client cannot write outside it.

### Stream a pdf straight back

```bash
$ curl -X POST http://localhost:3000/api/papers/stream \
    -H 'Content-Type: application/json' \
    -d '{"keyword": "10.1145/3375633", "type": "doi"}' \
    -o paper.pdf
```

## Library

```ts
import { scihubDownload } from 'download-doi';

const result = await scihubDownload({
  keyword: 'https://doi.org/10.1145/3375633',
  paperType: 'doi',
  out: './paper/',
});

console.log(result?.out); // ./paper/10.1145 3375633_Sci-Hub 2025.pdf
```

`scihubDownload` resolves with `null` when every known mirror failed, rather than throwing.
Mount the Express app inside your own server with `createApp({ downloadDir })`. The individual
pipeline pieces — `ScihubTask`, `ScihubCrawler`, `HtmlPdfExtractor`, `UrlDownloader`,
`ScihubUrlService`, the choosers and the updaters — are all exported too.

## Configuration

Config lives in `src/config/global.ini` (copied to `dist/config/global.ini` by the build).
Point `SCIDOWNL_CONFIG` at another file to override it without rebuilding.

| Section                         | Key                            | Meaning                                              |
| ------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `scihub.task`                   | `scihub_url_chooser_type`      | `availability_first`, `simple` or `random`.          |
| `scihub.task.extractor`         | `pdf_tag_selector`             | CSS selector of the pdf tag on a SciHub page.        |
| `scihub.task.extractor`         | `pdf_tag_attr`                 | Attribute of that tag holding the pdf url.           |
| `scihub.domain.updater.crawl`   | `scihub_domain_source`         | Page listing live SciHub mirrors.                    |
| `scihub.domain.updater.crawl`   | `scihub_url_pattern`           | Regex matching a mirror url on that page.            |
| `scihub.domain.updater.crawl`   | `exclude_url_pattern`          | Regex of mirrors to drop.                            |
| `scihub.domain.updater.search`  | `scihub_title_keyword_pattern` | Regex a real mirror's `<title>` must match.          |
| `scihub.domain.updater.search`  | `num_workers`                  | Concurrent probes in `search` mode.                  |
| `scihub.domain.updater.search`  | `check_timeout`                | Per-probe timeout, in seconds.                       |
| `global_db`                     | `db_name`                      | SQLite filename under `data/`.                       |
| `log`                           | `console_log_level`            | `DEBUG`, `INFO`, `WARNING` or `ERROR`.               |
| `server`                        | `host`, `port`, `download_dir` | HTTP API defaults.                                   |
| `proxy`                         | `http`, `https`                | Proxies applied to every request.                    |

Environment overrides: `SCIDOWNL_CONFIG`, `SCIDOWNL_DB_PATH`, `SCIDOWNL_DOWNLOAD_DIR`,
`SCIDOWNL_LOG_LEVEL`, `HOST`, `PORT`, `NO_COLOR`.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run dev         # tsx watch, reloads the API
npm run cli -- download --doi 10.1145/3375633
```

The test suite runs entirely offline: `test/fake-scihub.ts` stands up a local stand-in mirror,
so the crawler, extractor, downloader, task, and every HTTP route are exercised against real
sockets without touching SciHub.

## How it maps onto the Python original

| SciDownl (Python)                    | download-doi (TypeScript)                       |
| ------------------------------------ | ----------------------------------------------- |
| `scidownl/core/base.py` (ABCs)       | `src/core/base.ts` (interfaces + `BaseTask`)     |
| `scidownl/core/source.py`            | `src/core/source.ts`                             |
| `scidownl/core/crawler.py` (requests)| `src/core/crawler.ts` (axios)                    |
| `scidownl/core/extractor.py` (bs4)   | `src/core/extractor.ts` (cheerio)                |
| `scidownl/core/downloader.py`        | `src/core/downloader.ts` (stream + progress bar) |
| `scidownl/core/chooser.py`           | `src/core/chooser.ts`                            |
| `scidownl/core/updater.py` (threads) | `src/core/updater.ts` (bounded async pool)       |
| `scidownl/core/task.py`              | `src/core/task.ts`                               |
| `scidownl/db/*` (SQLAlchemy)         | `src/db/*` (`node:sqlite`)                       |
| `scidownl/config.py` (configparser)  | `src/config/*` (ini parser with the same rules)  |
| `scidownl/log.py` (loguru)           | `src/logger.ts`                                  |
| `scidownl/api/cli.py` (click)        | `src/api/cli.ts` (commander)                     |
| `scidownl/api/scihub.py`             | `src/api/scihub.ts`                              |
| —                                    | `src/api/{app,server,routes}.ts` (Express)       |

Behavioural notes:

- The database schema (`scihub_url`) is identical, so an existing `scidownl.db` can be copied
  into `data/` and used as is.
- Python's `quote(doi)` leaves `/` unescaped; `quotePath()` reproduces that, which matters
  because mirrors serve articles at `{mirror}/10.1145/3375633`.
- Downloads are awaited rather than threaded, and `search`-mode probing uses a bounded async
  pool in place of a `ThreadPoolExecutor`.
- `ScihubTask.run()` resolves with the download result instead of `None`, which is what the
  HTTP layer returns to clients.

## Disclaimer

Same as the original project: this is an unofficial tool for accessing SciHub, provided for
research convenience. Respect the copyright law and the terms of service that apply to you.
