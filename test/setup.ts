import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'download-doi-test-'));
process.env['SCIDOWNL_DB_PATH'] = join(scratch, 'test-scidownl.db');
process.env['SCIDOWNL_DOWNLOAD_DIR'] = join(scratch, 'paper');
process.env['SCIDOWNL_LOG_LEVEL'] = 'ERROR';
process.env['NO_COLOR'] = '1';
