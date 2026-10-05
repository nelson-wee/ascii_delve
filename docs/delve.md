# ASCII Delve — Design of the first version

This document gives the design of the first version of ASCII Delve. ASCII Delve
is a fork of `ascii_tournament`. It keeps the engine of the tournament (arena
generators, utility AI, combat, display) and changes the game on top of it.

`docs/dev-guide.md` is the design of the engine. Its sections are still correct
for the systems that the delve did not change. Read this document first, then
the dev guide for a system.

## 1. The game loop

1. The player is in **town**. Town is the start screen.
2. The player selects **Enter the dungeon**. The game makes a new run: a new
   party (fighter, thief, wizard) at full health, and a new weapon set.
3. The game builds **depth 1**: a generated arena with packs of mobs.
4. The party acts on its own AI. The player does not control a bot. The level
   ends when all mobs are dead (**cleared**) or all party members are dead
   (**wiped**).
5. The **level over** screen shows the party. The player selects one:
   - **Venture deeper.** The game builds the next depth. The party keeps its
     health, armour, weapons and ammo. A fallen member stays down.
   - **Return to town.** The run ends. Town shows the result.
6. After a wipe, the only choice is **Return to town**.

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
| `src/delve/run.ts` | A run: the party between levels, `finishLevel`, `canGoDeeper`. |
| `src/delve/batch.ts` | Run delves with no display. |
| `src/cli/delve.ts` | `npm run delve`: the table of depth against result. |
| `src/ui/screens.ts` | The town screen and the level-over screen. |

## 5. Classes

A class names a role of `data/roles.json`. The role gives the tactics and the
behaviour weights. `partyBehavior` in `data/delve.json` then changes the
weights for every party member.

| Class | Role | Health | Speed |
|---|---|---|---|
| Fighter | tank | 150 | 1.0 |
| Thief | skirmisher | 100 | 1.15 |
| Wizard | overwatch | 80 | 1.0 |

Each class starts with the baseline rifle and one generated weapon of the run:
the weapon that its role ranks highest, and a different one for each class.
Weapon points in a level give more weapons. Ammo pickups refill them. Ammo
carries over to the next level, so ammo is a resource of the run.

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

1. **Depth 5 is a wall.** 48 parties reach it and 14 clear it. The pack count
   goes from 3 to 4 at depth 5, and the party has no way to heal between levels.
   This is a tuning question for the next version (healing in town, a rest
   between levels, or a smoother pack curve).
2. **One level in about 300 hits the time limit.** The cause is not known yet.
   The level-over screen handles it: the player can go deeper or go to town.
3. **Mobs can stand on the same cell.** A teammate does not block movement in
   the engine, so a pack that chases can stack.
4. **Town is only a menu.** A run ends in town. There is no shop, no healing,
   and no gear between runs.
5. **The tournament code is still in the repository.** The batch harness,
   tickets, sessions and reports of the tournament still work and still have
   tests. Remove them when the delve no longer needs them as a reference.

## 10. Next steps

These are the steps of the scoping discussion, in order:

1. Change `TeamId` to factions, and remove the symmetry code.
2. Split `BotState`. Change `Weapon` into an `Ability` that equipment gives.
3. Town: healing, a shop, and gear that stays between runs.
4. An item generator (from the weapon power budget), and loot drops.
5. Bosses.
