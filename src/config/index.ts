/** Global configuration, read once from an ini file and cached for the process. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIni } from './ini.js';

const here = dirname(fileURLToPath(import.meta.url));

export type ConfigSection = Record<string, string>;
export type Configs = Record<string, ConfigSection>;

/**
 * Location of the global config file. `SCIDOWNL_CONFIG` wins so that a
 * deployment can mount its own file without rebuilding the package.
 */
export const configFilePath: string =
  process.env.SCIDOWNL_CONFIG !== undefined && process.env.SCIDOWNL_CONFIG.length > 0
    ? resolve(process.env.SCIDOWNL_CONFIG)
    : resolve(here, 'global.ini');

let cached: Configs | null = null;

function loadConfig(): Configs {
  if (!existsSync(configFilePath)) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }
  return parseIni(readFileSync(configFilePath, 'utf-8'));
}

export function getConfig(): Configs {
  if (cached === null) {
    cached = loadConfig();
  }
  return cached;
}

/** Drops the cache so the next `getConfig()` re-reads the file. Used by tests. */
export function resetConfig(): void {
  cached = null;
}

export function getSection(section: string): ConfigSection {
  const configs = getConfig();
  return configs[section] ?? {};
}

export function getValue(section: string, key: string): string | undefined {
  return getSection(section)[key.toLowerCase()];
}

export function getString(section: string, key: string, fallback: string): string {
  const value = getValue(section, key);
  return value === undefined || value.length === 0 ? fallback : value;
}

export function getInt(section: string, key: string, fallback: number): number {
  const value = getValue(section, key);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function sectionNames(): string[] {
  return Object.keys(getConfig());
}
