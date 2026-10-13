// Copies non-TypeScript assets (the global.ini config) into dist/ after tsc.
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'src/config/global.ini');
const to = resolve(root, 'dist/config/global.ini');

await mkdir(dirname(to), { recursive: true });
await cp(from, to);
console.log(`copied ${from} -> ${to}`);
