import { describe, expect, it } from "vitest";
import { createRng } from "../src/core/rng.js";
import { playDelve, runCampaign } from "../src/delve/batch.js";
import { describeItem, itemScore, rollItem, SLOTS, slotKind, type Item } from "../src/delve/items.js";
import { levelConfig } from "../src/delve/level.js";
import {
  autoEquip,
  createRoster,
  discard,
  equip,
  heroStats,
  isEquipped,
  type Roster,
} from "../src/delve/roster.js";
import { createRun, finishLevel, nextLevel, returnToTown, startLevel } from "../src/delve/run.js";
import { loadRoster, saveRoster } from "../src/delve/save.js";
import { runRound } from "../src/sim/index.js";

/** A roster with a few rolled items in its stash. */
function stocked(seed = 3, count = 12): Roster {
  const roster = createRoster(seed);
  const rng = createRng(seed, "test-loot");
  for (let i = 0; i < count; i += 1) {
    roster.stash.push(rollItem(rng, 1 + (i % 6), `item-${roster.nextUid++}`, levelConfig()));
  }
  // A weapon item takes its uid as its weapon id.
  for (const item of roster.stash) if (item.kind === "weapon") item.weapon.id = item.uid;
  return roster;
}

function firstOf(roster: Roster, kind: Item["kind"]): Item {
  const item = roster.stash.find((candidate) => candidate.kind === kind);
  if (!item) throw new Error(`the test stash holds no ${kind}`);
  return item;
}

describe("items", () => {
  it("roll from a seed, the same each time", () => {
    const a = rollItem(createRng(9, "x"), 4, "u", levelConfig());
    const b = rollItem(createRng(9, "x"), 4, "u", levelConfig());
    expect(a).toEqual(b);
  });

  it("get better with depth", () => {
    const mean = (depth: number): number => {
      const rng = createRng(depth, "depth");
      let total = 0;
      let count = 0;
      for (let i = 0; i < 200; i += 1) {
        const item = rollItem(rng, depth, "u", levelConfig());
        if (item.kind === "weapon") continue;
        total += itemScore(item, "tank", levelConfig());
        count += 1;
      }
      return total / count;
    };
    expect(mean(8)).toBeGreaterThan(mean(1));
  });

  it("say what they do", () => {
    const roster = stocked();
    for (const item of roster.stash) expect(describeItem(item).length).toBeGreaterThan(5);
  });
});

describe("a loadout", () => {
  it("starts with one weapon for each hero", () => {
    const roster = createRoster(5);
    expect(roster.heroes.map((hero) => hero.name)).toEqual(["Fighter", "Thief", "Wizard"]);
    for (const hero of roster.heroes) expect(hero.loadout.weapon1?.kind).toBe("weapon");
    expect(roster.stash).toHaveLength(0);
  });

  it("takes an item from the stash, and gives the old one back", () => {
    const roster = stocked();
    const weapon = firstOf(roster, "weapon");
    const old = roster.heroes[0]!.loadout.weapon1!;
    expect(equip(roster, 0, "weapon1", weapon.uid)).toBe(true);
    expect(roster.heroes[0]!.loadout.weapon1?.uid).toBe(weapon.uid);
    expect(roster.stash.some((item) => item.uid === old.uid)).toBe(true);
    expect(roster.stash.some((item) => item.uid === weapon.uid)).toBe(false);
  });

  it("refuses an item that does not fit the slot", () => {
    const roster = stocked();
    const armour = firstOf(roster, "armor");
    expect(equip(roster, 0, "weapon1", armour.uid)).toBe(false);
    expect(equip(roster, 0, "trinket", armour.uid)).toBe(false);
    expect(roster.stash.some((item) => item.uid === armour.uid)).toBe(true);
  });

  it("empties a slot into the stash", () => {
    const roster = createRoster(5);
    const old = roster.heroes[1]!.loadout.weapon1!;
    expect(equip(roster, 1, "weapon1", null)).toBe(true);
    expect(roster.heroes[1]!.loadout.weapon1).toBeUndefined();
    expect(roster.stash.map((item) => item.uid)).toEqual([old.uid]);
  });

  it("adds the bonuses of armour and trinkets to the stats", () => {
    const roster = stocked();
    const hero = roster.heroes[0]!;
    const before = heroStats(hero).healthMax;
    const armour = firstOf(roster, "armor");
    equip(roster, 0, "armor", armour.uid);
    if (armour.kind !== "weapon") {
      expect(heroStats(hero).healthMax).toBeCloseTo(Math.max(1, before + (armour.bonus.healthMax ?? 0)));
    }
  });

  it("is never two places at once after auto-equip", () => {
    const roster = stocked(7, 20);
    const total = roster.stash.length + roster.heroes.length;
    autoEquip(roster);
    const placed = roster.heroes.flatMap((hero) => SLOTS.flatMap((slot) => (hero.loadout[slot] ? [hero.loadout[slot]!.uid] : [])));
    expect(new Set(placed).size).toBe(placed.length);
    for (const uid of placed) expect(roster.stash.some((item) => item.uid === uid)).toBe(false);
    expect(placed.length + roster.stash.length).toBe(total);
    for (const hero of roster.heroes) {
      for (const slot of SLOTS) {
        const item = hero.loadout[slot];
        if (item) expect(item.kind).toBe(slotKind(slot));
      }
    }
  });

  it("discards from the stash only", () => {
    const roster = stocked();
    const equipped = roster.heroes[0]!.loadout.weapon1!;
    expect(discard(roster, equipped.uid)).toBe(false);
    const item = roster.stash[0]!;
    expect(discard(roster, item.uid)).toBe(true);
    expect(roster.stash.some((candidate) => candidate.uid === item.uid)).toBe(false);
  });
});

describe("a delve from the roster", () => {
  it("takes the loadout and the stats of each hero", () => {
    const roster = stocked();
    autoEquip(roster);
    const run = createRun(roster);
    const state = startLevel(run, nextLevel(run));
    for (const hero of roster.heroes) {
      const bot = state.bots.find((candidate) => candidate.id === hero.name)!;
      const stats = heroStats(hero);
      expect(bot.healthMax).toBeCloseTo(stats.healthMax);
      expect(bot.health).toBeCloseTo(stats.healthMax);
      expect(bot.attributes.accuracy).toBeCloseTo(stats.accuracy);
      const wanted = SLOTS.filter((slot) => slot.startsWith("weapon"))
        .map((slot) => hero.loadout[slot])
        .filter((item): item is Item => item !== undefined)
        .map((item) => item.uid);
      expect(bot.weapons.slice(1).map((weapon) => weapon.id)).toEqual(wanted);
    }
  });

  it("puts loot in the pack when it clears a level", () => {
    const roster = createRoster(13);
    const run = createRun(roster);
    const setup = nextLevel(run);
    const state = startLevel(run, setup);
    runRound(state);
    const record = finishLevel(run, setup, state);
    // This seed clears depth 1, so the test reads the loot and not a wipe.
    expect(record.reason).toBe("cleared");
    expect(record.loot.length).toBeGreaterThan(0);
    expect(run.pack.map((item) => item.name)).toEqual(record.loot);
  });
});

describe("the return to town", () => {
  it("banks the pack and the weapons picked up, with new uids", () => {
    const roster = createRoster(17);
    const { run } = playDelve(roster, 2, "deeper");
    // This seed comes back alive with loot, so the test reads a real bank.
    expect(run.party.some((member) => member.carry.alive)).toBe(true);
    const summary = returnToTown(roster, run);
    expect(roster.delves).toBe(1);
    expect(summary.wiped).toBe(false);
    expect(summary.banked.length).toBeGreaterThan(run.pack.length);
    expect(roster.stash.length).toBe(summary.banked.length);
    expect(new Set(roster.stash.map((item) => item.uid)).size).toBe(roster.stash.length);
    for (const item of roster.stash) {
      expect(item.uid.startsWith("item-")).toBe(true);
      if (item.kind === "weapon") expect(item.weapon.id).toBe(item.uid);
      expect(isEquipped(roster, item.uid)).toBe(false);
    }
  });

  it("loses the pack on a wipe, and keeps what is equipped", () => {
    const roster = createRoster(19);
    const loadout = roster.heroes.map((hero) => hero.loadout.weapon1?.uid);
    const run = createRun(roster);
    run.pack.push(rollItem(createRng(1, "x"), 1, "d1-loot-0", levelConfig()));
    for (const member of run.party) member.carry = { ...member.carry, alive: false, health: 0 };
    const summary = returnToTown(roster, run);
    expect(summary.wiped).toBe(true);
    expect(summary.lost.length).toBeGreaterThan(0);
    expect(roster.stash).toHaveLength(0);
    expect(roster.heroes.map((hero) => hero.loadout.weapon1?.uid)).toEqual(loadout);
  });

  it("heals: the next delve starts at full health with every hero up", () => {
    const roster = createRoster(23);
    const first = createRun(roster);
    for (const member of first.party) member.carry = { ...member.carry, alive: false, health: 0 };
    first.party[0]!.carry = { ...first.party[0]!.carry, alive: true, health: 1 };
    returnToTown(roster, first);
    const next = createRun(roster);
    expect(next.delveNumber).toBe(2);
    for (const member of next.party) {
      expect(member.carry.alive).toBe(true);
      expect(member.carry.health).toBe(member.healthMax);
      expect(member.carry.ammo.size).toBe(0);
    }
  });

  it("makes a campaign go deeper as the gear gets better", () => {
    const { delves } = runCampaign(29, 6, 8, "cautious");
    expect(delves).toHaveLength(6);
    expect(delves[delves.length - 1]!.partyHealth).toBeGreaterThanOrEqual(delves[0]!.partyHealth);
  });
});

describe("a save", () => {
  it("gives back the same roster", () => {
    const roster = stocked();
    autoEquip(roster);
    const text = saveRoster(roster);
    expect(loadRoster(text)).toEqual(JSON.parse(JSON.stringify(roster)));
  });

  it("refuses text that is not a save", () => {
    expect(loadRoster("not json")).toBeNull();
    expect(loadRoster(JSON.stringify({ schemaVersion: 99, roster: {} }))).toBeNull();
    expect(loadRoster(JSON.stringify({ schemaVersion: 1, roster: { seed: 1 } }))).toBeNull();
  });
});
