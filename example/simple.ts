/**
 * Library usage, mirroring the Python project's example/simple.py.
 * Run with: npx tsx example/simple.ts
 */
import { scihubDownload } from '../src/index.js';

const paperUrl = 'https://doi.org/10.1145/3375633';
const paperType = 'doi';
const out = './paper/paper.pdf';
const proxies = { http: 'socks5://127.0.0.1:7890' };

// Download with a DOI, letting the mirror be chosen automatically.
await scihubDownload({ keyword: paperUrl, paperType, out });

// Download with a PMID.
await scihubDownload({ keyword: '31395057', paperType: 'pmid', out: './paper/' });

// Download with a title.
await scihubDownload({
  keyword: 'ImageNet Classification with Deep Convolutional Neural Networks',
  paperType: 'title',
  out: './paper/',
});

// Download through a proxy.
await scihubDownload({ keyword: paperUrl, paperType, out, proxies });
