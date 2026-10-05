/**
 * The mobs of a delve (docs/delve.md).
 *
 * A mob is a bot of team B. Its kind names a role of `data/roles.json`, and
 * `mobBehavior` and `mobTactics` turn that role into a mob: it waits where it
 * stands, it takes no items, and it joins a fight that its pack is already in.
 * The AI is the same utility AI as the party's. Only the weights differ.
 */
import { loadBaselineWeapon, loadDelve } from "../core/data.js";
import type { Delve, Tactics } from "../core/schemas.js";
import type { Cell } from "../core/types.js";
import type { BotSpec, SimConfig } from "../sim/state.js";
import { RANGE_BANDS, type BandValues, type Weapon } from "../weapons/types.js";
import { bandDistanceOf, rangeAccuracy } from "../weapons/range.js";

/** How much stronger a mob is at a depth. Depth 1 is the base. */
export function depthScale(perDepth: number, depth: number): number {
  return 1 + perDepth * Math.max(0, depth - 1);
}

/**
 * The damage per second of a mob weapon in each band, after the range curve.
 *
 * The AI reads this profile to choose a band and a weapon. A band past the
 * reach of the weapon gets nothing, so a melee mob closes in.
 */
function dpsProfileOf(weapon: Weapon, config: SimConfig): BandValues {
  const bands = { closeMax: config.rangeBandCloseMax, midMax: config.rangeBandMidMax };
  const falloff = { distanceFalloff: config.distanceFalloff, rangeFloorShare: config.rangeFloorShare };
  const perSecond = (weapon.damage * config.ticksPerSecond) / weapon.fireIntervalTicks;
  const profile: BandValues = { close: 0, mid: 0, long: 0 };
  for (const band of RANGE_BANDS) {
    const distance = bandDistanceOf(band, bands);
    // A melee weapon reaches less than the middle of the close band. It still
    // fights at close range, so the close band reads its own optimal range.
    const at = band === "close" ? Math.min(distance, weapon.optimalRange) : distance;
    if (at > weapon.rangeMax) continue;
    profile[band] = perSecond * rangeAccuracy(weapon, at, falloff);
  }
  return profile;
}

/** The weapon of a mob kind at a depth. */
export function mobWeapon(kindId: string, depth: number, config: SimConfig, delve: Delve = loadDelve()): Weapon {
  const kind = delve.mobs[kindId];
  if (!kind) throw new Error(`data/delve.json has no mob "${kindId}"`);
  const spec = kind.weapon;
  const base = loadBaselineWeapon();
  const weapon: Weapon = {
    ...base,
    id: `mob-${kindId}-d${depth}`,
    name: spec.name,
    archetype: "baseline",
    tier: "mob",
    attackType: spec.attackType,
    damage: spec.damage * depthScale(delve.levels.mobDamagePerDepth, depth),
    fireIntervalTicks: spec.fireIntervalTicks,
    rangeMax: spec.rangeMax,
    optimalRange: spec.optimalRange,
    rangeTolerance: spec.rangeTolerance,
    projectileSpeed: spec.attackType === "projectile" ? (spec.projectileSpeed ?? 0.8) : null,
    coneHalfAngle: spec.attackType === "cone" ? ((spec.coneHalfAngleDegrees ?? 35) * Math.PI) / 180 : 0,
    // A mob has no crit and never runs dry: the first weapon of a bot is its
    // fallback, and the fallback has no magazine.
    critChance: 0,
    critConditions: [],
    traits: [],
  };
  weapon.dpsProfile = dpsProfileOf(weapon, config);
  return weapon;
}

/** The spec of one mob, for the roster of a level. */
export function mobSpec(
  kindId: string,
  id: string,
  spawn: Cell,
  depth: number,
  config: SimConfig,
  delve: Delve = loadDelve(),
): BotSpec {
  const kind = delve.mobs[kindId];
  if (!kind) throw new Error(`data/delve.json has no mob "${kindId}"`);
  return {
    id,
    label: kind.name,
    spawn,
    role: kind.role,
    // A data file holds no `undefined`, but zod types a partial as if it could.
    tactics: Object.fromEntries(
      Object.entries(delve.mobTactics).filter(([, value]) => value !== undefined),
    ) as Partial<Tactics>,
    behavior: delve.mobBehavior,
    healthMax: kind.healthMax * depthScale(delve.levels.mobHealthPerDepth, depth),
    moveSpeedScale: kind.moveSpeedScale,
    weapons: [mobWeapon(kindId, depth, config, delve)],
    takesPickups: false,
  };
}
