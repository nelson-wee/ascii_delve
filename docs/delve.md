# ASCII Delve — The build as it is

This document describes the game as it is built now. `docs/roadmap.md` gives
the plan, and `docs/design.md` gives the design note of each milestone.

ASCII Delve is a fork of `ascii_tournament`. It keeps the engine of the
tournament (arena generators, utility AI, combat, display) and changes the game
on top of it. `docs/archive/dev-guide.md` is the design of that engine. Its
sections are still correct for the systems that the delve did not change.

## 1. The game loop

1. The player is at the **base**. The base is the start screen and the hub. The
   marines (Kade, Moss, Reyes) are at full health there. The player equips them
   from the stash (Section 10).
2. The player selects **Deploy**. A new **delve** starts at depth 1, with the
   marines as their loadouts make them.
3. The game builds a generated arena with packs of hostiles.
4. The squad acts on its own AI. The player does not control a bot. The level
   ends when all hostiles are dead (**cleared**) or all marines are down
   (**wiped**). A clear puts loot in the **pack** of the squad.
5. The **level over** screen shows the squad and the pack. The player selects
   one:
   - **Push deeper.** The game builds the next depth. The squad keeps its
     health, armour, weapons and ammo. A fallen marine stays down.
   - **Return to base.** The delve ends. The pack goes into the stash. The base
     heals every marine, raises the fallen, and refills the ammo.
6. After a wipe, the only choice is **Return to base**, and the pack is lost.
   Equipped items are never lost.

## 2. Teams

The engine has two teams, `A` and `B`. The delve uses them as they are until
M1 (factions):

| Team | Delve meaning | Bots |
|---|---|---|
| `A` | The squad | 3 marines |
| `B` | The hostiles | Any number, in packs |

## 3. What the delve changed in the engine

| Change | Where |
|---|---|
| Each bot has its own `healthMax`, `label`, `takesPickups`. | `sim/state.ts` |
| `createSimState` takes a `roster`: a list of `BotSpec` per team. A team with a roster can hold any number of bots, and each bot can carry state in from the last level (`BotCarry`). | `sim/state.ts` |
| `SimConfig.respawn`: a dead bot stays dead when it is `false`. | `sim/round.ts` |
| `SimConfig.endRule`: `clear` ends a level on a clear or a wipe, with the time limit as a safety limit. | `sim/round.ts` |
| `SimState.explored`: the cells that a team has seen. | `sim/round.ts` |
| A new action, **Explore**: walk to the nearest cell that the team has not seen. When the team has seen everything, walk to the nearest living enemy. | `ai/utility.ts` |

The tournament round (two teams of three, a score limit, respawns) still works
in the engine, and its engine tests still pass. M0 removed the tournament's
own code: the PvP batch, tickets, sessions, the match runner and the PvP
reports.

## 4. The modules of the delve

| File | Purpose |
|---|---|
| `data/delve.json` | The marines, the hostiles, the squad and hostile weights, the level numbers, the rewards and the gear. |
| `src/delve/mobs.ts` | A hostile weapon (the baseline weapon with the hostile's fields over it) and a hostile `BotSpec`. |
| `src/delve/level.ts` | Build a level: arena, spawn table, and hostile packs. The level config. |
| `src/delve/run.ts` | A delve: the squad between levels, `finishLevel`, `canGoDeeper`, `returnToBase`. |
| `src/delve/items.ts` | Items, slots, item rolls, and the score of an item for a role. |
| `src/delve/roster.ts` | The marines, their loadouts, the stash: `equip`, `autoEquip`, `discard`. |
| `src/delve/save.ts` | The roster as JSON text with a `schemaVersion`, and back. |
| `src/delve/batch.ts` | Run delves and campaigns with no display. |
| `src/cli/delve.ts` | `npm run delve`: the table of depth against result. |
| `src/ui/screens.ts` | The base screen (with the slots and the stash) and the level-over screen. |
| `src/ui/saveStore.ts` | The browser keeps the save in `localStorage`. |
| `scripts/smoke.mjs` | `npm run smoke`: one short session in a headless browser. |

## 5. The marines

A marine names a role of `data/roles.json`. The role gives the tactics and the
behaviour weights until the AI implants of M2. `squadBehavior` in
`data/delve.json` then changes the weights for every marine.

| Marine | Role | Health | Speed |
|---|---|---|---|
| Kade | tank | 150 | 1.0 |
| Moss | skirmisher | 100 | 1.15 |
| Reyes | overwatch | 80 | 1.0 |

The different health and speed are placeholders. M2 gives every marine the same
base body (D1 in the roadmap).

Each marine starts with the baseline rifle and one generated weapon in its
`weapon1` slot: the weapon that its role ranks highest, and a different one for
each marine. Weapon points in a level give more weapons. Ammo pickups refill
them. Ammo carries over to the next level, so ammo is a resource of the delve.

`squadBehavior` lowers `holdPosition` and `takePosition` and raises `chase` and
`explore`. A tournament role holds ground because the clock makes the other
team come to it. Hostiles wait, so the squad must go to them. Without this
change, a marine and a hostile pack stood just out of range of each other until
the time limit.

## 6. Hostiles

A kind of hostile names a role, a health value, a speed, and a weapon.
`hostileBehavior` and `hostileTactics` then make every hostile wait where it
stands, take no items, chase a marine that it sees, and join a fight that its
pack is in (the `Support` action).

| Hostile | Role | Health | Weapon |
|---|---|---|---|
| Crawler | tank | 80 | Mandibles: melee, 9 damage |
| Gunner | overwatch | 55 | Needle Rifle: projectile, 8 damage, range 18 |
| Juggernaut | tank | 170 | Shock Maul: melee cone, 18 damage |

These are placeholders until the enemy families of M5. Each depth after the
first adds 15 % to hostile health and 10 % to hostile damage.

## 7. Levels

- The style of a level cycles: bastion, cavern, openfield.
- The squad starts on the first spawn group of the arena.
- A pack centre is a floor cell at least 35 % of the longest walk from the
  squad, and at least 8 steps from every other centre. Pack members take the
  nearest free floor cells.
- Packs: `floor(2 + 0.5 × (depth − 1))`, to a maximum of 7. Two or three
  hostiles a pack.
- One delve seed gives every level of the delve.

## 8. Measurement

`npm run delve -- --runs 60 --depth 12` gave this table before the reskin. M0
changed names only, and a 20-run batch gives the same numbers before and after
it, row for row.

```
 depth  reached  cleared   wiped    time     mean s   hostiles
     1       60       57       2       1       28.2      5.0
     2       58       57       1       0       18.1      5.0
     3       57       54       3       0       20.5      7.2
     4       54       48       6       0       28.4      7.7
     5       48       14      34       0       19.7     10.4
     6       14        6       8       0       23.2      9.6
     7        6        0       6       0       15.7     12.2

deepest level cleared: mean 3.95, median 4, best 6
```

The batch always goes deeper. A player who returns to base at the right time
does better than this table.

## 9. Known issues

1. **Depth 5 is a wall for a fresh squad.** 48 squads reach it and 14 clear
   it. The base loop is the answer of Section 10: a squad that banks loot and
   equips it clears about 5 levels after 10 delves.
2. **One level in about 300 hits the time limit.** The cause is not known yet.
   The level-over screen handles it: the player can push deeper or go to base.
3. **Hostiles can stand on the same cell.** A teammate does not block movement
   in the engine, so a pack that chases can stack.
4. **The base has no shop.** Items come only from clears and weapon points.
   There are no credits, no shop, and no repair until M3.

## 10. The base and the inventory

### 10.1 What lasts

The **roster** lasts between delves, and the browser saves it. It holds the
marines, the loadout of each marine, the stash, and the count of delves. A
delve in progress is not saved: a level is short, and it replays from its seed.

Three keys of the save keep their old names until the save version 2 of M3:
`heroes` (the marines), `classId` (the template of a marine), and `trinket`
(the module slot).

### 10.2 Slots and items

Each marine has four slots:

| Slot | Takes | Effect |
|---|---|---|
| Weapon 1, Weapon 2 | A generated weapon | The bot holds it. The AI chooses the weapon to fire from the DPS profile. The baseline rifle is always held as the fallback. |
| Armour | Armour (Flak Vest, Ceramic Plates, Hardsuit) | Bonuses: more health; heavy armour also has a speed penalty. |
| Module | A module (Targeting Module, Servo Module, Bio-Regulator) | Bonuses: accuracy, speed, or health. |

These slots are placeholders. M2 gives the four slots of the roadmap: weapon,
armour, AI implant, gear.

`marineStats` adds the bonuses to the marine's values. The base screen shows
the result for each marine.

An item has a uid. A weapon item takes the uid as its weapon id, because the
ammo of a bot is kept by weapon id, and two weapons must never share one.

### 10.3 Where items come from

- **A clear** rolls `rewards.itemsPerClear` items into the pack, plus one more
  on every third depth. The kind comes from `rewards.kindWeights`.
  - A weapon is a generated weapon. Its tier weights get better with depth
    (`rewards.weaponTiers`).
  - Armour and modules come from `gear`. Each depth adds 12 % to their quality,
    ±20 %. A bonus grows with the quality; a penalty does not. The name says
    the quality: Salvaged, (none), Refined, Prototype.
- **Weapon points** in a level give weapons, as in the tournament. A weapon
  that a marine picked up is loot too, one copy of each.

The loot of a delve is a function of the roster seed, the delve number and the
depth, so a delve replays.

### 10.4 The return to base

`returnToBase(roster, delve)`:

1. When a marine is still standing, the pack and the picked-up weapons go into
   the stash, each with a new uid.
2. After a wipe, they are lost. Equipped items stay.
3. The next delve starts every marine at full health, with full ammo, from the
   loadout. This is the healing of the base.

### 10.5 The base screen

- **The squad:** one card per marine, with its stats and its four slots.
- **A slot:** select it to list the stash items that fit it, best first. Each
  item shows its value to this marine against the item in the slot now. Select
  an item to equip it; the old item goes back to the stash. **Empty this slot**
  puts the item back in the stash.
- **The stash:** every item with what it does. **Discard** throws one away.
- **Auto-equip the best items:** each marine takes the best items for its role,
  one slot kind at a time, so every marine gets armour before any marine gets a
  second good weapon.
- **Start over:** a new roster. It asks first.

### 10.6 Measurement

`npm run delve -- --runs 12 --campaign 10 --depth 12`: 12 rosters play 10
delves each. A squad goes back to base when a marine is down or under half
health, and equips the best of its stash after each delve.

```
 delve    deepest    wiped   banked     health
     1       1.50        1      4.3        110
     2       2.83        0      6.3        118
     3       2.92        0      7.0        136
     4       3.08        0      7.3        154
     5       2.25        0      5.4        157
     6       3.42        1      6.7        158
     7       3.08        0      6.9        162
     8       3.42        0      7.3        163
     9       3.42        0      7.5        167
    10       2.67        2      4.9        170

probe (full health, always deeper, nothing banked): a fresh roster clears 3.25
levels, the same roster after 10 delves clears 5.00
```

The "deepest" column measures the cautious policy more than the squad: it goes
back at the first hurt marine. The probe measures the squad. The gear raises
the mean health of a marine from 110 to 170 and the depth that it clears from
3.25 to 5.00.
