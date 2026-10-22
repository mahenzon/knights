// CPU microbenchmark only. Run from the project root after compiling simulation.wasm.
const fs = require('node:fs');
(async () => {
  const { runBenchmark } = await import('./simulation.mjs');
  const result = await runBenchmark(fs.readFileSync('benchmarks/simulation.wasm'));
  const report = { runtime: process.version, platform: process.platform, arch: process.arch, ...result };
  fs.writeFileSync('research/benchmark-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
