/**
 * The save of a roster (docs/delve.md, Section 10).
 *
 * The roster is the only state that lasts between visits: a delve in progress
 * is not saved, because a level is short and replays from its seed. The text
 * is JSON with a `schemaVersion`. A save that does not parse, or that has a
 * version this code does not know, gives `null`, and the game starts a new
 * roster. The browser keeps the text (`ui/saveStore.ts`); this file only turns
 * a roster into text and back, so it runs in Node and in the tests.
 */
import { z } from "zod";
import { WeaponSchema } from "../core/schemas.js";
import type { Weapon } from "../weapons/types.js";
import { SLOTS, type Item } from "./items.js";
import type { Roster } from "./roster.js";

export const SAVE_SCHEMA_VERSION = 1;

const StatBonusSchema = z
  .object({ healthMax: z.number().optional(), moveSpeedScale: z.number().optional(), accuracy: z.number().optional() })
  .strict();

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({ uid: z.string(), kind: z.literal("weapon"), name: z.string(), depth: z.number(), weapon: WeaponSchema }).strict(),
  z
    .object({ uid: z.string(), kind: z.enum(["armor", "trinket"]), name: z.string(), depth: z.number(), bonus: StatBonusSchema })
    .strict(),
]);

const LevelRecordSchema = z
  .object({
    depth: z.number(),
    arenaName: z.string(),
    reason: z.enum(["cleared", "wiped", "timeLimit"]),
    ticks: z.number(),
    mobs: z.number(),
    mobsKilled: z.number(),
    partyAlive: z.number(),
    loot: z.array(z.string()),
  })
  .strict();

const RosterSchema = z
  .object({
    seed: z.number(),
    heroes: z.array(
      z
        .object({
          classId: z.string(),
          name: z.string(),
          role: z.enum(["overwatch", "tank", "skirmisher"]),
          healthMax: z.number(),
          moveSpeedScale: z.number(),
          loadout: z.object(Object.fromEntries(SLOTS.map((slot) => [slot, ItemSchema.optional()]))).strict(),
        })
        .strict(),
    ),
    stash: z.array(ItemSchema),
    nextUid: z.number().int().positive(),
    delves: z.number().int().nonnegative(),
    bestDepth: z.number().int().nonnegative(),
    lastDelve: z
      .object({
        delveNumber: z.number(),
        levels: z.array(LevelRecordSchema),
        deepestCleared: z.number(),
        wiped: z.boolean(),
        banked: z.array(z.string()),
        lost: z.array(z.string()),
      })
      .strict()
      .nullable(),
  })
  .strict();

const SaveSchema = z.object({ schemaVersion: z.literal(SAVE_SCHEMA_VERSION), roster: RosterSchema }).strict();

/** The roster as text. */
export function saveRoster(roster: Roster): string {
  return JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, roster });
}

/** A roster from its text, or `null` when the text is not a save of this version. */
export function loadRoster(text: string): Roster | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = SaveSchema.safeParse(value);
  if (!parsed.success) return null;
  // zod types an optional key as `T | undefined`; a parsed save holds no
  // undefined value, so the cast only narrows the type.
  const roster = parsed.data.roster as unknown as Roster;
  for (const item of [...roster.stash, ...roster.heroes.flatMap((marine) => Object.values(marine.loadout))]) {
    if ((item as Item | undefined)?.kind === "weapon") {
      const weapon = (item as { weapon: Weapon }).weapon;
      if (weapon.id !== (item as Item).uid) return null;
    }
  }
  return roster;
}
