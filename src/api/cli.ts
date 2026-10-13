#!/usr/bin/env node
/** Command line tool of download-doi. */
import '../util/bootstrap.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Command, Option } from 'commander';
import { getLogger } from '../logger.js';
import { configFilePath, getConfig, getSection, getValue, sectionNames } from '../config/index.js';
import { scihubDomainUpdaters, UPDATE_MODES } from '../core/updater.js';
import { ScihubUrlService } from '../db/service.js';
import { ScihubTask } from '../core/task.js';
import { parseProxyOption } from '../http.js';
import { mergeProxies, planTasks } from './tasks.js';
import { configuredProxies } from './routes.js';
import { errorMessage } from '../errors.js';
import { getString } from '../config/index.js';
import { renderTable } from '../util/table.js';
import { createApp, resolveDownloadDir } from './app.js';

const logger = getLogger();

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('download-doi')
    .description('Command line tool to download pdfs from SciHub.')
    .helpOption('-h, --help', 'Show this message and exit.');

  program
    .command('config')
    .description('Get global configs.')
    .option('-l, --location', 'Show the location of the global config file.')
    .argument('[section]', 'Section name. Omit to print every config.')
    .argument('[key]', 'Key name inside the section. Omit to print the whole section.')
    .helpOption('-h, --help', 'Show this message and exit.')
    .action((section: string | undefined, key: string | undefined, options: { location?: boolean }) => {
      if (options.location === true) {
        logger.info(`Global config file path: ${configFilePath}`);
        return;
      }
      if (section === undefined) {
        process.stdout.write(`${JSON.stringify(getConfig(), null, 2)}\n`);
        return;
      }
      if (!sectionNames().includes(section)) {
        logger.warning(`Section '${section}' is not found. Valid sections: ${sectionNames().join(', ')}`);
        return;
      }
      if (key === undefined) {
        process.stdout.write(`${JSON.stringify(getSection(section), null, 2)}\n`);
        return;
      }
      const value = getValue(section, key);
      if (value === undefined) {
        logger.warning(`Key '${key}' is not found. Valid keys: ${Object.keys(getSection(section)).join(', ')}`);
        return;
      }
      logger.info(`Value: ${value}`);
    });

  program
    .command('domain.update')
    .description('Update available SciHub domains and save them to local db.')
    .addOption(
      new Option('-m, --mode <mode>', "update mode, could be 'crawl' or 'search'.")
        .choices(UPDATE_MODES)
        .default('crawl'),
    )
    .helpOption('-h, --help', 'Show this message and exit.')
    .action(async (options: { mode: string }) => {
      const factory = scihubDomainUpdaters[options.mode];
      if (factory === undefined) {
        logger.error(`Update mode (-m) must be one of ${UPDATE_MODES.join(', ')}, got '${options.mode}' instead.`);
        process.exitCode = 2;
        return;
      }
      await factory().updateDomains();
    });

  program
    .command('domain.list')
    .description('List available SciHub domains in local db.')
    .helpOption('-h, --help', 'Show this message and exit.')
    .action(() => {
      const urls = new ScihubUrlService().getAllUrls();
      urls.sort((a, b) => b.success_times - a.success_times);
      process.stdout.write(
        `${renderTable(
          ['Url', 'SuccessTimes', 'FailedTimes'],
          urls.map((url) => [url.url, String(url.success_times), String(url.failed_times)]),
        )}\n`,
      );
    });

  program
    .command('download')
    .description('Download paper(s) by DOI, PMID or title.')
    .option('-d, --doi <doi>', 'DOI string. Repeat the option to download several papers.', collect, [])
    .option('-p, --pmid <pmid>', 'PMID number. Repeat the option to download several papers.', collect, [])
    .option('-t, --title <title>', 'Title string. Repeat the option to download several papers.', collect, [])
    .option(
      '-o, --out <path>',
      'Output directory or file path, absolute or relative. ' +
        'Directory examples: /absolute/path/to/download/, ./relative/path/to/download/. ' +
        'File examples: /absolute/dir/paper.pdf, ../relative/dir/paper.pdf. ' +
        "If omitted, the paper is written to the current directory under the paper's title. " +
        'With several identifiers, --out is always treated as a directory.',
    )
    .option(
      '-u, --scihub-url <url>',
      'SciHub domain url. If not specified, one is chosen automatically from the local db. ' +
        "It's recommended to leave this option empty.",
    )
    .option('-x, --proxy <proxy>', 'Proxy as SCHEME=PROXY_ADDRESS, e.g. --proxy http=http://127.0.0.1:7890.')
    .helpOption('-h, --help', 'Show this message and exit.')
    .action(
      async (options: {
        doi: string[];
        pmid: string[];
        title: string[];
        out?: string;
        scihubUrl?: string;
        proxy?: string;
      }) => {
        logger.info('Run scihub tasks. Tasks information: ');
        if (options.doi.length > 0) logger.info(`${'DOI(s)'.padStart(15)}: ${JSON.stringify(options.doi)}`);
        if (options.pmid.length > 0) logger.info(`${'PMID(s)'.padStart(15)}: ${JSON.stringify(options.pmid)}`);
        if (options.title.length > 0) logger.info(`${'TITLE(s)'.padStart(15)}: ${JSON.stringify(options.title)}`);

        logger.info(`${'Output'.padStart(15)}: ${options.out ?? resolve('./')}`);
        logger.info(
          `${'SciHub Url'.padStart(15)}: ${
            options.scihubUrl ??
            `<auto.${getString('scihub.task', 'scihub_url_chooser_type', 'availability_first')}>`
          }`,
        );

        const proxies = mergeProxies(configuredProxies(), parseProxyOption(options.proxy));
        if (Object.keys(proxies).length > 0) {
          logger.info(`${'Proxies'.padStart(15)}: ${JSON.stringify(proxies)}`);
        }

        const planned = planTasks({
          doi: options.doi,
          pmid: options.pmid,
          title: options.title,
          out: options.out ?? null,
          scihubUrl: options.scihubUrl ?? null,
          proxies,
        });

        if (planned.length === 0) {
          logger.error('Provide at least one of --doi, --pmid or --title.');
          process.exitCode = 2;
          return;
        }

        let failures = 0;
        for (const taskOptions of planned) {
          const task = new ScihubTask(taskOptions);
          try {
            const result = await task.run();
            if (result === null) failures += 1;
          } catch (error) {
            failures += 1;
            logger.error(
              `final status: ${task.context.status}, error: ${errorMessage(task.context.error ?? error)}`,
            );
          }
        }
        if (failures > 0) process.exitCode = 1;
      },
    );

  program
    .command('serve')
    .description('Start the Express HTTP API.')
    .option('--host <host>', 'Host to bind.')
    .option('--port <port>', 'Port to listen on.')
    .option('--download-dir <dir>', 'Directory every download is written into.')
    .helpOption('-h, --help', 'Show this message and exit.')
    .action((options: { host?: string; port?: string; downloadDir?: string }) => {
      const host = options.host ?? process.env.HOST ?? getString('server', 'host', '0.0.0.0');
      const port =
        options.port === undefined
          ? Number.parseInt(process.env.PORT ?? getString('server', 'port', '3000'), 10)
          : Number.parseInt(options.port, 10);
      const downloadDir = resolveDownloadDir(options.downloadDir);

      const server = createApp({ downloadDir }).listen(port, host, () => {
        const address = server.address();
        const boundPort = address !== null && typeof address === 'object' ? address.port : port;
        logger.info(`download-doi API listening on http://${host}:${boundPort}`);
        logger.info(`Downloads are written to: ${downloadDir}`);
      });
    });

  return program;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  buildCli()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      logger.error(errorMessage(error));
      process.exitCode = 1;
    });
}
