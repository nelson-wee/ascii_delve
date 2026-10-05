/**
 * One level of a delve (docs/delve.md).
 *
 * A level is an arena of the generators of Section 7.2. The party starts on
 * the spawn group of team A, and the mobs stand in packs on the ground that is
 * furthest from it. The level ends when one side has nobody left.
 */
import { distanceField } from "../arena/contested.js";
import { generateArena, type ArenaStyle, type GeneratedArena } from "../arena/generate.js";
import { Tile, cellIndex, inBounds, tileAt, type ArenaMap } from "../arena/types.js";
import { loadArenaProfiles, loadDelve } from "../core/data.js";
import { EventBus } from "../core/events.js";
import { createRng, deriveSeed, type Rng } from "../core/rng.js";
import type { Delve } from "../core/schemas.js";
import type { Cell } from "../core/types.js";
import { rollSpawnTable, type SpawnTable } from "../sim/pickups.js";
import {
  createSimState,
  simConfigFromTuning,
  type BotSpec,
  type SimConfig,
  type SimState,
} from "../sim/state.js";
import type { Weapon } from "../weapons/types.js";
import { mobSpec } from "./mobs.js";

/** The party starts on the first spawn group of the arena. */
const PARTY_SIZE = 3;

/** Everything that a level needs before it starts. */
export interface LevelSetup {
  depth: number;
  seed: number;
  style: ArenaStyle;
  arena: GeneratedArena;
  spawnTable: SpawnTable;
  /** The mobs of the level, one spec each. */
  mobs: BotSpec[];
}

/** The simulation numbers of a delve level. Nobody respawns, and the clear ends it. */
export function levelConfig(base: SimConfig = simConfigFromTuning(), delve: Delve = loadDelve()): SimConfig {
  return { ...base, respawn: false, endRule: "clear", timeLimitTicks: delve.timeLimitTicks };
}

/** The spawn cells of the party. */
export function partySpawns(map: ArenaMap): Cell[] {
  return map.spawns.slice(0, PARTY_SIZE);
}

/** How many packs a level at this depth holds. */
export function packCount(depth: number, delve: Delve = loadDelve()): number {
  const { levels } = delve;
  return Math.min(levels.packsMax, Math.floor(levels.packsBase + levels.packsPerDepth * (depth - 1)));
}

/** One kind of mob, drawn by the weights of `kindWeights`. */
function drawKind(rng: Rng, weights: Readonly<Record<string, number>>): string {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll < 0) return kind;
  }
  return entries[entries.length - 1]?.[0] ?? "grunt";
}

/** True for a cell that a mob may stand on at the start: plain floor. */
function isMobGround(map: ArenaMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && tileAt(map, x, y) === Tile.Floor;
}

/**
 * The cells of the packs of a level.
 *
 * A pack centre is a floor cell at least `minDistanceShare` of the longest walk
 * from the party, and at least `packSpacingSteps` from every other centre. The
 * members of a pack take the free floor cells nearest to its centre. Fewer
 * packs come back when the ground has no room for more.
 */
export function placePacks(
  map: ArenaMap,
  sizes: readonly number[],
  rng: Rng,
  delve: Delve = loadDelve(),
): Cell[][] {
  const fromParty = distanceField(map, partySpawns(map));
  let longest = 0;
  for (const distance of fromParty) longest = Math.max(longest, distance);
  const nearest = Math.floor(longest * delve.levels.minDistanceShare);

  const candidates: Cell[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const distance = fromParty[cellIndex(map, x, y)] ?? -1;
      if (distance >= nearest && isMobGround(map, x, y)) candidates.push({ x, y });
    }
  }

  const taken = new Set<number>();
  const centres: Cell[] = [];
  const packs: Cell[][] = [];
  const spacing = delve.levels.packSpacingSteps;
  for (const centre of rng.shuffle(candidates)) {
    if (packs.length >= sizes.length) break;
    if (centres.some((other) => Math.abs(other.x - centre.x) + Math.abs(other.y - centre.y) < spacing)) {
      continue;
    }
    const size = sizes[packs.length] ?? 1;
    const members = candidates
      .filter((cell) => !taken.has(cellIndex(map, cell.x, cell.y)))
      .map((cell) => ({ cell, far: (cell.x - centre.x) ** 2 + (cell.y - centre.y) ** 2 }))
      .filter((entry) => entry.far <= 9)
      .sort((a, b) => a.far - b.far || a.cell.y - b.cell.y || a.cell.x - b.cell.x)
      .slice(0, size)
      .map((entry) => entry.cell);
    if (members.length < size) continue;
    for (const cell of members) taken.add(cellIndex(map, cell.x, cell.y));
    centres.push(centre);
    packs.push(members);
  }
  return packs;
}

/** The style of the level at a depth: the styles of `data/delve.json`, in turn. */
export function styleAt(depth: number, delve: Delve = loadDelve()): ArenaStyle {
  return delve.styles[(depth - 1) % delve.styles.length] as ArenaStyle;
}

/**
 * Build a level: the arena, the items on its pickup points, and the mobs.
 *
 * Each part takes a sub-seed of the level seed, so one run seed replays every
 * level (Section 7.1).
 */
export function buildLevel(
  runSeed: number,
  depth: number,
  weapons: readonly Weapon[],
  config: SimConfig = levelConfig(),
  delve: Delve = loadDelve(),
): LevelSetup {
  const seed = deriveSeed(runSeed, `level:${depth}`);
  const style = styleAt(depth, delve);
  const profiles = loadArenaProfiles();
  const profile = profiles.profiles[style];
  if (!profile) throw new Error(`data/arena-profiles.json has no profile "${style}"`);

  const arenaSeed = deriveSeed(seed, "arena");
  const arena = generateArena(profile, createRng(arenaSeed, "arena"), arenaSeed, {
    rules: profiles.rules,
  });
  arena.name = `Depth ${depth} · ${arena.name}`;
  const spawnTable = rollSpawnTable(arena, weapons, createRng(deriveSeed(seed, "spawnTable"), "weapons"));

  const rng = createRng(deriveSeed(seed, "mobs"), "mobs");
  const sizes: number[] = [];
  for (let i = 0; i < packCount(depth, delve); i += 1) {
    sizes.push(rng.int(delve.levels.packSizeMin, delve.levels.packSizeMax));
  }
  const packs = placePacks(arena, sizes, rng, delve);
  const counts = new Map<string, number>();
  const mobs: BotSpec[] = [];
  for (const pack of packs) {
    for (const cell of pack) {
      const kindId = drawKind(rng, delve.levels.kindWeights);
      const kind = delve.mobs[kindId];
      const number = (counts.get(kindId) ?? 0) + 1;
      counts.set(kindId, number);
      mobs.push(mobSpec(kindId, `${kind?.name ?? kindId}${number}`, cell, depth, config, delve));
    }
  }
  return { depth, seed, style, arena, spawnTable, mobs };
}

/** What `createLevelState` needs besides the level. */
export interface LevelStateOptions {
  party: readonly BotSpec[];
  weapons: readonly Weapon[];
  config?: SimConfig;
  bus?: EventBus;
}

/** The state of a level, ready for `step` or `runRound`. */
export function createLevelState(setup: LevelSetup, options: LevelStateOptions): SimState {
  return createSimState({
    map: setup.arena,
    seed: setup.seed,
    config: options.config ?? levelConfig(),
    bus: options.bus ?? new EventBus(),
    weapons: options.weapons,
    spawnTable: setup.spawnTable,
    roster: { A: options.party, B: setup.mobs },
    explore: ["A"],
  });
}
