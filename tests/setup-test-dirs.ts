import fs from 'fs';
import path from 'path';

// Run before test imports so singleton stores cannot load another file's state.
const tempRoot = process.env.WABOT_TEST_TEMP_ROOT;
const dataRoot = process.env.WABOT_TEST_DATA_ROOT;
if (!tempRoot || !dataRoot) {
  throw new Error('Test directory roots must be initialized by globalSetup.');
}

process.env.TEMP_DIR = fs.mkdtempSync(path.join(tempRoot, 'suite-'));
process.env.DATA_DIR = fs.mkdtempSync(path.join(dataRoot, 'suite-'));
