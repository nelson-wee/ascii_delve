/**
 * The delve harness (docs/delve.md). Node only.
 *
 *   npm run delve                          # 40 delves, to depth 10
 *   npm run delve -- --runs 100 --depth 15 --seed 7
 *
 * Every delve goes deeper while somebody is standing. The table says, for each
 * depth, how many parties reached it, how the level ended, and how long it
 * took. A level that ends on the time limit is a fault: the party could not
 * find the last mobs, or could not reach them.
 */
import { runDelve, summariseByDepth, type DelveResult } from "../delve/batch.js";

interface Options {
  runs: number;
  depth: number;
  seed: number;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { runs: 40, depth: 10, seed: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = Number(argv[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (flag === "--runs") options.runs = value;
    else if (flag === "--depth") options.depth = value;
    else if (flag === "--seed") options.seed = value;
    else continue;
    i += 1;
  }
  return options;
}

function row(values: (string | number)[], widths: number[]): string {
  return values.map((value, i) => String(value).padStart(widths[i] ?? 8)).join(" ");
}

const options = parseArgs(process.argv.slice(2));
const started = Date.now();
const results: DelveResult[] = [];
for (let i = 0; i < options.runs; i += 1) {
  results.push(runDelve(options.seed * 100_000 + i, options.depth));
}
const seconds = (Date.now() - started) / 1000;

console.log(`${options.runs} delves to depth ${options.depth}, seed ${options.seed} (${seconds.toFixed(1)} s)\n`);
const widths = [6, 8, 8, 7, 7, 10, 7];
console.log(row(["depth", "reached", "cleared", "wiped", "time", "mean s", "mobs"], widths));
for (const depth of summariseByDepth(results)) {
  console.log(
    row(
      [
        depth.depth,
        depth.reached,
        depth.cleared,
        depth.wiped,
        depth.timeLimit,
        (depth.meanTicks / 20).toFixed(1),
        depth.meanMobs.toFixed(1),
      ],
      widths,
    ),
  );
}

const deepest = results.map((result) => result.deepestCleared).sort((a, b) => a - b);
const mean = deepest.reduce((sum, value) => sum + value, 0) / Math.max(1, deepest.length);
const median = deepest[Math.floor(deepest.length / 2)] ?? 0;
console.log(`\ndeepest level cleared: mean ${mean.toFixed(2)}, median ${median}, best ${deepest[deepest.length - 1] ?? 0}`);

const names = Object.keys(results[0]?.fellAt ?? {});
console.log("\nclass   fell   mean depth of the fall");
for (const name of names) {
  const falls = results.map((result) => result.fellAt[name]).filter((value): value is number => value != null);
  const meanFall = falls.reduce((sum, value) => sum + value, 0) / Math.max(1, falls.length);
  console.log(`${name.padEnd(8)}${String(falls.length).padStart(4)}   ${falls.length > 0 ? meanFall.toFixed(2) : "-"}`);
}
