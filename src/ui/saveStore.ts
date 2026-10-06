/**
 * The browser keeps the save of the roster (docs/delve.md, Section 10).
 *
 * Every access is wrapped: a private window, a full store, or a blocked store
 * must not stop the game. Without a store the game still runs; it only forgets
 * the roster when the page closes.
 */
import { loadRoster, saveRoster } from "../delve/save.js";
import type { Roster } from "../delve/roster.js";

const KEY = "ascii-delve:roster";

export function readRoster(): Roster | null {
  try {
    const text = window.localStorage.getItem(KEY);
    return text === null ? null : loadRoster(text);
  } catch {
    return null;
  }
}

export function writeRoster(roster: Roster): void {
  try {
    window.localStorage.setItem(KEY, saveRoster(roster));
  } catch {
    // The store is blocked or full. The roster lives on in this page.
  }
}

export function clearRoster(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
