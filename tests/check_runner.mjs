import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const runner = path.resolve('tools/check.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knights-native-check-'));
try {
  fs.mkdirSync(path.join(root, 'tests/native'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'tests/native/probe.mjs'),
    "import fs from 'node:fs'; console.log(JSON.parse(fs.readFileSync('research/probe.json')).value);",
  );
  const run = (argument) =>
    spawnSync(process.execPath, [runner, argument], { cwd: root, encoding: 'utf8' });
  const missing = run('--native');
  assert.equal(missing.status, 1, 'Missing native data fails explicitly');
  assert.match(missing.stderr, /local research captures/);
  assert.match(missing.stderr, /research\/probe\.json/);
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research/probe.json'), '{"value":42}');
  const ready = run('--native');
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(ready.stdout.trim(), '42', 'Native mode runs only the selected replay suite');
  const invalid = run('--unknown');
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Usage:/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(
  'Test runner: explicit missing captures, native selection and argument validation pass.',
);
