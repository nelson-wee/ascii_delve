/**
 * A delve: a party that goes down one level at a time (docs/delve.md).
 *
 * The run holds the party between levels. After a level the player chooses:
 * go deeper, with the health, the armour, the weapons and the ammo that the
 * party has now, or go back to town, which ends the run. A party member that
 * falls stays down for the rest of the run.
 */
import { loadDelve, loadRoles } from "../core/data.js";
import type { EventBus } from "../core/events.js";
import { createRng, deriveSeed } from "../core/rng.js";
import type { Delve } from "../core/schemas.js";
import {
  carryOf,
  weaponWeight,
  type BotCarry,
  type BotSpec,
  type Role,
  type SimConfig,
  type SimState,
} from "../sim/state.js";
import { generateWeaponSet } from "../weapons/generate.js";
import type { Weapon } from "../weapons/types.js";
import { buildLevel, createLevelState, levelConfig, partySpawns, type LevelSetup } from "./level.js";

/** One member of the party, between two levels. */
export interface PartyMember {
  /** The class id of `data/delve.json`. It is also the bot id. */
  classId: string;
  name: string;
  role: Role;
  healthMax: number;
  moveSpeedScale: number;
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
}

export interface DelveRun {
  seed: number;
  /** The depth of the next level. It starts at 1. */
  depth: number;
  weapons: readonly Weapon[];
  party: PartyMember[];
  history: LevelRecord[];
  config: SimConfig;
}

/**
 * The weapon that a class starts with: the generated weapon of the run that its
 * role ranks highest, and a different one for each class while the run has
 * enough.
 */
function starterWeapons(classes: readonly Role[], weapons: readonly Weapon[], config: SimConfig): Weapon[] {
  const roles = loadRoles();
  const pool = weapons.slice(1);
  const claimed = new Set<string>();
  const out: Weapon[] = [];
  for (const role of classes) {
    const tactics = roles.roles[role]?.tactics;
    let best: Weapon | null = null;
    let bestValue = -Infinity;
    for (const weapon of pool) {
      if (claimed.has(weapon.id) && claimed.size < pool.length) continue;
      const mean = (weapon.dpsProfile.close + weapon.dpsProfile.mid + weapon.dpsProfile.long) / 3;
      const value = tactics ? mean * weaponWeight(tactics, weapon.archetype, config.weaponPrefBonus) : mean;
      if (value > bestValue) {
        best = weapon;
        bestValue = value;
      }
    }
    const chosen = best ?? (weapons[0] as Weapon);
    claimed.add(chosen.id);
    out.push(chosen);
  }
  return out;
}

/** A new run: a weapon set and a fresh party at full health. */
export function createRun(seed: number, options: { config?: SimConfig; delve?: Delve } = {}): DelveRun {
  const delve = options.delve ?? loadDelve();
  const config = options.config ?? levelConfig(undefined, delve);
  const weapons = generateWeaponSet(createRng(deriveSeed(seed, "weapons"), "weapons"), delve.weaponsPerRun, {
    ticksPerSecond: config.ticksPerSecond,
  });
  const classes = delve.party.map((classId) => {
    const data = delve.classes[classId];
    if (!data) throw new Error(`data/delve.json has no class "${classId}"`);
    return { classId, data };
  });
  const starters = starterWeapons(classes.map((entry) => entry.data.role), weapons, config);
  const party = classes.map(({ classId, data }, index): PartyMember => {
    const starter = starters[index] as Weapon;
    const held = starter.id === weapons[0]?.id ? [starter] : [weapons[0] as Weapon, starter];
    return {
      classId,
      name: data.name,
      role: data.role,
      healthMax: data.healthMax,
      moveSpeedScale: data.moveSpeedScale,
      carry: {
        alive: true,
        health: data.healthMax,
        armor: 0,
        weapons: held,
        weaponId: starter.id,
        ammo: new Map(),
      },
    };
  });
  return { seed, depth: 1, weapons, party, history: [], config };
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
    behavior: delve.partyBehavior,
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
  };
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
