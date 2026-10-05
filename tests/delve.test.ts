import { describe, expect, it } from "vitest";
import { parseArenaText } from "../src/arena/index.js";
import { distanceField } from "../src/arena/contested.js";
import { cellIndex } from "../src/arena/types.js";
import { loadDelve } from "../src/core/data.js";
import { createRng } from "../src/core/rng.js";
import { exploreGoal } from "../src/ai/utility.js";
import { runDelve } from "../src/delve/batch.js";
import { levelConfig, packCount, partySpawns, placePacks } from "../src/delve/level.js";
import { mobWeapon } from "../src/delve/mobs.js";
import {
  canGoDeeper,
  createRun,
  finishLevel,
  nextLevel,
  partyAlive,
  startLevel,
} from "../src/delve/run.js";
import {
  checkRoundEnd,
  createSimState,
  runRound,
  simConfigFromTuning,
  step,
  stepMany,
  type BotSpec,
  type SimState,
} from "../src/sim/index.js";

/** A small room: the party on the left, two mobs on the right. */
const ROOM = [
  "##############",
  "#S..........S#",
  "#S..........S#",
  "#S..........S#",
  "##############",
].join("\n");

function roomState(): SimState {
  const map = parseArenaText(ROOM, { source: "room" });
  const config = levelConfig();
  const party: BotSpec[] = [0, 1, 2].map((slot) => ({
    id: `P${slot}`,
    label: "party",
    spawn: { x: 1, y: 1 + slot },
    role: "tank",
    healthMax: 150,
  }));
  const mobs: BotSpec[] = [
    { id: "M0", label: "mob", spawn: { x: 12, y: 1 }, role: "tank", healthMax: 40, takesPickups: false },
    { id: "M1", label: "mob", spawn: { x: 12, y: 3 }, role: "tank", healthMax: 40, takesPickups: false },
  ];
  return createSimState({ map, seed: 3, config, roster: { A: party, B: mobs }, explore: ["A"] });
}

describe("a roster", () => {
  it("gives a team any number of bots, each with its own health", () => {
    const state = roomState();
    expect(state.bots.filter((bot) => bot.teamId === "A")).toHaveLength(3);
    expect(state.bots.filter((bot) => bot.teamId === "B")).toHaveLength(2);
    const mob = state.bots.find((bot) => bot.id === "M0");
    expect(mob?.healthMax).toBe(40);
    expect(mob?.health).toBe(40);
    expect(mob?.takesPickups).toBe(false);
  });

  it("leaves a tournament round as it was", () => {
    const map = parseArenaText(ROOM, { source: "room" });
    const state = createSimState({ map, seed: 3 });
    expect(state.bots.map((bot) => bot.id)).toEqual(["A0", "A1", "A2", "B0", "B1", "B2"]);
    expect(state.bots.every((bot) => bot.healthMax === state.config.healthMax)).toBe(true);
    expect(state.config.respawn).toBe(true);
    expect(state.explored).toEqual({});
  });

  it("brings a fallen member in fallen, and never respawns it", () => {
    const map = parseArenaText(ROOM, { source: "room" });
    const fallen: BotSpec = {
      id: "P0",
      label: "party",
      spawn: { x: 1, y: 1 },
      role: "tank",
      carry: { alive: false, health: 0, armor: 0, weapons: [], weaponId: "", ammo: new Map() },
    };
    const state = createSimState({ map, seed: 3, config: levelConfig(), roster: { A: [fallen] } });
    const bot = state.bots.find((candidate) => candidate.id === "P0");
    expect(bot?.alive).toBe(false);
    stepMany(state, 50);
    expect(bot?.alive).toBe(false);
  });
});

describe("the end of a level", () => {
  it("is a clear when every mob is dead", () => {
    const state = roomState();
    for (const bot of state.bots) if (bot.teamId === "B") bot.alive = false;
    const outcome = checkRoundEnd(state);
    expect(outcome?.reason).toBe("cleared");
    expect(outcome?.winnerTeamId).toBe("A");
  });

  it("is a wipe when every party member is dead", () => {
    const state = roomState();
    for (const bot of state.bots) if (bot.teamId === "A") bot.alive = false;
    const outcome = checkRoundEnd(state);
    expect(outcome?.reason).toBe("wiped");
    expect(outcome?.winnerTeamId).toBe("B");
  });

  it("ignores the score limit", () => {
    const state = roomState();
    state.score.A = state.config.scoreLimit + 5;
    expect(checkRoundEnd(state)).toBeNull();
  });

  it("comes in the room, and nobody respawns", () => {
    const state = roomState();
    runRound(state);
    expect(["cleared", "wiped"]).toContain(state.outcome?.reason);
    const dead = state.bots.filter((bot) => !bot.alive);
    expect(dead.length).toBeGreaterThan(0);
    // A dead bot stays dead to the end of the level.
    expect(state.bus.log.filter((event) => event.type === "Spawn" && event.tick > 0)).toHaveLength(0);
  });
});

describe("exploring", () => {
  it("remembers what the party has seen", () => {
    const state = roomState();
    step(state);
    expect(state.explored.A?.size ?? 0).toBeGreaterThan(0);
    expect(state.explored.B).toBeUndefined();
  });

  it("walks to a cell the party has not seen", () => {
    const state = roomState();
    const bot = state.bots[0]!;
    const goal = exploreGoal(state, bot);
    expect(goal).not.toBeNull();
    expect(state.explored.A?.has(cellIndex(state.map, goal!.x, goal!.y))).toBe(false);
  });

  it("hunts the nearest mob when everything has been seen", () => {
    const state = roomState();
    const explored = state.explored.A!;
    for (let index = 0; index < state.map.width * state.map.height; index += 1) explored.add(index);
    const goal = exploreGoal(state, state.bots[0]!);
    expect(goal).toEqual({ x: 12, y: 1 });
  });

  it("is not something a tournament bot does", () => {
    const map = parseArenaText(ROOM, { source: "room" });
    const state = createSimState({ map, seed: 3 });
    expect(exploreGoal(state, state.bots[0]!)).toBeNull();
  });
});

describe("mobs", () => {
  it("get stronger with depth", () => {
    const config = simConfigFromTuning();
    expect(mobWeapon("grunt", 5, config).damage).toBeGreaterThan(mobWeapon("grunt", 1, config).damage);
    expect(packCount(8)).toBeGreaterThan(packCount(1));
    expect(packCount(1000)).toBe(loadDelve().levels.packsMax);
  });

  it("give a melee weapon damage at close range only", () => {
    const weapon = mobWeapon("grunt", 1, simConfigFromTuning());
    expect(weapon.dpsProfile.close).toBeGreaterThan(0);
    expect(weapon.dpsProfile.mid).toBe(0);
    expect(weapon.dpsProfile.long).toBe(0);
  });

  it("stand in packs far from the party, one mob a cell", () => {
    const setup = nextLevel(createRun(11));
    const cells = setup.mobs.map((mob) => cellIndex(setup.arena, mob.spawn.x, mob.spawn.y));
    expect(new Set(cells).size).toBe(cells.length);
    const field = distanceField(setup.arena, partySpawns(setup.arena));
    let longest = 0;
    for (const distance of field) longest = Math.max(longest, distance);
    for (const cell of cells) {
      expect(field[cell]).toBeGreaterThanOrEqual(Math.floor(longest * loadDelve().levels.minDistanceShare));
    }
  });

  it("are placed the same way from the same seed", () => {
    const setup = nextLevel(createRun(11));
    const again = placePacks(setup.arena, [3, 3], createRng(5, "mobs"));
    const twice = placePacks(setup.arena, [3, 3], createRng(5, "mobs"));
    expect(again).toEqual(twice);
  });
});

describe("a run", () => {
  it("starts with a full party, each with a weapon of its own", () => {
    const run = createRun(21);
    expect(run.party.map((member) => member.name)).toEqual(["Fighter", "Thief", "Wizard"]);
    expect(partyAlive(run)).toBe(3);
    const starters = run.party.map((member) => member.carry.weaponId);
    expect(new Set(starters).size).toBe(3);
  });

  it("carries the party from one level into the next", () => {
    const run = createRun(21);
    const setup = nextLevel(run);
    const state = startLevel(run, setup);
    runRound(state);
    const record = finishLevel(run, setup, state);
    expect(record.depth).toBe(1);
    expect(run.depth).toBe(2);

    const next = startLevel(run, nextLevel(run));
    for (const member of run.party) {
      const bot = next.bots.find((candidate) => candidate.id === member.name);
      expect(bot?.alive).toBe(member.carry.alive);
      if (member.carry.alive) expect(bot?.health).toBeCloseTo(member.carry.health);
      expect(bot?.weapons.map((weapon) => weapon.id)).toEqual(member.carry.weapons.map((weapon) => weapon.id));
    }
  });

  it("replays from its seed", () => {
    const first = runDelve(31, 2);
    const second = runDelve(31, 2);
    expect(second).toEqual(first);
  });

  it("ends its levels by a clear or a wipe, not by the clock", () => {
    let levels = 0;
    let timeouts = 0;
    for (let seed = 0; seed < 4; seed += 1) {
      const result = runDelve(500 + seed, 3);
      levels += result.levels.length;
      timeouts += result.levels.filter((level) => level.reason === "timeLimit").length;
    }
    expect(levels).toBeGreaterThan(0);
    expect(timeouts).toBe(0);
  });

  it("stops when nobody is standing", () => {
    const run = createRun(41);
    for (const member of run.party) member.carry = { ...member.carry, alive: false, health: 0 };
    expect(canGoDeeper(run)).toBe(false);
  });
});
