import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--native')) {
  console.error('Usage: node tools/check.mjs [--native]');
  process.exit(2);
}
const native = args[0] === '--native';
const directory = native ? 'tests/native' : 'tests';
const tests = readdirSync(directory)
  .filter((name) => name.endsWith('.mjs'))
  .sort();
if (native) {
  const captures = new Set(
    tests.flatMap((name) =>
      [
        ...readFileSync(`${directory}/${name}`, 'utf8').matchAll(
          /readFileSync\(['"](research\/[^'"]+)['"]/g,
        ),
      ].map((match) => match[1]),
    ),
  );
  const missing = [...captures].filter((path) => !existsSync(path)).sort();
  if (missing.length) {
    console.error(
      `Native replay requires local research captures, which are excluded from Git:\n${missing.join('\n')}\nRegenerate them with the research probe scripts before running npm run test:native.`,
    );
    process.exit(1);
  }
} else run('cargo', ['test', '--manifest-path', 'engine/Cargo.toml', '--offline']);
for (const test of tests) run(process.execPath, [`${directory}/${test}`]);
if (!native) run('python3', ['-m', 'unittest', 'discover', '-s', 'tests']);
