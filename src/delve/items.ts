/**
 * Items: what a hero equips, and what a clear gives (docs/delve.md, Section 10).
 *
 * Three kinds of item, and four slots on each hero:
 *
 * - A **weapon** goes in `weapon1` or `weapon2`. It is a generated weapon of
 *   Section 7.3. The bot still holds the baseline rifle as its fallback, and
 *   the AI still chooses the weapon to fire from the DPS profile.
 * - **Armour** goes in `armor`. A **trinket** goes in `trinket`. Each gives
 *   stat bonuses: more health, a speed factor, or accuracy.
 *
 * An item has a uid. A weapon item takes the uid as its weapon id, because the
 * ammo of a bot is kept by weapon id and two weapons must never share one.
 */
import { loadDelve, loadRoles, loadWeaponRoles } from "../core/data.js";
import type { Rng } from "../core/rng.js";
import type { Delve } from "../core/schemas.js";
import { weaponWeight, type Role, type SimConfig } from "../sim/state.js";
import { generateWeapon, type WeaponTier } from "../weapons/generate.js";
import { ROLE_TRAITS, type Weapon } from "../weapons/types.js";
import { depthScale } from "./mobs.js";

export const SLOTS = ["weapon1", "weapon2", "armor", "trinket"] as const;
export type Slot = (typeof SLOTS)[number];
export type ItemKind = "weapon" | "armor" | "trinket";

/** The stat bonuses of a piece of gear. */
export interface StatBonus {
  healthMax?: number;
  moveSpeedScale?: number;
  accuracy?: number;
}

export interface WeaponItem {
  uid: string;
  kind: "weapon";
  name: string;
  /** The depth that the item came from. */
  depth: number;
  weapon: Weapon;
}

export interface GearItem {
  uid: string;
  kind: "armor" | "trinket";
  name: string;
  depth: number;
  bonus: StatBonus;
}

export type Item = WeaponItem | GearItem;

/** The kind of item that a slot takes. */
export function slotKind(slot: Slot): ItemKind {
  return slot === "weapon1" || slot === "weapon2" ? "weapon" : slot;
}

/** The words of a slot, for a screen. */
export const SLOT_NAMES: Readonly<Record<Slot, string>> = {
  weapon1: "Weapon 1",
  weapon2: "Weapon 2",
  armor: "Armour",
  trinket: "Trinket",
};

/** Make a weapon into an item. The weapon takes the uid as its id. */
export function weaponItem(weapon: Weapon, uid: string, depth: number): WeaponItem {
  return { uid, kind: "weapon", name: weapon.name, depth, weapon: { ...weapon, id: uid } };
}

/** The mean damage per second of a weapon over the three bands. */
export function meanBandDps(weapon: Weapon): number {
  return (weapon.dpsProfile.close + weapon.dpsProfile.mid + weapon.dpsProfile.long) / 3;
}

/** One line that says what an item does. */
export function describeItem(item: Item): string {
  if (item.kind === "weapon") {
    const weapon = item.weapon;
    return `${weapon.archetype} · ${weapon.tier} · ${weapon.attackType} · ${Math.round(meanBandDps(weapon))} dps · range ${Math.round(weapon.rangeMax)}`;
  }
  const parts: string[] = [];
  const { healthMax, moveSpeedScale, accuracy } = item.bonus;
  if (healthMax) parts.push(`${healthMax > 0 ? "+" : ""}${Math.round(healthMax)} health`);
  if (moveSpeedScale) parts.push(`${moveSpeedScale > 0 ? "+" : ""}${Math.round(moveSpeedScale * 100)}% speed`);
  if (accuracy) parts.push(`${accuracy > 0 ? "+" : ""}${Math.round(accuracy * 100)}% accuracy`);
  return `${item.kind} · ${parts.join(", ") || "no bonus"}`;
}

/**
 * What an item is worth to a hero of a role. Auto-equip and the sort order of
 * the stash read it.
 *
 * A weapon is worth its mean DPS, raised by the weapon preference of the role,
 * which is the same ranking the AI uses (Section 7.26). Gear is worth its
 * bonuses in health points, by `gear.value`.
 */
export function itemScore(item: Item, role: Role, config: SimConfig, delve: Delve = loadDelve()): number {
  if (item.kind === "weapon") {
    const tactics = loadRoles().roles[role]?.tactics;
    const bias = tactics ? weaponWeight(tactics, item.weapon.archetype, config.weaponPrefBonus) : 1;
    return meanBandDps(item.weapon) * bias;
  }
  const value = delve.gear.value;
  const { healthMax = 0, moveSpeedScale = 0, accuracy = 0 } = item.bonus;
  return healthMax * value.healthMax + moveSpeedScale * value.moveSpeedScale + accuracy * value.accuracy;
}

/** Take one key of a weight table. */
function drawWeighted<T extends string>(rng: Rng, weights: Readonly<Partial<Record<T, number>>>): T | null {
  const entries = (Object.entries(weights) as [T, number][]).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1]?.[0] ?? null;
}

/** A word for the quality of a piece of gear. */
function qualityWord(quality: number): string {
  if (quality < 0.95) return "Worn ";
  if (quality < 1.2) return "";
  if (quality < 1.6) return "Fine ";
  return "Masterwork ";
}

/** A piece of armour or a trinket from a depth. */
function rollGear(rng: Rng, kind: "armor" | "trinket", depth: number, uid: string, delve: Delve): GearItem {
  const base = rng.pick(delve.gear[kind]);
  const spread = delve.rewards.qualitySpread;
  const quality = depthScale(delve.rewards.qualityPerDepth, depth) * rng.float(1 - spread, 1 + spread);
  // A bonus grows with the quality. A penalty does not: better plate is not
  // slower plate.
  const scale = (value: number | undefined, digits: number): number | undefined => {
    if (value === undefined) return undefined;
    const raised = value > 0 ? value * quality : value;
    const factor = 10 ** digits;
    return Math.round(raised * factor) / factor;
  };
  const bonus: StatBonus = {};
  const healthMax = scale(base.healthMax, 0);
  const moveSpeedScale = scale(base.moveSpeedScale, 2);
  const accuracy = scale(base.accuracy, 3);
  if (healthMax !== undefined) bonus.healthMax = healthMax;
  if (moveSpeedScale !== undefined) bonus.moveSpeedScale = moveSpeedScale;
  if (accuracy !== undefined) bonus.accuracy = accuracy;
  return { uid, kind, name: `${qualityWord(quality)}${base.name}`, depth, bonus };
}

/** The tier weights that hold at a depth. */
function tierWeightsAt(depth: number, delve: Delve): Partial<Record<string, number>> {
  let weights = delve.rewards.weaponTiers[0]?.weights ?? {};
  for (const step of delve.rewards.weaponTiers) {
    if (depth >= step.fromDepth) weights = step.weights;
  }
  return weights;
}

/** A generated weapon from a depth, or `null` if the generator could not make one. */
function rollWeapon(rng: Rng, depth: number, uid: string, config: SimConfig, delve: Delve): WeaponItem | null {
  const tables = loadWeaponRoles();
  const tierName = drawWeighted(rng, tierWeightsAt(depth, delve)) ?? "standard";
  const tier: WeaponTier | undefined = tables.tiers.list.find((candidate) => candidate.name === tierName);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const weapon = generateWeapon(rng, rng.pick(ROLE_TRAITS), attempt, {
      ticksPerSecond: config.ticksPerSecond,
      ...(tier ? { tier } : {}),
    });
    if (weapon) return weaponItem(weapon, uid, depth);
  }
  return null;
}

/** One reward item from a depth. */
export function rollItem(rng: Rng, depth: number, uid: string, config: SimConfig, delve: Delve = loadDelve()): Item {
  const kind = drawWeighted<ItemKind>(rng, delve.rewards.kindWeights) ?? "armor";
  if (kind === "weapon") {
    const weapon = rollWeapon(rng, depth, uid, config, delve);
    if (weapon) return weapon;
  }
  return rollGear(rng, kind === "trinket" ? "trinket" : "armor", depth, uid, delve);
}

/** How many items a clear of a depth gives. */
export function rewardCount(depth: number, delve: Delve = loadDelve()): number {
  const { itemsPerClear, bonusItemEveryDepths } = delve.rewards;
  return itemsPerClear + (depth % bonusItemEveryDepths === 0 ? 1 : 0);
}
