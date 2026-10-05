/**
 * Delves with no display (docs/delve.md). Node and the tests use it.
 *
 * A batch delve always goes deeper while somebody is standing, so it measures
 * how far a party gets: the number that says whether the levels are too hard,
 * too easy, or about right.
 */
import { runRound } from "../sim/round.js";
import type { SimConfig } from "../sim/state.js";
import {
  canGoDeeper,
  createRun,
  deepestCleared,
  finishLevel,
  nextLevel,
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

/** Run one delve to a wipe, or to `maxDepth`. */
export function runDelve(seed: number, maxDepth: number, config?: SimConfig): DelveResult {
  const run: DelveRun = createRun(seed, config ? { config } : {});
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
  }
  return { seed, levels: run.history, deepestCleared: deepestCleared(run), fellAt };
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
