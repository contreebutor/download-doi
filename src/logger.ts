/** Console logger with SciDownl's `[LEVEL] | YYYY/MM/DD HH:mm:ss | message` format. */
import { getString } from './config/index.js';

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
};

const ESC = '';

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: `${ESC}[36m`,
  INFO: `${ESC}[32m`,
  WARNING: `${ESC}[33m`,
  ERROR: `${ESC}[31m`,
};

const RESET = `${ESC}[0m`;
const DIM = `${ESC}[2m`;

function useColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stderr.isTTY === true;
}

function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function resolveLevel(): LogLevel {
  const configured = (
    process.env.SCIDOWNL_LOG_LEVEL ?? getString('log', 'console_log_level', 'INFO')
  ).toUpperCase();
  return (LOG_LEVELS as readonly string[]).includes(configured) ? (configured as LogLevel) : 'INFO';
}

export class Logger {
  private threshold: LogLevel;

  constructor(threshold?: LogLevel) {
    this.threshold = threshold ?? resolveLevel();
  }

  setLevel(level: LogLevel): void {
    this.threshold = level;
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.threshold]) return;
    const line = useColor()
      ? `${LEVEL_COLOR[level]}[${level}]${RESET} | ${DIM}${timestamp()}${RESET} | ${LEVEL_COLOR[level]}${message}${RESET}`
      : `[${level}] | ${timestamp()} | ${message}`;
    process.stderr.write(`${line}\n`);
  }

  debug(message: string): void {
    this.write('DEBUG', message);
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warning(message: string): void {
    this.write('WARNING', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (defaultLogger === null) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}
