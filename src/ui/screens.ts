/**
 * The screens of a delve (docs/delve.md). Browser only.
 *
 * - **Town.** The start screen. The player sends the party into the dungeon
 *   from here, and a party that comes back ends its run here.
 * - **Level over.** A level ended. The player chooses: go deeper with the
 *   party as it is, or go back to town.
 */
import type { DelveRun, LevelRecord, PartyMember } from "../delve/run.js";

export interface Screen {
  close(): void;
}

function screenBox(container: HTMLElement, title: string): HTMLElement {
  const screen = document.createElement("section");
  screen.className = "screen";
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-label", title);
  const heading = document.createElement("h2");
  heading.textContent = title;
  screen.append(heading);
  container.append(screen);
  return screen;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = primary ? "start" : "choice";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function paragraph(text: string, dim = false): HTMLParagraphElement {
  const element = document.createElement("p");
  if (dim) element.className = "dim";
  element.textContent = text;
  return element;
}

function group(title: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "menu-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  element.append(heading);
  return element;
}

/** One row per party member: health, armour, and the weapons it carries. */
function partyList(party: readonly PartyMember[]): HTMLElement {
  const list = document.createElement("ul");
  list.className = "brief-bots";
  for (const member of party) {
    const row = document.createElement("li");
    row.className = member.carry.alive ? "bot-row" : "bot-row away";
    const name = document.createElement("b");
    name.textContent = member.name;
    const state = document.createElement("span");
    state.className = "brief-kd";
    state.textContent = member.carry.alive
      ? `${Math.round(member.carry.health)}/${member.healthMax}` +
        (member.carry.armor > 0 ? ` ◘${Math.round(member.carry.armor)}` : "")
      : "fallen";
    const where = document.createElement("span");
    where.className = "dim";
    where.textContent = member.role;
    const guns = document.createElement("span");
    guns.className = "dim";
    guns.textContent = member.carry.weapons
      .map((weapon) => {
        const ammo = member.carry.ammo.get(weapon.id);
        return ammo === undefined || weapon === member.carry.weapons[0]
          ? weapon.name
          : `${weapon.name} ${Math.max(0, Math.round(ammo))}/${weapon.ammoMax}`;
      })
      .join(" · ");
    row.append(name, state, where, guns);
    list.append(row);
  }
  return list;
}

/** One line for a level that ended. */
export function levelLine(record: LevelRecord): string {
  const how =
    record.reason === "cleared"
      ? "cleared"
      : record.reason === "wiped"
        ? "the party fell"
        : "time ran out";
  return `Depth ${record.depth}: ${how}, ${record.mobsKilled}/${record.mobs} mobs, ${record.partyAlive}/3 standing.`;
}

export interface TownOptions {
  container: HTMLElement;
  /** The run that just came back, if there is one. */
  lastRun: DelveRun | null;
  /** The deepest level that any run of this visit cleared. */
  bestDepth: number;
  seed: number;
  onEnter: () => void;
}

/** The town: the start screen, and where a run ends. */
export function openTownScreen(options: TownOptions): Screen {
  const screen = screenBox(options.container, "ASCII Delve · Town");
  screen.append(
    paragraph(
      "A fighter, a thief and a wizard go into the dungeon. They act on their own. You decide when they go deeper and when they come back.",
      true,
    ),
  );

  const last = options.lastRun;
  if (last && last.history.length > 0) {
    const report = group("The last delve");
    for (const record of last.history) report.append(paragraph(levelLine(record)));
    report.append(partyList(last.party));
    screen.append(report);
  }
  if (options.bestDepth > 0) {
    screen.append(paragraph(`Deepest level cleared on this visit: ${options.bestDepth}.`, true));
  }

  const enter = group("The dungeon");
  enter.append(
    paragraph(
      "A new party, at full health. Every level is a new map with packs of mobs. Clear it, then choose: go deeper as you are, or come back to town.",
      true,
    ),
    paragraph(`Seed ${options.seed}.`, true),
    button("Enter the dungeon", options.onEnter, true),
  );
  screen.append(enter);
  return { close: () => screen.remove() };
}

export interface LevelOverOptions {
  container: HTMLElement;
  run: DelveRun;
  record: LevelRecord;
  /** False when nobody is standing. */
  canGoDeeper: boolean;
  /** A line about the next level, for the choice. */
  nextLevelText: string;
  onDeeper: () => void;
  onTown: () => void;
}

/** A level ended. Go deeper, or go back to town. */
export function openLevelOverScreen(options: LevelOverOptions): Screen {
  const { record } = options;
  const title =
    record.reason === "cleared"
      ? `Depth ${record.depth} cleared`
      : record.reason === "wiped"
        ? `The party fell at depth ${record.depth}`
        : `Depth ${record.depth}: time ran out`;
  const screen = screenBox(options.container, title);
  screen.append(paragraph(levelLine(record)));

  const party = group("The party");
  party.append(partyList(options.run.party));
  screen.append(party);

  const next = group(options.canGoDeeper ? "What next?" : "The run is over");
  if (options.canGoDeeper) {
    next.append(
      paragraph(
        `${options.nextLevelText} The party goes as it is: no healing, and a fallen member stays down.`,
        true,
      ),
    );
  }
  const buttons = document.createElement("div");
  buttons.className = "menu-styles";
  if (options.canGoDeeper) buttons.append(button("Venture deeper", options.onDeeper, true));
  buttons.append(button("Return to town", options.onTown, !options.canGoDeeper));
  next.append(buttons);
  screen.append(next);
  return { close: () => screen.remove() };
}
