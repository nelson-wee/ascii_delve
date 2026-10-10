/**
 * The delve harness (docs/delve.md). Node only.
 *
 *   npm run delve                          # 40 delves, to depth 10
 *   npm run delve -- --runs 100 --depth 15 --seed 7
 *   npm run delve -- --campaign 12         # 12 delves per roster, with base visits
 *
 * Every delve goes deeper while somebody is standing. The table says, for each
 * depth, how many parties reached it, how the level ended, and how long it
 * took. A level that ends on the time limit is a fault: the party could not
 * find the last mobs, or could not reach them.
 *
 * With `--campaign N`, each of the `--runs` rosters plays N delves. A party
 * goes back to base when a marine is down or under half health, banks its loot,
 * and equips the best of it. The table then gives, for each delve, the mean
 * deepest level cleared: if the base loop works, it goes up.
 */
import {
  probeDepth,
  runCampaign,
  runDelve,
  summariseByDepth,
  type CampaignDelve,
  type DelveResult,
} from "../delve/batch.js";
import { createRoster } from "../delve/roster.js";

interface Options {
  runs: number;
  depth: number;
  seed: number;
  campaign: number;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { runs: 40, depth: 10, seed: 1, campaign: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = Number(argv[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (flag === "--runs") options.runs = value;
    else if (flag === "--depth") options.depth = value;
    else if (flag === "--seed") options.seed = value;
    else if (flag === "--campaign") options.campaign = value;
    else continue;
    i += 1;
  }
  return options;
}

function row(values: (string | number)[], widths: number[]): string {
  return values.map((value, i) => String(value).padStart(widths[i] ?? 8)).join(" ");
}

/** Print the campaign table, and stop. */
function campaignReport(options: Options): void {
  const started = Date.now();
  const campaigns: CampaignDelve[][] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (let i = 0; i < options.runs; i += 1) {
    const seed = options.seed * 100_000 + i;
    before.push(probeDepth(createRoster(seed), options.depth));
    const campaign = runCampaign(seed, options.campaign, options.depth, "cautious");
    campaigns.push(campaign.delves);
    after.push(probeDepth(campaign.roster, options.depth));
  }
  const seconds = (Date.now() - started) / 1000;
  console.log(
    `${options.runs} rosters × ${options.campaign} delves, cautious, to depth ${options.depth}, seed ${options.seed} (${seconds.toFixed(1)} s)\n`,
  );
  const widths = [6, 10, 8, 8, 10];
  console.log(row(["delve", "deepest", "wiped", "banked", "health"], widths));
  for (let d = 0; d < options.campaign; d += 1) {
    const at = campaigns.map((campaign) => campaign[d]).filter((entry): entry is CampaignDelve => entry !== undefined);
    const mean = (pick: (entry: CampaignDelve) => number): number =>
      at.reduce((sum, entry) => sum + pick(entry), 0) / Math.max(1, at.length);
    console.log(
      row(
        [
          d + 1,
          mean((entry) => entry.deepestCleared).toFixed(2),
          at.filter((entry) => entry.wiped).length,
          mean((entry) => entry.banked).toFixed(1),
          mean((entry) => entry.partyHealth).toFixed(0),
        ],
        widths,
      ),
    );
  }
  const average = (values: readonly number[]): string =>
    (values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
  console.log(
    `\nprobe (full health, always deeper, nothing banked): a fresh roster clears ${average(before)} levels, the same roster after ${options.campaign} delves clears ${average(after)}`,
  );
}

const options = parseArgs(process.argv.slice(2));
if (options.campaign > 0) {
  campaignReport(options);
  process.exit(0);
}
const started = Date.now();
const results: DelveResult[] = [];
for (let i = 0; i < options.runs; i += 1) {
  results.push(runDelve(options.seed * 100_000 + i, options.depth));
}
const seconds = (Date.now() - started) / 1000;

console.log(`${options.runs} delves to depth ${options.depth}, seed ${options.seed} (${seconds.toFixed(1)} s)\n`);
const widths = [6, 8, 8, 7, 7, 10, 9];
console.log(row(["depth", "reached", "cleared", "wiped", "time", "mean s", "hostiles"], widths));
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
console.log("\nmarine  fell   mean depth of the fall");
for (const name of names) {
  const falls = results.map((result) => result.fellAt[name]).filter((value): value is number => value != null);
  const meanFall = falls.reduce((sum, value) => sum + value, 0) / Math.max(1, falls.length);
  console.log(`${name.padEnd(8)}${String(falls.length).padStart(4)}   ${falls.length > 0 ? meanFall.toFixed(2) : "-"}`);
}
