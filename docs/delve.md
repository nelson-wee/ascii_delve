# ASCII Delve — Design of the first version

This document gives the design of the first version of ASCII Delve. ASCII Delve
is a fork of `ascii_tournament`. It keeps the engine of the tournament (arena
generators, utility AI, combat, display) and changes the game on top of it.

`docs/dev-guide.md` is the design of the engine. Its sections are still correct
for the systems that the delve did not change. Read this document first, then
the dev guide for a system.

## 1. The game loop

1. The player is in **town**. Town is the start screen and the hub. The heroes
   (fighter, thief, wizard) are at full health there. The player equips them
   from the stash (Section 10).
2. The player selects **Enter the dungeon**. A new **delve** starts at depth 1,
   with the heroes as their loadouts make them.
3. The game builds a generated arena with packs of mobs.
4. The party acts on its own AI. The player does not control a bot. The level
   ends when all mobs are dead (**cleared**) or all party members are dead
   (**wiped**). A clear puts loot in the **pack** of the party.
5. The **level over** screen shows the party and the pack. The player selects
   one:
   - **Venture deeper.** The game builds the next depth. The party keeps its
     health, armour, weapons and ammo. A fallen member stays down.
   - **Return to town.** The delve ends. The pack goes into the stash. Town
     heals every hero, raises the fallen, and refills the ammo.
6. After a wipe, the only choice is **Return to town**, and the pack is lost.
   Equipped items are never lost.

## 2. Teams

The engine has two teams, `A` and `B`. The delve uses them as they are:

| Team | Delve meaning | Bots |
|---|---|---|
| `A` | The party | 3, one per class |
| `B` | The mobs | Any number, in packs |

A later version can change `TeamId` to a faction id. This version does not.

## 3. What changed in the engine

All changes are off for a tournament round. The 655 tests of the tournament
still pass.

| Change | Where | Tournament value |
|---|---|---|
| Each bot has its own `healthMax`, `label`, `takesPickups`. | `sim/state.ts` | The global `healthMax`, the role, `true`. |
| `createSimState` takes a `roster`: a list of `BotSpec` per team. A team with a roster can hold any number of bots, and each bot can carry state in from the last level (`BotCarry`). | `sim/state.ts` | No roster. |
| `SimConfig.respawn`: a dead bot stays dead when it is `false`. | `sim/round.ts` | `true` |
| `SimConfig.endRule`: `clear` ends a level on a clear or a wipe, with the time limit as a safety limit. | `sim/round.ts` | `score` |
| `SimState.explored`: the cells that a team has seen. | `sim/round.ts` | Empty. |
| A new action, **Explore**: walk to the nearest cell that the team has not seen. When the team has seen everything, walk to the nearest living enemy. | `ai/utility.ts` | Not scored. |

## 4. The new modules

| File | Purpose |
|---|---|
| `data/delve.json` | The classes, the mobs, the party and mob weights, and the level numbers. |
| `src/delve/mobs.ts` | A mob weapon (the baseline weapon with the mob fields over it) and a mob `BotSpec`. |
| `src/delve/level.ts` | Build a level: arena, spawn table, and mob packs. The level config. |
| `src/delve/run.ts` | A delve: the party between levels, `finishLevel`, `canGoDeeper`, `returnToTown`. |
| `src/delve/items.ts` | Items, slots, item rolls, and the score of an item for a role. |
| `src/delve/roster.ts` | The heroes, their loadouts, the stash: `equip`, `autoEquip`, `discard`. |
| `src/delve/save.ts` | The roster as JSON text with a `schemaVersion`, and back. |
| `src/ui/saveStore.ts` | The browser keeps the save in `localStorage`. |
| `src/delve/batch.ts` | Run delves with no display. |
| `src/cli/delve.ts` | `npm run delve`: the table of depth against result. |
| `src/ui/screens.ts` | The town screen (with the slots and the stash) and the level-over screen. |

## 5. Classes

A class names a role of `data/roles.json`. The role gives the tactics and the
behaviour weights. `partyBehavior` in `data/delve.json` then changes the
weights for every party member.

| Class | Role | Health | Speed |
|---|---|---|---|
| Fighter | tank | 150 | 1.0 |
| Thief | skirmisher | 100 | 1.15 |
| Wizard | overwatch | 80 | 1.0 |

Each class starts with the baseline rifle and one generated weapon in its
`weapon1` slot: the weapon that its role ranks highest, and a different one for
each class. Weapon points in a level give more weapons. Ammo pickups refill
them. Ammo carries over to the next level, so ammo is a resource of the delve.

`partyBehavior` lowers `holdPosition` and `takePosition` and raises `chase` and
`explore`. A tournament role holds ground because the clock makes the other
team come to it. Mobs wait, so the party must go to them. Without this change,
a party member and a mob pack stood just out of range of each other until the
time limit.

## 6. Mobs

A mob kind names a role, a health value, a speed, and a weapon. `mobBehavior`
and `mobTactics` then make every mob wait where it stands, take no items, chase
a party member that it sees, and join a fight that its pack is in (the
`Support` action).

| Mob | Role | Health | Weapon |
|---|---|---|---|
| Grunt | tank | 80 | Claws: melee, 9 damage |
| Archer | overwatch | 55 | Shortbow: projectile, 8 damage, range 18 |
| Brute | tank | 170 | Cleaver: melee cone, 18 damage |

Each depth after the first adds 15 % to mob health and 10 % to mob damage.

## 7. Levels

- The style of a level cycles: bastion, cavern, openfield.
- The party starts on the first spawn group of the arena.
- A pack centre is a floor cell at least 35 % of the longest walk from the
  party, and at least 8 steps from every other centre. Pack members take the
  nearest free floor cells.
- Packs: `floor(2 + 0.5 × (depth − 1))`, to a maximum of 7. Two or three mobs a
  pack.
- One run seed gives every level of the run.

## 8. Measurement

`npm run delve -- --runs 60 --depth 12` gives this table with the numbers of
this version:

```
 depth  reached  cleared   wiped    time     mean s    mobs
     1       60       57       2       1       28.2     5.0
     2       58       57       1       0       18.1     5.0
     3       57       54       3       0       20.5     7.2
     4       54       48       6       0       28.4     7.7
     5       48       14      34       0       19.7    10.4
     6       14        6       8       0       23.2     9.6
     7        6        0       6       0       15.7    12.2

deepest level cleared: mean 3.95, median 4, best 6
```

The batch always goes deeper. A player who returns to town at the right time
does better than this table.

## 9. Known issues

1. **Depth 5 is a wall for a fresh party.** 48 parties reach it and 14 clear
   it. The town loop is the answer of Section 10: a party that banks loot and
   equips it clears about 5 levels after 10 delves.
2. **One level in about 300 hits the time limit.** The cause is not known yet.
   The level-over screen handles it: the player can go deeper or go to town.
3. **Mobs can stand on the same cell.** A teammate does not block movement in
   the engine, so a pack that chases can stack.
4. **Town has no shop.** Items come only from clears and weapon points. There
   is no gold, no shop, and no repair.
5. **The tournament code is still in the repository.** The batch harness,
   tickets, sessions and reports of the tournament still work and still have
   tests. Remove them when the delve no longer needs them as a reference.

## 10. The town and the inventory

### 10.1 What lasts

The **roster** lasts between delves, and the browser saves it. It holds the
heroes, the loadout of each hero, the stash, and the count of delves. A delve
in progress is not saved: a level is short, and it replays from its seed.

### 10.2 Slots and items

Each hero has four slots:

| Slot | Takes | Effect |
|---|---|---|
| Weapon 1, Weapon 2 | A generated weapon | The bot holds it. The AI chooses the weapon to fire from the DPS profile, as before. The baseline rifle is always held as the fallback. |
| Armour | Armour | Bonuses: more health; heavy armour also has a speed penalty. |
| Trinket | A trinket | Bonuses: accuracy, speed, or health. |

`heroStats` adds the bonuses to the class values. The town screen shows the
result for each hero.

An item has a uid. A weapon item takes the uid as its weapon id, because the
ammo of a bot is kept by weapon id, and two weapons must never share one.

### 10.3 Where items come from

- **A clear** rolls `rewards.itemsPerClear` items into the pack, plus one more
  on every third depth. The kind comes from `rewards.kindWeights`.
  - A weapon is a generated weapon. Its tier weights get better with depth
    (`rewards.weaponTiers`).
  - Armour and trinkets come from `gear`. Each depth adds 12 % to their
    quality, ±20 %. A bonus grows with the quality; a penalty does not. The
    name says the quality: Worn, (none), Fine, Masterwork.
- **Weapon points** in a level give weapons, as in the tournament. A weapon
  that a hero picked up is loot too, one copy of each.

The loot of a delve is a function of the roster seed, the delve number and the
depth, so a delve replays.

### 10.4 The return to town

`returnToTown(roster, delve)`:

1. When a hero is still standing, the pack and the picked-up weapons go into the
   stash, each with a new uid.
2. After a wipe, they are lost. Equipped items stay.
3. The next delve starts every hero at full health, with full ammo, from the
   loadout. This is the healing of the town.

### 10.5 The town screen

- **The party:** one card per hero, with its stats and its four slots.
- **A slot:** select it to list the stash items that fit it, best first. Each
  item shows its value to this hero against the item in the slot now. Select
  an item to equip it; the old item goes back to the stash. **Empty this slot**
  puts the item back in the stash.
- **The stash:** every item with what it does. **Discard** throws one away.
- **Auto-equip the best items:** each hero takes the best items for its role,
  one slot kind at a time, so every hero gets armour before any hero gets a
  second good weapon.
- **Start over:** a new roster. It asks first.

### 10.6 Measurement

`npm run delve -- --runs 12 --campaign 10 --depth 12`: 12 rosters play 10
delves each. A party goes back to town when a hero is down or under half health,
and equips the best of its stash after each delve.

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

The "deepest" column measures the cautious policy more than the party: it goes
back at the first hurt hero. The probe measures the party. The gear raises the
mean health of a hero from 110 to 170 and the depth that it clears from 3.25 to
5.00.

### 10.7 Open questions

1. **Every delve starts at depth 1.** A geared party walks through depths 1
   to 3. A waypoint (start at a depth already cleared) would cut that walk.
2. **Weapons stop at the prize tier.** Mobs get stronger at every depth, and a
   weapon does not, so the gear curve flattens. The armour quality does grow.
3. **The stash grows fast.** Weapon points give 3 to 5 weapons a delve.
   Discard keeps it short; a sell price would give a reason to discard.
4. **No class limits.** Any hero can equip any item.

## 11. Next steps

These are the steps of the scoping discussion, in order:

1. Change `TeamId` to factions, and remove the symmetry code.
2. Split `BotState`. Change `Weapon` into an `Ability` that equipment gives.
3. A shop, gold, and a waypoint to start a delve deeper.
4. Loot drops from mobs, and class limits on items.
5. Bosses.
