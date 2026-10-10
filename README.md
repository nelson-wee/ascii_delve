# ASCII Delve

A squad of three marines deploys into hostile sectors. The marines act on their
own AI. The player does not control a marine. The player controls what each
marine carries, where the squad goes, and when it comes back to base.

ASCII Delve is a fork of
[`ascii_tournament`](https://github.com/nelson-wee/ascii_tournament), an ASCII
team shooter with indirect control. It keeps the engine of the tournament: the
arena generators, the utility AI, the combat, and the neon ASCII display.

| Document | What it holds |
|---|---|
| [`docs/roadmap.md`](docs/roadmap.md) | The plan: the agreed decisions, the milestones in order, and the register of placeholder systems. |
| [`docs/design.md`](docs/design.md) | The design note of each milestone. |
| [`docs/delve.md`](docs/delve.md) | The game as it is built now. |
| [`docs/archive/`](docs/archive/) | The design of the tournament engine, and its measurements. |

## Status

**M0 — clean baseline and reskin.** The game loop works in the browser:

1. At the base, equip the marines from the stash. Each marine has two weapon
   slots, an armour slot and a module slot until M2.
2. Select **Deploy**. The squad explores a generated level and fights the packs
   of hostiles. A clear puts loot in the pack.
3. When the level ends, select **Push deeper** (the squad keeps its health,
   armour, weapons and ammo) or **Return to base** (the pack goes into the
   stash, and the base heals everyone). A wipe loses the pack. Equipped items
   are never lost.

The browser saves the roster, so a refresh keeps the marines and the stash.
The next milestone is M1: factions, a stats block, and a generator without the
mirror (`docs/roadmap.md`).

## The delve harness

`npm run delve` runs delves with no display. Every delve goes deeper while a
marine is standing.

```
npm run delve                                # 40 delves, to depth 10
npm run delve -- --runs 100 --depth 15 --seed 7
npm run delve -- --runs 12 --campaign 10     # 10 delves per roster, with base visits
```

It prints, for each depth, how many squads reached it, how many cleared it,
how many were wiped, how many hit the time limit, the mean time of a level, and
the mean number of hostiles. Then it prints the deepest level cleared and the
depth at which each marine fell.

With `--campaign N`, each roster plays N delves. It goes back to base when a
marine is down or under half health, and it equips the best of its stash. The
table gives the depth, the wipes, the items banked and the squad health for
each delve, and a probe compares the depth that a fresh roster and the
equipped roster clear.

`data/delve.json` holds the numbers: the marines, the hostiles, the weights
that make a squad and a hostile, the level curve, the rewards and the gear.

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
| `npm run delve` | Run delves with no display and print how deep the squad gets. |
| `npm run smoke` | Build the game and play one short session in a headless browser. |
| `npm run arena` | Print a generated arena and its metrics (see below). |

## Rules for the code

These rules come from Sections 4 and 13 of the tournament guide
(`docs/archive/dev-guide.md`), and from the process of `docs/roadmap.md`.

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
6. Until M1, a change to the engine must leave the two-team round of the engine
   tests as it was. The engine tests check this.
7. Each milestone follows the process of `docs/roadmap.md`, Section 3: a design
   note first, then data, headless code and tests, measurement, UI, the smoke
   test, and a pull request.

The ESLint configuration and the test `tests/boundary.test.ts` check rules 1
and 4 automatically.

## Arena tools

The arena generators come from the tournament. M1 replaces the mirror step.

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

The workflow `.github/workflows/ci.yml` runs the typecheck, the lint, the
tests and the smoke test on every pull request and every push to `main`.

The workflow `.github/workflows/deploy.yml` builds the project and deploys it
to GitHub Pages on each push to `main`. Enable Pages for the repository with
the source **GitHub Actions**.
