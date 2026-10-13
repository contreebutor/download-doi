# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`download-doi` is a TypeScript/Node.js port of the Python [SciDownl](https://github.com/Tishacy/SciDownl):
download papers from SciHub by DOI, PMID or title. It ships a CLI (commander), an Express HTTP
API, and a typed library. See `README.md` for user-facing docs.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest, fully offline
npm run build       # tsc + copy src/config/global.ini into dist/
npm run cli -- download --doi 10.1145/3375633
npm run dev         # tsx watch on the API server
```

Requires Node.js >= 22.5 (uses the built-in `node:sqlite`; no native deps).

## Layout

- `src/core/` — the download pipeline, mirroring SciDownl's modules:
  `source` (DOI/PMID/title) → `crawler` (fetch SciHub page) → `extractor` (cheerio, finds pdf
  url) → `downloader` (streams the pdf). `task.ts` orchestrates them; `chooser.ts` picks a
  mirror; `updater.ts` refreshes the mirror list (`crawl` / `search` modes).
- `src/db/` — `scihub_url` table in SQLite via `node:sqlite`; schema matches the Python original.
- `src/config/` — INI parser + `global.ini`. Everything SciHub might change is a config value.
- `src/api/` — `cli.ts`, `server.ts`, `app.ts` / `routes.ts` (Express), `scihub.ts`
  (`scihubDownload` library entry), `tasks.ts`.
- `src/util/` — table printing, bounded async pool, `bootstrap.ts` (silences the sqlite
  ExperimentalWarning; imported first by the CLI and server).
- `src/index.ts` — public exports.
- `test/` — vitest suites; `fake-scihub.ts` runs a local stand-in mirror so tests never hit the
  network. `setup.ts` points the DB and download dir at a temp directory.

## Conventions

- ESM with `NodeNext` resolution: relative imports must use the `.js` extension.
- `strict` + `noUncheckedIndexedAccess` are on; keep `npm run typecheck` clean.
- Tests share one SQLite connection, so `fileParallelism` is disabled in `vitest.config.ts`.
- HTTP `out` paths are confined to the download directory (no absolute paths or `..`).
- Env overrides: `SCIDOWNL_CONFIG`, `SCIDOWNL_DB_PATH`, `SCIDOWNL_DOWNLOAD_DIR`,
  `SCIDOWNL_LOG_LEVEL`, `HOST`, `PORT`, `NO_COLOR`.
- `dist/`, `data/`, `paper/` and `*.db` are gitignored build/runtime output.
