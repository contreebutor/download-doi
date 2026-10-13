/** Shared HTTP client concerns: the browser User-Agent and proxy agents. */
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { AxiosRequestConfig } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Proxies } from './core/base.js';

/** SciHub mirrors answer 403 to a default library User-Agent. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isSocks(proxyUrl: string): boolean {
  return /^socks[45]?h?:\/\//i.test(proxyUrl);
}

function agentFor(proxyUrl: string, secure: boolean): HttpAgent | HttpsAgent {
  if (isSocks(proxyUrl)) return new SocksProxyAgent(proxyUrl);
  return secure ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
}

/**
 * Translates SciDownl's `{scheme: proxy_address}` map into axios agents.
 * `proxy: false` stops axios from also applying its own env-var proxy handling.
 */
export function proxyRequestConfig(proxies: Proxies = {}): AxiosRequestConfig {
  const config: AxiosRequestConfig = {};
  const httpProxy = proxies.http;
  const httpsProxy = proxies.https;

  if (httpProxy !== undefined && httpProxy.length > 0) {
    config.httpAgent = agentFor(httpProxy, false);
  }
  if (httpsProxy !== undefined && httpsProxy.length > 0) {
    config.httpsAgent = agentFor(httpsProxy, true);
  }
  if (config.httpAgent !== undefined || config.httpsAgent !== undefined) {
    config.proxy = false;
  }
  return config;
}

/**
 * Percent-encodes a path segment the way Python's `urllib.parse.quote` does:
 * `/` stays literal, which matters because a DOI contains one and the mirrors
 * serve the article at `{scihub_url}/10.1145/3375633`.
 */
export function quotePath(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '/');
}

export function defaultHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'User-Agent': BROWSER_USER_AGENT, ...extra };
}

/** Parses a CLI-style `SCHEME=PROXY_ADDRESS` pair, e.g. `http=socks5://127.0.0.1:7890`. */
export function parseProxyOption(option: string | undefined): Proxies {
  if (option === undefined || !option.includes('=')) return {};
  const [scheme, ...rest] = option.split('=');
  const address = rest.join('=');
  const key = (scheme ?? '').trim().toLowerCase();
  if ((key !== 'http' && key !== 'https') || address.length === 0) return {};
  return { [key]: address };
}
