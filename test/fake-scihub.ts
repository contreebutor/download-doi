import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_PDF = Buffer.from('%PDF-1.4\nfake paper body\n%%EOF\n');

export interface FakeScihub {
  url: string;
  requests: string[];
  close: () => Promise<void>;
}

/** A local stand-in for a SciHub mirror, so tests never touch the network. */
export async function startFakeScihub(options: { pdfTag?: string; title?: string } = {}): Promise<FakeScihub> {
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(`${req.method} ${path}`);

    if (path.endsWith('.pdf')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': String(FAKE_PDF.length) });
      res.end(FAKE_PDF);
      return;
    }

    const title = options.title ?? 'Sci-Hub | A Great Paper | 10.1145/3375633';
    const pdfTag = options.pdfTag ?? '<embed id="pdf" src="/downloads/paper.pdf#navpanes=0">';
    const html = `<html><head><title>${title}</title></head><body>${pdfTag}</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined || error === null ? resolve() : reject(error)));
      }),
  };
}
