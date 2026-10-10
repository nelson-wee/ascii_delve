/**
 * The roster: the marines, their loadouts, and the stash (docs/delve.md,
 * Section 10).
 *
 * The roster lasts between delves. A delve takes the marines as their loadouts
 * make them, at full health. A return to base puts the loot of the delve into
 * the stash. The player then moves items between the stash and the slots.
 */
import { loadDelve, loadTuning } from "../core/data.js";
import { createRng, deriveSeed } from "../core/rng.js";
import type { Delve } from "../core/schemas.js";
import type { Role, SimConfig } from "../sim/state.js";
import { generateWeaponSet } from "../weapons/generate.js";
import type { Weapon } from "../weapons/types.js";
import { itemScore, slotKind, SLOTS, weaponItem, type Item, type Slot } from "./items.js";
import { levelConfig } from "./level.js";
import type { LevelRecord } from "./run.js";

/** One marine of the squad, between delves. */
export interface Marine {
  /**
   * The id of the marine's template in `marines` of `data/delve.json`. The key
   * keeps its old name until the save version 2 of M3.
   */
  classId: string;
  /** The callsign of the marine. It is also the bot id in a level. */
  name: string;
  /** The role weights that the marine fights with until the AI implants of M2. */
  role: Role;
  /** The health of the marine, before gear. */
  healthMax: number;
  /** The speed factor of the marine, before gear. */
  moveSpeedScale: number;
  loadout: Partial<Record<Slot, Item>>;
}

/** What one delve left behind, for the base screen. */
export interface DelveSummary {
  delveNumber: number;
  levels: LevelRecord[];
  deepestCleared: number;
  wiped: boolean;
  /** The names of the items that went into the stash. */
  banked: string[];
  /** The names of the items that a wipe lost. */
  lost: string[];
}

export interface Roster {
  seed: number;
  /** The marines. The key keeps its old name until the save version 2 of M3. */
  heroes: Marine[];
  stash: Item[];
  /** The number that the next item uid takes. */
  nextUid: number;
  /** The delves that have ended. */
  delves: number;
  /** The deepest level that any delve cleared. */
  bestDepth: number;
  lastDelve: DelveSummary | null;
}

/** The stats of a marine with its gear on. */
export interface MarineStats {
  healthMax: number;
  moveSpeedScale: number;
  accuracy: number;
}

/** A new uid for an item of the roster. */
export function newUid(roster: Roster): string {
  const uid = `item-${roster.nextUid}`;
  roster.nextUid += 1;
  return uid;
}

/** The stats of a marine: its template, plus the bonuses of its armour and module. */
export function marineStats(marine: Marine): MarineStats {
  const stats: MarineStats = {
    healthMax: marine.healthMax,
    moveSpeedScale: marine.moveSpeedScale,
    accuracy: loadTuning().botDefaults.accuracy,
  };
  for (const item of Object.values(marine.loadout)) {
    if (!item || item.kind === "weapon") continue;
    stats.healthMax += item.bonus.healthMax ?? 0;
    stats.moveSpeedScale += item.bonus.moveSpeedScale ?? 0;
    stats.accuracy += item.bonus.accuracy ?? 0;
  }
  // A stack of penalties must not stop a marine, and accuracy is a chance.
  stats.healthMax = Math.max(1, stats.healthMax);
  stats.moveSpeedScale = Math.max(0.3, stats.moveSpeedScale);
  stats.accuracy = Math.min(1, Math.max(0.05, stats.accuracy));
  return stats;
}

/** The weapons of a marine's loadout, in slot order. */
export function loadoutWeapons(marine: Marine): Weapon[] {
  const out: Weapon[] = [];
  for (const slot of ["weapon1", "weapon2"] as const) {
    const item = marine.loadout[slot];
    if (item?.kind === "weapon") out.push(item.weapon);
  }
  return out;
}

/** True when the item is in a slot of any marine. */
export function isEquipped(roster: Roster, uid: string): boolean {
  return roster.heroes.some((marine) => Object.values(marine.loadout).some((item) => item?.uid === uid));
}

/**
 * The weapon that each class starts with: the weapon of the set that its role
 * ranks highest, and a different one for each class while the set has enough.
 */
function starterWeapons(roles: readonly Role[], items: readonly Item[], config: SimConfig): Item[] {
  const claimed = new Set<string>();
  return roles.map((role) => {
    let best: Item | null = null;
    let bestValue = -Infinity;
    for (const item of items) {
      if (claimed.has(item.uid) && claimed.size < items.length) continue;
      const value = itemScore(item, role, config);
      if (value > bestValue) {
        best = item;
        bestValue = value;
      }
    }
    const chosen = best as Item;
    claimed.add(chosen.uid);
    return chosen;
  });
}

/** A new roster: the classes of `data/delve.json`, each with a starter weapon. */
export function createRoster(seed: number, options: { config?: SimConfig; delve?: Delve } = {}): Roster {
  const delve = options.delve ?? loadDelve();
  const config = options.config ?? levelConfig(undefined, delve);
  const roster: Roster = { seed, heroes: [], stash: [], nextUid: 1, delves: 0, bestDepth: 0, lastDelve: null };

  const set = generateWeaponSet(createRng(deriveSeed(seed, "starters"), "weapons"), delve.weaponsPerRun, {
    ticksPerSecond: config.ticksPerSecond,
  });
  // The first weapon of a set is the baseline, which every bot holds anyway.
  const pool = set.slice(1).map((weapon) => weaponItem(weapon, newUid(roster), 0));
  const classes = delve.squad.map((classId) => {
    const data = delve.marines[classId];
    if (!data) throw new Error(`data/delve.json has no marine "${classId}"`);
    return { classId, data };
  });
  const starters = starterWeapons(classes.map((entry) => entry.data.role), pool, config);
  roster.heroes = classes.map(({ classId, data }, index) => ({
    classId,
    name: data.name,
    role: data.role,
    healthMax: data.healthMax,
    moveSpeedScale: data.moveSpeedScale,
    loadout: { weapon1: starters[index] as Item },
  }));
  return roster;
}

/**
 * Put a stash item in a slot of a marine, or empty the slot when `uid` is null.
 * The item that was in the slot goes back to the stash. Returns false, and
 * changes nothing, when the item is not in the stash or does not fit the slot.
 */
export function equip(roster: Roster, marineIndex: number, slot: Slot, uid: string | null): boolean {
  const marine = roster.heroes[marineIndex];
  if (!marine) return false;
  let incoming: Item | null = null;
  if (uid !== null) {
    const index = roster.stash.findIndex((item) => item.uid === uid);
    if (index < 0) return false;
    incoming = roster.stash[index] as Item;
    if (incoming.kind !== slotKind(slot)) return false;
    roster.stash.splice(index, 1);
  }
  const outgoing = marine.loadout[slot];
  if (outgoing) roster.stash.push(outgoing);
  if (incoming) marine.loadout[slot] = incoming;
  else delete marine.loadout[slot];
  return true;
}

/**
 * Give every marine the best items for its role.
 *
 * All slots go back to the stash first. The marines then take turns, one slot
 * kind at a time, so each marine gets one good armour before any marine gets a
 * second good weapon. A tie goes to the item that was found first.
 */
export function autoEquip(roster: Roster, config: SimConfig = levelConfig()): void {
  for (const [index, marine] of roster.heroes.entries()) {
    for (const slot of SLOTS) if (marine.loadout[slot]) equip(roster, index, slot, null);
  }
  for (const slot of SLOTS) {
    for (const [index, marine] of roster.heroes.entries()) {
      let best: Item | null = null;
      let bestValue = 0;
      for (const item of roster.stash) {
        if (item.kind !== slotKind(slot)) continue;
        const value = itemScore(item, marine.role, config);
        if (value > bestValue) {
          best = item;
          bestValue = value;
        }
      }
      if (best) equip(roster, index, slot, best.uid);
    }
  }
}

/** Throw a stash item away. Returns false when the item is not in the stash. */
export function discard(roster: Roster, uid: string): boolean {
  const index = roster.stash.findIndex((item) => item.uid === uid);
  if (index < 0) return false;
  roster.stash.splice(index, 1);
  return true;
}

/** The stash in a stable order: weapons, then armour, then trinkets, best first. */
export function sortedStash(roster: Roster, config: SimConfig = levelConfig()): Item[] {
  const order: Record<Item["kind"], number> = { weapon: 0, armor: 1, trinket: 2 };
  // A stash weapon is ranked for the marine that would most want it.
  const score = (item: Item): number =>
    Math.max(...roster.heroes.map((marine) => itemScore(item, marine.role, config)));
  return [...roster.stash].sort((a, b) => order[a.kind] - order[b.kind] || score(b) - score(a));
}
