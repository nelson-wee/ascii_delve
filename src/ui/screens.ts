/**
 * The screens of a delve (docs/delve.md). Browser only.
 *
 * - **Base.** The start screen and the hub. The marines rest here, and the
 *   player moves items between the stash and their slots.
 * - **Level over.** A level ended. The player chooses: push deeper with the
 *   squad as it is, or go back to base.
 */
import { describeItem, itemScore, slotKind, SLOT_NAMES, SLOTS, type Item, type Slot } from "../delve/items.js";
import { levelConfig } from "../delve/level.js";
import { marineStats, sortedStash, type DelveSummary, type Marine, type Roster } from "../delve/roster.js";
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
        ? "the squad was wiped"
        : "time ran out";
  return `Depth ${record.depth}: ${how}, ${record.mobsKilled}/${record.mobs} hostiles, ${record.partyAlive}/3 standing.`;
}

export interface BaseOptions {
  container: HTMLElement;
  roster: Roster;
  seed: number;
  /** Move an item from the stash into a slot, or empty the slot (`null`). */
  onEquip: (marineIndex: number, slot: Slot, uid: string | null) => void;
  onAutoEquip: () => void;
  onDiscard: (uid: string) => void;
  onEnter: () => void;
  /** Throw the roster away and start again with a new one. */
  onReset: () => void;
}

/** One item, as a name and a dim line that says what it does. */
function itemLabel(element: HTMLElement, item: Item | undefined, empty: string): void {
  const name = document.createElement("b");
  name.textContent = item ? item.name : empty;
  const what = document.createElement("span");
  what.className = "dim";
  what.textContent = item ? describeItem(item) : "";
  element.append(name, what);
}

/** The stats of a marine with its gear on, in one line. */
function statsLine(marine: Marine): string {
  const stats = marineStats(marine);
  return `${Math.round(stats.healthMax)} health · speed ${stats.moveSpeedScale.toFixed(2)}× · accuracy ${Math.round(stats.accuracy * 100)}% · ${marine.role}`;
}

/** The last delve, in a few lines. */
function lastDelveGroup(summary: DelveSummary): HTMLElement {
  const report = group(`The last delve (number ${summary.delveNumber})`);
  for (const record of summary.levels) report.append(paragraph(levelLine(record)));
  if (summary.wiped) {
    report.append(
      paragraph(
        summary.lost.length > 0
          ? `The squad was wiped. Lost with the pack: ${summary.lost.join(", ")}.`
          : "The squad was wiped. The pack was empty.",
        true,
      ),
    );
  } else {
    report.append(
      paragraph(
        summary.banked.length > 0
          ? `Put in the stash: ${summary.banked.join(", ")}.`
          : "The squad found nothing to keep.",
        true,
      ),
    );
  }
  return report;
}

/**
 * The base: the marines, their slots, and the stash.
 *
 * The party is always healed here. Select a slot to see the stash items that
 * fit it; select one to equip it. The item that was in the slot goes back to
 * the stash.
 */
export function openBaseScreen(options: BaseOptions): Screen {
  const { roster } = options;
  const screen = screenBox(options.container, "ASCII Delve · Base");
  const body = document.createElement("div");
  body.className = "base-hub";
  screen.append(body);
  /** The slot whose choices are open, if any. */
  let open: { marine: number; slot: Slot } | null = null;

  const render = (): void => {
    body.replaceChildren();
    body.append(
      paragraph(
        "The squad rests at base: every marine is at full health, the fallen are back on their feet, and the ammo is full. Equip the marines from the stash, then deploy.",
        true,
      ),
    );
    if (roster.lastDelve) body.append(lastDelveGroup(roster.lastDelve));
    if (roster.bestDepth > 0) {
      body.append(paragraph(`Delves: ${roster.delves}. Deepest level cleared: ${roster.bestDepth}.`, true));
    }

    const party = group("The squad");
    for (const [marineIndex, marine] of roster.heroes.entries()) {
      const card = document.createElement("div");
      card.className = "marine";
      const head = document.createElement("div");
      head.className = "marine-head";
      const name = document.createElement("b");
      name.textContent = marine.name;
      const stats = document.createElement("span");
      stats.className = "dim";
      stats.textContent = statsLine(marine);
      head.append(name, stats);
      card.append(head);

      const slots = document.createElement("div");
      slots.className = "slots";
      for (const slot of SLOTS) {
        const item = marine.loadout[slot];
        const isOpen = open?.marine === marineIndex && open.slot === slot;
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = isOpen ? "choice slot open" : "choice slot";
        choice.setAttribute("aria-expanded", String(isOpen));
        const label = document.createElement("span");
        label.className = "slot-name";
        label.textContent = SLOT_NAMES[slot];
        choice.append(label);
        itemLabel(choice, item, "empty");
        choice.addEventListener("click", () => {
          open = isOpen ? null : { marine: marineIndex, slot };
          render();
        });
        slots.append(choice);
      }
      card.append(slots);

      if (open?.marine === marineIndex) {
        const { slot } = open;
        const picker = document.createElement("div");
        picker.className = "picker";
        const fits = sortedStash(roster).filter((item) => item.kind === slotKind(slot));
        const current = marine.loadout[slot];
        const currentScore = current ? itemScore(current, marine.role, levelConfig()) : 0;
        picker.append(
          paragraph(
            fits.length > 0
              ? `${SLOT_NAMES[slot]} of ${marine.name}: select an item from the stash.`
              : `The stash has nothing for this slot.`,
            true,
          ),
        );
        for (const item of fits) {
          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "choice slot";
          const delta = itemScore(item, marine.role, levelConfig()) - currentScore;
          const tag = document.createElement("span");
          tag.className = delta >= 0 ? "slot-name better" : "slot-name worse";
          tag.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))}`;
          tag.title = "The value of this item to this marine, against the item in the slot now.";
          pick.append(tag);
          itemLabel(pick, item, "");
          pick.addEventListener("click", () => {
            options.onEquip(marineIndex, slot, item.uid);
            open = null;
            render();
          });
          picker.append(pick);
        }
        const actions = document.createElement("div");
        actions.className = "menu-styles";
        if (current) {
          actions.append(
            button("Empty this slot", () => {
              options.onEquip(marineIndex, slot, null);
              open = null;
              render();
            }),
          );
        }
        actions.append(
          button("Close", () => {
            open = null;
            render();
          }),
        );
        picker.append(actions);
        card.append(picker);
      }
      party.append(card);
    }
    body.append(party);

    const stash = group(`The stash (${roster.stash.length})`);
    if (roster.stash.length === 0) {
      stash.append(paragraph("Empty. A clear puts loot in the pack of the squad, and a return to base puts it here.", true));
    } else {
      const list = document.createElement("ul");
      list.className = "stash";
      for (const item of sortedStash(roster)) {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.className = "stash-item";
        itemLabel(label, item, "");
        const drop = button("Discard", () => {
          options.onDiscard(item.uid);
          render();
        });
        drop.classList.add("small");
        row.append(label, drop);
        list.append(row);
      }
      stash.append(list);
    }
    body.append(stash);

    const go = group("Deployment");
    go.append(
      paragraph(
        "Every deployment starts at depth 1, on new maps. A clear puts loot in the pack. Push deeper as you are, or come back to keep the loot. A wipe loses the pack; equipped items are never lost.",
        true,
      ),
    );
    const buttons = document.createElement("div");
    buttons.className = "menu-styles";
    buttons.append(
      button("Deploy", options.onEnter, true),
      button("Auto-equip the best items", () => {
        options.onAutoEquip();
        open = null;
        render();
      }),
      button("Start over", () => {
        if (window.confirm("Start over with a new squad? The marines, their items and the stash will be lost.")) {
          options.onReset();
        }
      }),
    );
    go.append(buttons, paragraph(`Seed ${options.seed}.`, true));
    body.append(go);
  };

  render();
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
  onBase: () => void;
}

/** A level ended. Push deeper, or go back to base. */
export function openLevelOverScreen(options: LevelOverOptions): Screen {
  const { record } = options;
  const title =
    record.reason === "cleared"
      ? `Depth ${record.depth} cleared`
      : record.reason === "wiped"
        ? `The squad was wiped at depth ${record.depth}`
        : `Depth ${record.depth}: time ran out`;
  const screen = screenBox(options.container, title);
  screen.append(paragraph(levelLine(record)));

  const party = group("The squad");
  party.append(partyList(options.run.party));
  screen.append(party);

  const pack = group("The pack");
  const loot = options.run.pack.map((item) => item.name);
  pack.append(
    paragraph(
      record.loot.length > 0 ? `This clear found: ${record.loot.join(", ")}.` : "This level gave no loot.",
    ),
    paragraph(
      loot.length === 0
        ? "The pack is empty."
        : options.canGoDeeper
          ? `In the pack: ${loot.join(", ")}. A return to base keeps it. A wipe loses it.`
          : `Lost with the pack: ${loot.join(", ")}. Equipped items are safe.`,
      true,
    ),
  );
  screen.append(pack);

  const next = group(options.canGoDeeper ? "What next?" : "The run is over");
  if (options.canGoDeeper) {
    next.append(
      paragraph(
        `${options.nextLevelText} The squad goes as it is: no healing, and a fallen marine stays down. The base heals everyone.`,
        true,
      ),
    );
  }
  const buttons = document.createElement("div");
  buttons.className = "menu-styles";
  if (options.canGoDeeper) buttons.append(button("Push deeper", options.onDeeper, true));
  buttons.append(button("Return to base", options.onBase, !options.canGoDeeper));
  next.append(buttons);
  screen.append(next);
  return { close: () => screen.remove() };
}
