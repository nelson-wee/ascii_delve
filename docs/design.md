# ASCII Delve — Design notes

One section per milestone, in the order of `docs/roadmap.md`. A note says what
the milestone adds, the decisions it makes, its open questions, and its
acceptance targets. The player confirms a note before its code starts
(roadmap, Section 3).

## M0 — Clean baseline and reskin

**Status:** built on the branch `m0-baseline`.

### What it adds

1. **The base of the work.** The branch starts from `claude/roadmap`, which
   holds the base-and-inventory work and the roadmap.
2. **The reskin** to the sci-fi flavour of the roadmap. Names only: no number
   of the simulation changes.

   | Before | After | Until |
   |---|---|---|
   | Fighter, Thief, Wizard | The marines Kade, Moss, Reyes | M2 (generic marine), M3 (generated recruits) |
   | Party | Squad | — |
   | Mobs: Grunt, Archer, Brute | Hostiles: Crawler, Gunner, Juggernaut | M5 (enemy families) |
   | Claws, Shortbow, Cleaver | Mandibles, Needle Rifle, Shock Maul | M5 |
   | Town | Base | — |
   | Enter the dungeon; Venture deeper; Return to town | Deploy; Push deeper; Return to base | — |
   | Leather Vest, Chain Mail, Plate Armour | Flak Vest, Ceramic Plates, Hardsuit | M2 |
   | Trinkets: Ring of Focus, Boots of Haste, Amulet of Vigour | Modules: Targeting Module, Servo Module, Bio-Regulator | M2 |
   | Worn, Fine, Masterwork | Salvaged, Refined, Prototype | M6 |

   In `data/delve.json`: `classes` became `marines`, `party` became `squad`,
   `partyBehavior` became `squadBehavior`, `mobs` became `hostiles`,
   `mobBehavior` and `mobTactics` became `hostileBehavior` and
   `hostileTactics`. In the code: `returnToTown` became `returnToBase`, and the
   type `Hero` became `Marine`.
3. **The tournament code is gone:** the PvP batch harness (`npm run batch`), the
   style harness (`npm run styles`), replay tickets, sessions, the match
   runner, the PvP reports (round brief, tempo, batch tables), the build id,
   `data/batch.json`, `data/batch-tactics.json`, the tournament analysis tools,
   and their tests. The kill feed stays: the delve uses it.
4. **Docs.** The tournament's guides move to `docs/archive/`. This file starts.
   `docs/delve.md` describes the build as it is.
5. **CI** (`.github/workflows/ci.yml`): on every pull request and every push to
   `main`, typecheck, lint and test; then the smoke test.
6. **`npm run smoke`** (`scripts/smoke.mjs`): it builds the game, serves it,
   and plays one short session in a headless Chromium: the base, a deployment,
   a level, the level-over screen, one level deeper, the return to base, a slot
   of the loadout, auto-equip, and a reload that must keep the roster. Any
   error in the page fails it.

### Decisions

- **The save keeps three old keys** until the save version 2 of M3: `heroes`,
  `classId` and `trinket`. A rename now would make every save of version 1
  fail to load, and M3 already writes the migration.
- **The arena generator keeps its mirror for now.** The roadmap put the
  symmetry and fairness rules into M0. They go to M1 instead, with the new
  generator that replaces them. Without the mirror there is no generator, and
  the M1 generator is the real work. The mirror test (`tests/fairness.test.ts`)
  stays until then, because it guards that generator.
- **The engine's tournament round stays.** Two teams of three with a score
  limit is still what most engine tests build. M1 turns the teams into
  factions.

### Acceptance

| Target | Result |
|---|---|
| CI is green | Typecheck, lint, 566 tests and the smoke test pass locally. The workflow runs on the pull request. |
| No module imports tournament code | The removed modules have no importer left; the typecheck proves it. |
| The delve batch gives the same results within noise | Better than within noise: `npm run delve -- --runs 20 --depth 8` and `--runs 4 --campaign 4` give the same numbers before and after M0, row for row. |
