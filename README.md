# ASCII Delve

A party of three bots — a fighter, a thief and a wizard — goes down into a
dungeon. The bots act on their own AI. The player does not control a bot. The
player decides when the party goes deeper and when it comes back to town.

ASCII Delve is a fork of
[`ascii_tournament`](https://github.com/nelson-wee/ascii_tournament), an ASCII
team shooter with indirect control. It keeps the engine of the tournament: the
arena generators, the utility AI, the combat, and the neon ASCII display.

[`docs/delve.md`](docs/delve.md) gives the design of the delve: the game loop,
what changed in the engine, the classes, the mobs, the levels, the measurements,
and the known issues. [`docs/dev-guide.md`](docs/dev-guide.md) is the design of
the engine, written for the tournament.

## Status

**The town and the inventory.** The game loop works in the browser:

1. In town, equip the heroes from the stash. Each hero has two weapon slots,
   an armour slot and a trinket slot.
2. Select **Enter the dungeon**. The party explores a generated level and
   fights the packs of mobs. A clear puts loot in the pack.
3. When the level ends, select **Venture deeper** (the party keeps its health,
   armour, weapons and ammo) or **Return to town** (the pack goes into the
   stash, and town heals everyone). A wipe loses the pack. Equipped items are
   never lost.

The browser saves the roster, so a refresh keeps the heroes and the stash.
After 10 delves with town visits, a party clears about 5 levels, where a fresh
party clears about 3 (`docs/delve.md`, Section 10.6).

## The delve harness

`npm run delve` runs delves with no display. Every delve goes deeper while a
party member is standing.

```
npm run delve                                # 40 delves, to depth 10
npm run delve -- --runs 100 --depth 15 --seed 7
npm run delve -- --runs 12 --campaign 10     # 10 delves per roster, with town
```

It prints, for each depth, how many parties reached it, how many cleared it,
how many were wiped, how many hit the time limit, the mean time of a level, and
the mean number of mobs. Then it prints the deepest level cleared and the depth
at which each class fell.

`data/delve.json` holds the numbers: the classes, the mobs, the weights that
make a party and a mob, and the level curve.

## Commands

| Command | Action |
|---|---|
| `npm install` | Install the dependencies. |
| `npm run dev` | Start the development server. |
| `npm run build` | Typecheck and build to `dist/`. |
| `npm run preview` | Serve the build from `dist/`. |
| `npm test` | Run the tests one time. |
| `npm run test:watch` | Run the tests and watch for changes. |
| `npm run typecheck` | Typecheck only. |
| `npm run lint` | Run ESLint. |
| `npm run delve` | Run delves with no display and print how deep the party gets. |
| `npm run batch` | Run the tournament batch harness (see below). |
| `npm run arena` | Print a generated arena and its metrics (see below). |

## Rules for the code

These rules come from Sections 4 and 13 of the dev guide.

1. The simulation and the display are separate. A module in `src/core`,
   `src/arena`, `src/weapons`, `src/sim`, `src/ai`, `src/progression`,
   `src/meta`, `src/names`, `src/report`, or `src/delve` must not import
   `src/render`, `src/ui`, or `src/main.ts`, and must not use a browser API.
2. Headless first. Every system must run in Node with no display.
3. Deterministic. One seed gives one result.
4. Use the RNG streams of `src/core/rng.ts`. Do not use `Math.random()` or the
   global `ROT.RNG` instance.
5. Tunable numbers go in `data/`, not in the code. A placeholder number is
   listed in the `tbd` array of its data file, or marked TBD in its notes.
6. A change to the engine must leave the tournament round as it was, while the
   tournament code is still in the repository. Its tests check this.

The ESLint configuration and the test `tests/boundary.test.ts` check rules 1
and 4 automatically.

## The tournament tools

The tools below come from the tournament. They still work and still have tests.
They are a reference while the delve grows, and a later version removes them.

### The batch harness

`npm run batch` runs rounds with no display and reports the balance.

```
npm run batch                                # data/batch.json, 1000 rounds
npm run batch -- --rounds 200 --seed 7
npm run batch -- --config my-batch.json --out results --quiet
```

It prints a win-rate matrix (tactics preset × arena), the matchup table, a
win rate per role composition with its own matchup table, the round end
reasons, the kills by weapon archetype, the weapon use, and any balance
failure. Every win rate carries its standard error, because a win rate from few
rounds says little (Section 7.2.1 of the dev guide).

`hits per shot` is not a share: one shot of an area weapon hits several bots,
so the number passes 1.

It writes `rounds.csv`, `matchups.csv`, and `presets.csv` into the output
folder. With `--fail-on-balance` the command ends with a non-zero exit code
when it finds a balance failure, so a workflow can use it as a gate.

### Arena generation

`npm run arena` builds an arena and prints it in the glyphs of the map files, so
a generated arena can be read by eye and saved as a hand-made one.

```
npm run arena                                # one of each style
npm run arena -- --style cavern --seed 7
npm run arena -- --style openfield --count 3
npm run arena -- --stats 40                  # metrics over 40 seeds per style
```

| Style | Algorithm | Fight |
|---|---|---|
| `bastion` | a grid of rooms, carved, with corridors and extra doors | closed, 8.4 cells, 57 % close range |
| `cavern` | noise, then a cellular automaton | organic, 10.6 cells |
| `openfield` | an open field with obstacles dropped into it | open, 11.4 cells, 6.3 % long range |

`data/arena-profiles.json` holds the parameters and the rules. A style may
replace a rule, because a closed arena cannot meet the sightline rule of an open
one. Every arena must pass `checkArenaFairness`: a power-up point and one weapon
point on ground that both teams reach together, and every pickup point paired
with the point it faces.

### Arena map files

A file in `data/arenas/` holds one hand-made arena. The file has an optional
header, a line with `---`, and then the map:

```
name: Proving Ground
notes: free text
---
##########
#S..,.^..#
##########
```

| Glyph | Tile |
|---|---|
| `#` | wall |
| `.` | floor |
| `,` | low cover |
| `^` | hazard |
| `S` | spawn |
| `W` `A` `H` `U` `M` | a weapon, armor, health, powerup, or ammo pickup |

Every row must have the same width, and the map needs two spawn cells at
minimum.

The test arena has 180-degree rotational symmetry, so the two teams get the
same arena. The parser also pairs the spawn slots of the two teams, because a
row-major scan reads the second spawn group in the reverse order of the first,
and the slot decides the role of a bot. Section 7.2.1 of the dev guide says why
this matters and how to check it.

## Deployment

The workflow `.github/workflows/deploy.yml` builds the project and deploys it
to GitHub Pages on each push to `main`. Enable Pages for the repository with
the source **GitHub Actions**.
