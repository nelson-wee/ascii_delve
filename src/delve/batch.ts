/**
 * Delves with no display (docs/delve.md). Node and the tests use it.
 *
 * Two questions, two functions:
 *
 * - `runDelve`: how far does a fresh party get if it always goes deeper? It
 *   measures the level curve.
 * - `runCampaign`: does the base loop work? A roster delves again and again,
 *   comes back when it is hurt, banks its loot, and equips the best of it. If
 *   the loop works, the depth it reaches goes up with the delves.
 */
import { runRound } from "../sim/round.js";
import type { SimConfig } from "../sim/state.js";
import { autoEquip, createRoster, type Roster } from "./roster.js";
import {
  canGoDeeper,
  createRun,
  deepestCleared,
  finishLevel,
  nextLevel,
  returnToBase,
  startLevel,
  type DelveRun,
  type LevelRecord,
} from "./run.js";

export interface DelveResult {
  seed: number;
  levels: LevelRecord[];
  deepestCleared: number;
  /** The depth at which each class fell, or `null` if it never fell. */
  fellAt: Record<string, number | null>;
}

/**
 * When a squad goes back to base. `deeper` never goes back. `cautious` goes
 * back after a level that left a marine down, or a marine under half health.
 */
export type ReturnPolicy = "deeper" | "cautious";

/** True when the policy sends the squad back to base after this level. */
export function wantsBase(run: DelveRun, policy: ReturnPolicy): boolean {
  if (policy === "deeper") return false;
  return run.party.some((member) => !member.carry.alive || member.carry.health < member.healthMax * 0.5);
}

/** Play one delve of a roster, to a wipe, to the policy, or to `maxDepth`. */
export function playDelve(
  roster: Roster,
  maxDepth: number,
  policy: ReturnPolicy,
  config?: SimConfig,
): { run: DelveRun; fellAt: Record<string, number | null> } {
  const run = createRun(roster, config ? { config } : {});
  const fellAt: Record<string, number | null> = {};
  for (const member of run.party) fellAt[member.name] = null;

  while (run.depth <= maxDepth && canGoDeeper(run)) {
    const setup = nextLevel(run);
    const state = startLevel(run, setup);
    runRound(state);
    finishLevel(run, setup, state);
    for (const member of run.party) {
      if (!member.carry.alive && fellAt[member.name] === null) fellAt[member.name] = setup.depth;
    }
    if (wantsBase(run, policy)) break;
  }
  return { run, fellAt };
}

/** One delve of a fresh roster that always goes deeper. */
export function runDelve(seed: number, maxDepth: number, config?: SimConfig): DelveResult {
  const { run, fellAt } = playDelve(createRoster(seed), maxDepth, "deeper", config);
  return { seed, levels: run.history, deepestCleared: deepestCleared(run), fellAt };
}

export interface CampaignDelve {
  delveNumber: number;
  deepestCleared: number;
  wiped: boolean;
  banked: number;
  /** The mean health of the party with its gear on, before this delve. */
  partyHealth: number;
}

/**
 * Many delves of one roster. After each one the squad goes back to base and
 * equips the best of what it has (`autoEquip`), as a player who reads the
 * numbers would.
 */
export function runCampaign(
  seed: number,
  delves: number,
  maxDepth: number,
  policy: ReturnPolicy,
): { delves: CampaignDelve[]; roster: Roster } {
  const roster = createRoster(seed);
  const out: CampaignDelve[] = [];
  for (let i = 0; i < delves; i += 1) {
    autoEquip(roster);
    const { run } = playDelve(roster, maxDepth, policy);
    const partyHealth = run.party.reduce((sum, member) => sum + member.healthMax, 0) / run.party.length;
    const summary = returnToBase(roster, run);
    out.push({
      delveNumber: summary.delveNumber,
      deepestCleared: summary.deepestCleared,
      wiped: summary.wiped,
      banked: summary.banked.length,
      partyHealth,
    });
  }
  return { delves: out, roster };
}

/**
 * How deep a roster gets at full health when it always goes deeper. It reads
 * the roster and never changes it: nothing is banked, so it measures the
 * strength of the loadouts and not the choice of when to go back.
 */
export function probeDepth(roster: Roster, maxDepth: number): number {
  return deepestCleared(playDelve(roster, maxDepth, "deeper").run);
}

export interface DepthSummary {
  depth: number;
  reached: number;
  cleared: number;
  wiped: number;
  timeLimit: number;
  meanTicks: number;
  meanMobs: number;
}

/** The levels of many delves, by depth. */
export function summariseByDepth(results: readonly DelveResult[]): DepthSummary[] {
  const byDepth = new Map<number, LevelRecord[]>();
  for (const result of results) {
    for (const level of result.levels) {
      const list = byDepth.get(level.depth) ?? [];
      list.push(level);
      byDepth.set(level.depth, list);
    }
  }
  return [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, levels]) => ({
      depth,
      reached: levels.length,
      cleared: levels.filter((level) => level.reason === "cleared").length,
      wiped: levels.filter((level) => level.reason === "wiped").length,
      timeLimit: levels.filter((level) => level.reason === "timeLimit").length,
      meanTicks: levels.reduce((sum, level) => sum + level.ticks, 0) / levels.length,
      meanMobs: levels.reduce((sum, level) => sum + level.mobs, 0) / levels.length,
    }));
}
