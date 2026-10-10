/**
 * A delve: a party that goes down one level at a time (docs/delve.md).
 *
 * The run holds the party between levels. After a level the player chooses:
 * go deeper, with the health, the armour, the weapons and the ammo that the
 * party has now, or go back to base, which ends the delve (`returnToBase`). A
 * marine that falls stays down until the squad is back at base.
 */
import { loadDelve } from "../core/data.js";
import type { EventBus } from "../core/events.js";
import { createRng, deriveSeed } from "../core/rng.js";
import type { Delve } from "../core/schemas.js";
import {
  carryOf,
  type BotCarry,
  type BotSpec,
  type Role,
  type SimConfig,
  type SimState,
} from "../sim/state.js";
import { generateWeaponSet } from "../weapons/generate.js";
import type { Weapon } from "../weapons/types.js";
import { POWERUP_TIER } from "../weapons/types.js";
import { rewardCount, rollItem, weaponItem, type Item } from "./items.js";
import { buildLevel, createLevelState, levelConfig, partySpawns, type LevelSetup } from "./level.js";
import {
  marineStats,
  isEquipped,
  loadoutWeapons,
  newUid,
  type DelveSummary,
  type Roster,
} from "./roster.js";

/** One member of the party, between two levels. */
export interface PartyMember {
  /** The class id of `data/delve.json`. */
  classId: string;
  /** The name of the class. It is also the bot id. */
  name: string;
  role: Role;
  /** The stats of the marine with its gear on (`marineStats`). */
  healthMax: number;
  moveSpeedScale: number;
  accuracy: number;
  carry: BotCarry;
}

/** How one level ended. */
export interface LevelRecord {
  depth: number;
  arenaName: string;
  reason: "cleared" | "wiped" | "timeLimit";
  ticks: number;
  mobs: number;
  mobsKilled: number;
  /** The party members alive at the end. */
  partyAlive: number;
  /** The names of the items that the clear put in the pack. */
  loot: string[];
}

export interface DelveRun {
  seed: number;
  /** The number of this delve in the roster, from 1. */
  delveNumber: number;
  /** The depth of the next level. It starts at 1. */
  depth: number;
  /** The weapons of the weapon points of the levels, with the baseline first. */
  weapons: readonly Weapon[];
  party: PartyMember[];
  /** The loot of the clears. The party keeps it only if it gets back to base. */
  pack: Item[];
  history: LevelRecord[];
  config: SimConfig;
}

/**
 * A new delve: the marines of the roster, at full health, with their loadouts,
 * and a weapon set for the weapon points of its levels.
 */
export function createRun(roster: Roster, options: { config?: SimConfig; delve?: Delve } = {}): DelveRun {
  const delve = options.delve ?? loadDelve();
  const config = options.config ?? levelConfig(undefined, delve);
  const delveNumber = roster.delves + 1;
  const seed = deriveSeed(roster.seed, `delve:${delveNumber}`);
  const set = generateWeaponSet(createRng(deriveSeed(seed, "weapons"), "weapons"), delve.weaponsPerRun, {
    ticksPerSecond: config.ticksPerSecond,
  });
  // A generated id names a role, an attack type and a place in its set, so two
  // sets repeat ids. The delve number keeps them apart from the roster's items.
  const weapons = set.map((weapon, index) => (index === 0 ? weapon : { ...weapon, id: `d${delveNumber}-${weapon.id}` }));
  const baseline = weapons[0] as Weapon;

  const party = roster.heroes.map((marine): PartyMember => {
    const stats = marineStats(marine);
    const held = loadoutWeapons(marine);
    return {
      classId: marine.classId,
      name: marine.name,
      role: marine.role,
      healthMax: stats.healthMax,
      moveSpeedScale: stats.moveSpeedScale,
      accuracy: stats.accuracy,
      carry: {
        alive: true,
        health: stats.healthMax,
        armor: 0,
        weapons: [baseline, ...held],
        weaponId: held[0]?.id ?? baseline.id,
        ammo: new Map(),
      },
    };
  });
  return { seed, delveNumber, depth: 1, weapons, party, pack: [], history: [], config };
}

/** The party members that are still on their feet. */
export function partyAlive(run: DelveRun): number {
  return run.party.filter((member) => member.carry.alive).length;
}

/** Build the next level of the run. It does not move the run on. */
export function nextLevel(run: DelveRun): LevelSetup {
  return buildLevel(run.seed, run.depth, run.weapons, run.config);
}

/** The roster of the party for a level. */
export function partySpecs(run: DelveRun, setup: LevelSetup, delve: Delve = loadDelve()): BotSpec[] {
  const spawns = partySpawns(setup.arena);
  return run.party.map((member, slot) => ({
    id: member.name,
    label: member.name,
    spawn: spawns[slot % spawns.length] as { x: number; y: number },
    role: member.role,
    behavior: delve.squadBehavior,
    attributes: { accuracy: member.accuracy },
    healthMax: member.healthMax,
    moveSpeedScale: member.moveSpeedScale,
    carry: member.carry,
  }));
}

/** The state of the next level, with the party as the last level left it. */
export function startLevel(run: DelveRun, setup: LevelSetup, bus?: EventBus): SimState {
  return createLevelState(setup, {
    party: partySpecs(run, setup),
    weapons: run.weapons,
    config: run.config,
    ...(bus ? { bus } : {}),
  });
}

/**
 * Write down how a level ended, and carry the party out of it.
 *
 * The depth moves on only after a clear: a level that ran out of time is not
 * cleared, and the party that goes on meets the next depth all the same.
 */
export function finishLevel(run: DelveRun, setup: LevelSetup, state: SimState): LevelRecord {
  const outcome = state.outcome;
  if (outcome === null) throw new Error("finishLevel needs a level that has ended");
  for (const member of run.party) {
    const bot = state.bots.find((candidate) => candidate.teamId === "A" && candidate.id === member.name);
    if (bot) member.carry = carryOf(bot);
  }
  const mobs = state.bots.filter((bot) => bot.teamId === "B");
  const record: LevelRecord = {
    depth: setup.depth,
    arenaName: setup.arena.name,
    reason: outcome.reason === "cleared" || outcome.reason === "wiped" ? outcome.reason : "timeLimit",
    ticks: outcome.ticks,
    mobs: mobs.length,
    mobsKilled: mobs.filter((bot) => !bot.alive).length,
    partyAlive: partyAlive(run),
    loot: [],
  };
  if (record.reason === "cleared") {
    // The loot of a clear is a function of the delve seed and the depth, so a
    // replay of the delve finds the same items.
    const rng = createRng(deriveSeed(run.seed, `loot:${setup.depth}`), "loot");
    for (let i = 0; i < rewardCount(setup.depth); i += 1) {
      const item = rollItem(rng, setup.depth, `d${run.delveNumber}-loot-${run.pack.length}`, run.config);
      run.pack.push(item);
      record.loot.push(item.name);
    }
  }
  run.history.push(record);
  run.depth += 1;
  return record;
}

/** True when the party can go on: somebody is still standing. */
export function canGoDeeper(run: DelveRun): boolean {
  return partyAlive(run) > 0;
}

/** The deepest level that the run cleared, or 0. */
export function deepestCleared(run: DelveRun): number {
  let deepest = 0;
  for (const record of run.history) {
    if (record.reason === "cleared") deepest = Math.max(deepest, record.depth);
  }
  return deepest;
}

/**
 * The weapons that the party picked up from the weapon points, one of each.
 * A loadout weapon, the baseline, a power-up and a mob weapon are not loot.
 */
function pickedUpWeapons(roster: Roster, run: DelveRun): Weapon[] {
  const baseline = run.weapons[0]?.id;
  const seen = new Set<string>();
  const out: Weapon[] = [];
  for (const member of run.party) {
    for (const weapon of member.carry.weapons) {
      if (weapon.id === baseline || weapon.tier === POWERUP_TIER || seen.has(weapon.id)) continue;
      if (isEquipped(roster, weapon.id)) continue;
      seen.add(weapon.id);
      out.push(weapon);
    }
  }
  return out;
}

/**
 * The squad comes back to base, and the delve ends.
 *
 * The base heals every marine to full, raises the fallen, and refills the ammo: a
 * delve always starts from the loadouts at full strength. A party that got
 * back puts the pack and the weapons it picked up into the stash. A wipe loses
 * them. Equipped items are never lost.
 */
export function returnToBase(roster: Roster, run: DelveRun): DelveSummary {
  const wiped = !canGoDeeper(run);
  const deepest = run.history.reduce((most, level) => Math.max(most, level.depth), 0);
  const found: Item[] = [
    ...run.pack,
    ...pickedUpWeapons(roster, run).map((weapon) => weaponItem(weapon, weapon.id, deepest)),
  ];
  const summary: DelveSummary = {
    delveNumber: run.delveNumber,
    levels: [...run.history],
    deepestCleared: deepestCleared(run),
    wiped,
    banked: [],
    lost: [],
  };
  for (const item of found) {
    if (wiped) {
      summary.lost.push(item.name);
      continue;
    }
    const uid = newUid(roster);
    roster.stash.push(item.kind === "weapon" ? weaponItem(item.weapon, uid, item.depth) : { ...item, uid });
    summary.banked.push(item.name);
  }
  roster.delves = run.delveNumber;
  roster.bestDepth = Math.max(roster.bestDepth, summary.deepestCleared);
  roster.lastDelve = summary;
  return summary;
}
