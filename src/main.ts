/**
 * Browser entry point (docs/delve.md).
 *
 * The town is the start screen. "Enter the dungeon" makes a new run and starts
 * depth 1. When a level ends, the level-over screen asks the player to go
 * deeper, with the party as it is, or to go back to town, which ends the run.
 *
 * The arena draws on two canvases (Section 7.18): the grid below and the
 * effects above. This file is the one place that joins the two sides. It reads
 * the state of the level through `SimArenaView` and it reads the event bus for
 * the effects, so the display never reaches into a system of the simulation.
 */
import { loadDelve } from "./core/data.js";
import { EventBus, type GameEvent } from "./core/events.js";
import { packCount, styleAt } from "./delve/level.js";
import type { LevelSetup } from "./delve/level.js";
import { autoEquip, createRoster, discard, equip, type Roster } from "./delve/roster.js";
import {
  canGoDeeper,
  createRun,
  returnToTown,
  finishLevel,
  nextLevel,
  startLevel,
  type DelveRun,
} from "./delve/run.js";
import { feedLines } from "./report/killFeed.js";
import { SimArenaView, eventCell } from "./render/arenaView.js";
import { NeonStage } from "./render/neonStage.js";
import { PICKUP_GLYPHS, themeForMatch, DEFAULT_THEME, type NeonTheme } from "./render/neonThemes.js";
import { SimRunner, type Frame, type Speed } from "./render/runner.js";
import type { WeaponVisualHints } from "./render/vfxLayer.js";
import { simConfigFromTuning, step, type SimState } from "./sim/index.js";
import { createBotStatus } from "./ui/botStatus.js";
import { clearRoster, readRoster, writeRoster } from "./ui/saveStore.js";
import { openLevelOverScreen, openTownScreen, type Screen } from "./ui/screens.js";
import { createSpeedControls } from "./ui/speedControls.js";

const INITIAL_SPEED: Speed = 1;
const KILL_FEED_LINES = 8;
/** The id that an interception shot carries in place of a bot id. */
const PROJECTILE_PREFIX = "projectile:";

/**
 * The seed of a new roster. `#seed=123` in the address picks it; the clock
 * gives one otherwise. A saved roster keeps its own seed, and each delve takes
 * a sub-seed of it (Section 7.1).
 */
function openingSeed(): number {
  const match = /seed=(\d+)/.exec(window.location.hash);
  return match ? Number(match[1]) : Math.floor(Date.now() / 1000);
}

function showError(error: unknown): void {
  const box = document.createElement("pre");
  box.className = "error";
  box.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  document.querySelector("#arena")?.replaceChildren(box);
}

/** The legend takes its colors from the palette of the level. */
function buildLegend(theme: NeonTheme): string {
  const items: [string, string, string][] = [
    ["#", "wall", theme.wallLit],
    ["▖", "cover", theme.cover],
    ["≈", "hazard", theme.hazard],
    [PICKUP_GLYPHS.weapon.ch, "weapon", PICKUP_GLYPHS.weapon.color],
    [PICKUP_GLYPHS.armor.ch, "armor", PICKUP_GLYPHS.armor.color],
    [PICKUP_GLYPHS.health.ch, "health", PICKUP_GLYPHS.health.color],
    [PICKUP_GLYPHS.powerup.ch, "powerup", PICKUP_GLYPHS.powerup.color],
    [PICKUP_GLYPHS.ammo.ch, "ammo", PICKUP_GLYPHS.ammo.color],
    ["@", "party", theme.teamA],
    ["@", "mobs", theme.teamB],
  ];
  return items
    .map(([glyph, label, color]) => `<b style="color:${color}">${glyph}</b> ${label}`)
    .join(" ");
}

/** The party members and the mobs still standing. */
function standing(state: SimState, teamId: "A" | "B"): { alive: number; total: number } {
  const team = state.bots.filter((bot) => bot.teamId === teamId);
  return { alive: team.filter((bot) => bot.alive).length, total: team.length };
}

/** The four weapon numbers that an event carries for the display. */
function visualHints(value: unknown): WeaponVisualHints {
  if (typeof value !== "object" || value === null) return {};
  const data = value as Record<string, unknown>;
  const read = (key: string): number | undefined => {
    const field = data[key];
    return typeof field === "number" ? field : undefined;
  };
  return {
    projectileSpeed: read("projectileSpeed"),
    aoeRadius: read("aoeRadius"),
    coneHalfAngle: read("coneHalfAngle"),
    rangeMax: read("rangeMax"),
  };
}

function readString(data: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

try {
  const arenaHost = document.querySelector<HTMLElement>("#arena");
  const meta = document.querySelector<HTMLElement>("#meta");
  const legend = document.querySelector<HTMLElement>("#legend");
  const controls = document.querySelector<HTMLElement>("#controls");
  const statusHost = document.querySelector<HTMLElement>("#status");
  const scoreHost = document.querySelector<HTMLElement>("#score");
  const feedHost = document.querySelector<HTMLElement>("#feed");
  const botsHost = document.querySelector<HTMLElement>("#bots");
  const stageHost = document.querySelector<HTMLElement>("#stage");
  if (
    !arenaHost ||
    !meta ||
    !legend ||
    !controls ||
    !statusHost ||
    !scoreHost ||
    !feedHost ||
    !botsHost ||
    !stageHost
  ) {
    throw new Error("index.html is missing one of the elements that main.ts needs");
  }
  const metaEl: HTMLElement = meta;
  const legendEl: HTMLElement = legend;
  const statusEl: HTMLElement = statusHost;
  const scoreEl: HTMLElement = scoreHost;
  const feedEl: HTMLElement = feedHost;
  const botStatus = createBotStatus({ container: botsHost });
  const stageEl: HTMLElement = stageHost;

  // The saved roster, or a new one. A save is never thrown away for a seed in
  // the address: the address only seeds a roster that does not exist yet.
  let roster: Roster = readRoster() ?? createRoster(openingSeed());
  writeRoster(roster);

  const stage = new NeonStage(arenaHost, { seed: roster.seed });
  const view = new SimArenaView({ directional: false });
  stage.setTheme(DEFAULT_THEME);
  legendEl.innerHTML = buildLegend(DEFAULT_THEME);

  // ------------------------------------------------------------------------
  // The state of the visit. A delve lasts from "Enter" to "Return to town".
  // ------------------------------------------------------------------------
  let run: DelveRun | null = null;
  let setup: LevelSetup | null = null;
  let bus = new EventBus();
  let state: SimState | null = null;
  let screen: Screen | null = null;
  /** The number of events that the kill feed has drawn. It saves a rebuild. */
  let drawnEvents = -1;

  function closeScreen(): void {
    screen?.close();
    screen = null;
  }

  function teamColor(teamId: "A" | "B" | null): string {
    const theme = stage.getTheme();
    return teamId === "B" ? theme.teamB : theme.teamA;
  }

  // ------------------------------------------------------------------------
  // The effects (Section 7.18). Each one answers an event: the display reads
  // what happened, it does not ask a system what it is doing.
  // ------------------------------------------------------------------------

  /** The cell of the thing that a shot points at. It can be another shot. */
  function targetCell(targetId: string | null): { x: number; y: number } | null {
    if (targetId === null) return null;
    if (targetId.startsWith(PROJECTILE_PREFIX)) {
      const id = Number(targetId.slice(PROJECTILE_PREFIX.length));
      return Number.isFinite(id) ? view.cellOfProjectile(id) : null;
    }
    return view.cellOfBot(targetId);
  }

  function onShot(event: GameEvent): void {
    const shooterId = readString(event.data, "shooterId");
    if (shooterId === null) return;
    const from = view.cellOfBot(shooterId);
    const to = targetCell(readString(event.data, "targetId"));
    if (!from || !to) return;
    stage.vfx.shot({
      from,
      to,
      attackType: readString(event.data, "attackType") ?? undefined,
      weapon: visualHints(event.data["visual"]),
      color: teamColor(view.teamOfBot(shooterId)),
    });
  }

  function onHit(event: GameEvent): void {
    const targetId = readString(event.data, "targetId");
    if (targetId === null) return;
    const damage = event.data["damage"];
    stage.vfx.spark(view.cellOfBot(targetId), typeof damage === "number" ? damage : 8);
  }

  function onDeath(event: GameEvent): void {
    const teamId = readString(event.data, "teamId");
    stage.vfx.death(eventCell(event.data["cell"]), teamColor(teamId === "B" ? "B" : "A"));
  }

  function onSpawn(event: GameEvent): void {
    const teamId = readString(event.data, "teamId");
    stage.vfx.spawnIn(eventCell(event.data["cell"]), teamColor(teamId === "B" ? "B" : "A"));
  }

  /** Listen to the bus of the match. A new match makes a new bus. */
  function listen(): void {
    bus.on("Shot", onShot);
    bus.on("Hit", onHit);
    bus.on("Death", onDeath);
    bus.on("Spawn", onSpawn);
  }

  // ------------------------------------------------------------------------
  // The frame
  // ------------------------------------------------------------------------

  /** The party, the mobs left, the kill feed and the status line. */
  function updatePanel(): void {
    if (!state) {
      botStatus.update(null, stage.getTheme());
      return;
    }
    const theme = stage.getTheme();
    botStatus.update(state, theme);
    const party = standing(state, "A");
    const mobs = standing(state, "B");
    scoreEl.innerHTML = [
      `<span style="color:${theme.teamA}">party ${party.alive}/${party.total}</span>`,
      `<span class="dim">·</span>`,
      `<span style="color:${theme.teamB}">mobs ${mobs.alive}/${mobs.total}</span>`,
    ].join(" ");

    // The feed only changes when an event arrives, so it is not rebuilt at the
    // rate of the screen.
    if (bus.log.length !== drawnEvents) {
      drawnEvents = bus.log.length;
      feedEl.replaceChildren();
      for (const line of feedLines(bus.log, KILL_FEED_LINES)) {
        const item = document.createElement("li");
        item.textContent = line.text;
        if (line.kind !== "kill") item.className = `announce ${line.kind}`;
        feedEl.append(item);
      }
    }

    const depth = setup?.depth ?? 0;
    const seconds = Math.floor(state.tick / state.config.ticksPerSecond);
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    statusEl.textContent =
      state.outcome === null
        ? `depth ${depth}  ·  ${clock}  ·  ${mobs.alive} mobs left`
        : `depth ${depth}  ·  ${state.outcome.reason === "cleared" ? "cleared" : state.outcome.reason === "wiped" ? "the party fell" : "time ran out"}`;
  }

  /** One animation frame: the panel, the grid, then the effects on top. */
  function onFrame(frame: Frame): void {
    view.interp = frame.interp;
    updatePanel();
    stage.draw(view, frame.now, frame.dt);
  }

  // ------------------------------------------------------------------------
  // The delve loop
  // ------------------------------------------------------------------------

  /** Start a new delve at depth 1, with the heroes as their loadouts make them. */
  function enterDungeon(): void {
    run = createRun(roster);
    startNextLevel();
  }

  /** Build the next level of the run and point the display at it. */
  function startNextLevel(): void {
    if (!run) return;
    setup = nextLevel(run);
    bus = new EventBus();
    listen();
    state = startLevel(run, setup, bus);

    // A level gets its own palette from the seed of the run, so a replay of the
    // run looks the same (Section 7.1).
    const theme = themeForMatch(run.seed, setup.depth);
    stage.setTheme(theme);
    stage.setSize(setup.arena.width, setup.arena.height);
    stage.vfx.clear();
    legendEl.innerHTML = buildLegend(theme);
    view.setState(state);
    drawnEvents = -1;

    metaEl.textContent = [
      `Delve ${run.delveNumber}`,
      setup.arena.name,
      `${setup.arena.width}×${setup.arena.height}`,
      theme.name,
    ].join("  ·  ");

    speedControls.setEnabled(true);
    speedControls.setSpeed(INITIAL_SPEED);
    runner.setSpeed(INITIAL_SPEED);
    updatePanel();
  }

  /** The level ended: write it down and ask what comes next. */
  function endLevel(): void {
    const current = run;
    if (!current || !setup || !state || state.outcome === null) return;
    runner.setSpeed(0);
    speedControls.setEnabled(false);
    updatePanel();

    const record = finishLevel(current, setup, state);
    const delve = loadDelve();
    const packs = packCount(current.depth, delve);
    screen = openLevelOverScreen({
      container: stageEl,
      run: current,
      record,
      canGoDeeper: canGoDeeper(current),
      nextLevelText: `Depth ${current.depth} is a ${styleAt(current.depth, delve)} with about ${packs} packs of mobs.`,
      onDeeper: () => {
        closeScreen();
        startNextLevel();
      },
      onTown: () => {
        closeScreen();
        returnToTown(roster, current);
        writeRoster(roster);
        run = null;
        showTown();
      },
    });
  }

  // ------------------------------------------------------------------------
  // The town
  // ------------------------------------------------------------------------

  function showTown(): void {
    runner.setSpeed(0);
    speedControls.setEnabled(false);
    // The panel reads `state`. Clearing it stops the last level writing over
    // the panel while the town is open.
    state = null;
    setup = null;
    view.setState(null);
    stage.vfx.clear();
    statusEl.textContent = "In town.";
    metaEl.textContent = `town  ·  seed ${roster.seed}`;
    scoreEl.textContent = "";
    feedEl.replaceChildren();
    drawnEvents = -1;
    screen = openTownScreen({
      container: stageEl,
      roster,
      seed: roster.seed,
      onEquip: (heroIndex, slot, uid) => {
        equip(roster, heroIndex, slot, uid);
        writeRoster(roster);
      },
      onAutoEquip: () => {
        autoEquip(roster);
        writeRoster(roster);
      },
      onDiscard: (uid) => {
        discard(roster, uid);
        writeRoster(roster);
      },
      onEnter: () => {
        closeScreen();
        enterDungeon();
      },
      onReset: () => {
        clearRoster();
        roster = createRoster(Math.floor(Date.now() / 1000));
        writeRoster(roster);
        closeScreen();
        showTown();
      },
    });
  }

  const runner = new SimRunner({
    ticksPerSecond: simConfigFromTuning().ticksPerSecond,
    initialSpeed: INITIAL_SPEED,
    onTick: () => {
      if (!state) return;
      // The cells of the bots before the step are what the glide reads from.
      view.beginTick();
      step(state);
      view.endTick();
      if (state.outcome !== null) endLevel();
    },
    onRender: onFrame,
  });

  const speedControls = createSpeedControls({
    container: controls,
    initialSpeed: INITIAL_SPEED,
    onSpeed: (speed) => runner.setSpeed(speed),
    onStep: () => runner.stepOnce(),
    onSkip: () => {
      if (!state) return;
      runner.setSpeed(0);
      // The time limit bounds this loop.
      while (state.outcome === null) step(state);
      // The whole level ran in one frame. The effects of it never had a frame
      // to draw in, so they go, and the arena is left as the level left it.
      stage.vfx.clear();
      view.setState(state);
      endLevel();
    },
  });

  showTown();
  runner.start();
} catch (error) {
  showError(error);
}
