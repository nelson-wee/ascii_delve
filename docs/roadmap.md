# ASCII Delve — Roadmap

This document gives the order of work. Each milestone says what it adds, what
it replaces, and how we know that it is done. Change this document first when a
plan changes, then change the code.

`docs/delve.md` describes the build as it is now. `docs/design.md` (from M0)
holds the design notes of each milestone.

## 1. The game

A squad of three marines deploys into hostile sectors. The marines act on their
own AI. The player controls them only through what they carry and where they
go:

- **Loadout.** Four equipment slots on each marine: weapon, armour, AI implant,
  gear. The equipment decides what a marine can do and how it decides.
- **Deployment.** The player chooses the sector, sends the squad in, and decides
  when it comes back to base.
- **Base.** The squad heals, resupplies, changes its loadouts, recruits, and
  crafts the items and upgrades that boss blueprints unlock.

A **run** is a roguelike campaign (A8). Each sector has its own track of
levels, with bosses that offer a choice of blueprints. A cleared sector unlocks
stock equipment for every later run, so progress carries between runs.

The feel is an incremental game with tactical stakes. The flavour is sci-fi,
after XCOM and Into the Breach, and it continues the neon ASCII look of
`ascii_tournament`.

## 2. Decisions

These are agreed. A milestone does not change them without a change to this
section.

| # | Decision |
|---|---|
| D1 | **One generic marine.** No classes. A marine is what its loadout and its traits make it. |
| D2 | **Four equipment slots:** weapon, armour, AI implant, gear. |
| D3 | **Weapon slot:** one weapon. Every marine also carries a sidearm (the current baseline rifle) as the fallback that never runs dry. |
| D4 | **AI implant slot:** a doctrine (tactics and behaviour weights). It is the `roles.json` role of the tournament, made into an item. |
| D5 | **Gear slot:** an active tool with charges or a cooldown, for example a medkit or a target painter. Each gear item adds one AI action. |
| D6 | **Traits are personal, not equipment.** A new marine gets one random trait. Missions add more. Every trait has a bonus and a cost. A marine that dies loses its traits. |
| D7 | **Sectors are distinct.** Each sector has its own environment, arena generator, enemy family, hazards and loot. |
| D8 | **Engineering at base.** The engineering station crafts the unique items and fits the upgrades that blueprints unlock (Section 8). |
| D9 | **Effects get their own milestone.** New attack types and status effects, including a diffusion model for fire and gas. |
| D10 | **Procedural item art.** Each weapon gets a small ASCII picture, built from its own numbers, as in Cogmind (Section 9). |
| D11 | **Procedural set-pieces.** A level can hold hand-designed, procedurally placed rooms with their own rules, as Brogue's machine rooms (Section 10). |
| D12 | **The base is a hub of facilities**, as in Darkest Dungeon (Section 11). |
| D13 | **Each damage type and status effect has a glyph** (Section 6.5). |
| D14 | **Five damage types:** kinetic, thermal, toxic, energy, cryo. No radiation. |
| D15 | **Death rule** (was A1): a downed marine bleeds out after a time unless a medic treats it. When the squad clears the level, a downed marine that did not bleed out comes home wounded and misses missions. When the squad is wiped, every downed marine dies. Built in M3. |
| D16 | **Barracks** (was A2): a maximum of 8 marines; 3 deploy. Built in M3. |
| D17 | **Ready time is separate from fire rate.** A weapon can need time to get ready (to brace, or to spin up) and then fire fast while it stays ready. A heavy machine gun is slow to set up and fast once it is set up (Section 6.8). Built in M4. |
| D18 | **Progression from gear and traits only** (was A3). No experience levels and no character levels. A marine gets stronger by its loadout and its traits. |
| D19 | **Each sector has its own track.** A track is 5 levels. The tracks are independent: the player chooses which sector to push next. A boss fight closes levels 1, 3 and 5 of a track (Section 7.1). |
| D20 | **A blueprint choice after each boss.** The player takes one of the offered blueprints. A blueprint is a **unique item** (pre-made, and scaled to the boss that gave it) or an **upgrade** (fitted to a stock weapon or stock armour at the engineering station) (Section 8). |
| D21 | **Stock equipment.** A fixed catalogue of standard items. A run starts with a base set. Clearing a sector unlocks more stock, for every later run too, so runs are more consistent (Section 8.3). |

### 2.1 Defaults that still need a confirmation

These are the recommendations of the scoping discussion. The work uses them
until a confirmation changes them.

| # | Default | Decided in |
|---|---|---|
| A5 | **Crafting cost:** the blueprint is the unlock; each craft or fit costs sector materials plus credits. | M9 |
| A8 | **A run:** one campaign with a fresh barracks and the stock that is unlocked. The marines, their traits, the sector tracks, the blueprints and everything crafted belong to the run. A run is won when the level 5 boss of each sector is down, and lost when the barracks cannot field a squad. Stock unlocks and the records (the memorial, the best runs) last between runs. | M3 |
| A9 | **Random loot:** generated weapons stay, as **field finds** at the weapon points of a level, for variety inside a run. A field find has no upgrade socket. There are no random affixes: upgrades (D20) take their place. Enemies drop materials and credits, not items. | M6 |

### 2.2 Parked decisions

A parked decision is not a default. No milestone builds it until the decision
is made, and a milestone that touches it says so.

| # | Question | Why it is parked |
|---|---|---|
| A6 | **Strain:** combat stress that rises on a mission, can give a negative trait, and that base facilities lower (Section 11.2). | It changes the balance between the tactical layer (the missions) and the strategic layer (the base and the roster). Decide it with the design of the base in M9. |

## 3. The process of one milestone

Every milestone follows these steps, in this order:

1. **Design note.** A section in `docs/design.md`: what the milestone adds,
   the decisions it makes, its open questions, and its acceptance targets. The
   player confirms the note before any code.
2. **Data and schema.** The tunable numbers go in `data/*.json`, each with a zod
   schema. Mark a placeholder number `TBD`.
3. **Headless simulation and tests.** The system runs in Node first, with no
   display.
4. **Measurement.** `npm run delve` measures the acceptance targets of the
   design note.
5. **UI.** The screens come after the rules work headless.
6. **Browser check.** `npm run smoke` (from M0) clicks through the new screens.
7. **Docs and a pull request.** One branch per milestone (`m<N>-<name>`). The
   pull request goes into `main`. The milestone is done when the acceptance
   targets are met and CI is green.

**A placeholder must be listed.** A system that a later milestone replaces goes
into the placeholder register (Section 5) when it is added, with the milestone
that replaces it.

## 4. The milestones

### M0 — Clean baseline and reskin

- Merge `claude/town-inventory`. Register its loot parts as placeholders.
- **Reskin.**
  - The party becomes a squad of marines. Fighter, Thief and Wizard go; the
    marines take the current role weights until M2.
  - The town becomes the base.
  - The mobs become placeholder sci-fi enemies until M5.
  - Armour and trinkets become plating and implants until M2.
- Remove the tournament-only code and its tests: the PvP batch, tickets,
  sessions, the PvP reports, the arena symmetry and fairness rules.
- Move `docs/dev-guide.md` to `docs/archive/`. Start `docs/design.md`.
- Add a CI workflow (lint, typecheck, tests on every pull request) and
  `npm run smoke`.
- **Done when:** CI is green, no module imports tournament code, and the delve
  batch gives the same results as before within noise.

### M1 — Engine foundations

- Change `TeamId` (`A`, `B`) to a faction id: squad, hostiles, and room for more.
- Split `BotState` into the actor, a **stats** block (health, speed, accuracy,
  mitigation, resistances), a **status effects** list, and the loadout.
- Arena generation without the mirror: an entrance and rooms, not two spawn
  halves. Measure the conflict field from the entrance.
- **A cost budget for many actors.** Swarms need 30 to 50 enemies. An enemy far
  from the squad sleeps; a sleeping enemy does no field-of-view pass.
- **Done when:** the delve batch is the same within noise, and a level with 50
  enemies runs at 20 ticks a second or more headless.

### M2 — The loadout

- The generic marine (D1) with four slots (D2):
  - **Weapon:** the generated weapons, plus the sidearm (D3).
  - **Armour:** passive stats: health, mitigation, speed.
  - **AI implant:** the doctrines. Start with **Assault**, **Vanguard** (tank),
    **Fire Support**, **Medic** and **Scout**. Each one is a set of tactics and
    behaviour weights in `data/implants.json`.
  - **Gear:** start with the **medkit** (a new `Treat` action that heals a
    teammate; the `Support` urgency already scores how hurt a teammate is) and
    the **target painter** (a `Mark` action: a marked enemy scores higher for
    every squad member, as `focusFire` does now).
- The items are fixed templates in `data/items.json`. They are not generated
  yet.
- **Weapon art** (D10, Section 9): every weapon gets its ASCII picture on the
  loadout screen and in the squad panel.
- **Replaces:** the role-per-class model, and the armour and trinket table.
- **Done when:** in the batch, each implant gives a measurably different job
  (share of damage dealt, damage taken, healing done), and a gear item changes
  the outcome of a fight.

### M3 — Barracks and base

- **Barracks:** recruit marines, each with a generated name and one random
  trait (D6). Deploy 3 (D16).
- **The death rule** (D15): bleed-out, rescue by a medic, wounds, and deaths on
  a wipe.
- **Traits, first set:** about 10 traits, each with a bonus and a cost.
  `dev-guide` Section 7.13 has the first list.
- **Base:** healing, the repair and resupply of gear charges, credits from
  missions, and a shop for basic items.
- **Squad orders:** come back when a marine is down, when gear charges run out,
  or when health falls under a set share. This is the "when to retreat"
  control, and the base for automatic play in M10.
- **Runs** (A8): the start and the end of a run. The save splits in two: the
  **run** (barracks, sector tracks, blueprints, crafted items) and the **meta
  record** (stock unlocks, the memorial, the best runs). A lost run clears the
  run part only.
- The save gets a schema version 2, with a migration from version 1.
- **Done when:** the campaign batch shows progression, different orders give
  different results, a save of version 1 loads, and the meta record survives
  the end of a run.

### M4 — Effects and new attack types

See Section 6 for the full scope.

- A status effect system: burn, poison, slow, stun, suppressed, marked,
  shielded.
- **Damage types** (kinetic, thermal, toxic, energy, cryo; D14) and **resistances** on
  armour and on enemies.
- **Fields:** a per-cell model of fire, gas and smoke that spreads, decays and
  is blocked by walls.
- New attack types that use them: flamethrower, gas launcher, smoke grenade,
  arc (chain) weapon, cryo, EMP, suppressive fire.
- **Weapon handling** (D17, Section 6.8): a ready time that is separate from
  the fire rate, with two ready modes (brace and spin-up), priced by the power
  budget and read by the AI.
- The AI reads the fields: they raise the danger map and the path cost, and
  smoke blocks sight.
- **Replaces:** the hazard tiles and the damage-over-time list of the
  tournament.
- **Done when:** a gas cloud fills a room and not the corridor behind a closed
  wall, smoke breaks a sightline, the batch shows that a damage type matters
  against an enemy that resists it, and a braced heavy machine gun wins a held
  corridor but loses when a flank makes it move.

### M5 — Sectors

A world map of sectors (D7, D19). Each sector has its own track of 5 levels.
All three tracks are open from the start of a run, and the player chooses
which one to push next. See Section 7 for the first three sectors.

- A sector names: an arena generator and its parameters, an enemy family, the
  environment hazards, and a loot bias.
- An **enemy family** is a set of enemy types plus an AI doctrine for the
  family. Bugs swarm and close in; soldiers hold cover and fire lanes, which is
  what the tournament AI already does.
- **Set-pieces** (D11, Section 10): the framework, and two or three set-pieces
  for each sector.
- **Sector tracks** (D19, Section 7.1): the level of a track sets the
  difficulty of its next mission. Levels 1, 3 and 5 end in a boss room. Until
  M8, a boss room holds an elite pack set-piece.
- **A sector clear** (level 5 of its track) unlocks the stock items of that
  sector (D21). The catalogue itself comes in M6; M5 records the unlock.
- **Replaces:** depth 1, 2, 3 with a cycle of arena styles, and the placeholder
  enemies.
- **Done when:** each sector plays differently in the batch (fight distance,
  time in cover, enemies per fight), a loadout that is strong in one sector is
  measurably weaker in another, every set-piece fires its triggers in a test,
  and progress on one track does not change another.

### M6 — Stock, field finds and materials

- **The stock catalogue** (D21, Section 8.3): fixed items for all four slots in
  `data/stock.json`. They are made with the power budget of the weapon
  generator, offline, so they stay balanced. A base set, plus one set for each
  sector that its clear unlocks.
- **Upgrade sockets:** a stock weapon and a stock armour have one or two
  sockets for upgrades (D20).
- **The quartermaster** sells the unlocked stock for credits.
- **Field finds** (A9): generated weapons at the weapon points of a level.
- **Materials and credits** drop from enemies, with a kind of material for each
  sector (A5).
- The inventory screen: compare, filter, sell, and a stash limit.
- Item art (Section 9) for armour, implants and gear.
- **Replaces:** the loot of each clear (`rewards`), and the fixed templates of
  M2, which become the base set of stock.
- **Done when:** the power curve of a run meets the targets of the design note,
  and a run that starts after a sector clear is measurably stronger in its
  first missions.

### M7 — Veterans

- Traits earned from what a marine does on missions: the affinity model of
  `dev-guide` Section 7.13. For example, kills at long range lead to
  "eagle eye".
- A cap of 3 or 4 traits per marine. Nicknames at milestones.
- A memorial for the dead, with their record.
- **Done when:** in the batch, a typical marine earns its second trait in a
  target number of missions, and veterans clear measurably more than recruits.

### M8 — Bosses

- A boss framework: phases, telegraphed area attacks, adds, an enrage timer,
  and a boss arena at the end of a sector. A boss arena is a set-piece
  (Section 10), so the boss uses the same triggers.
- **Three bosses per sector,** at levels 1, 3 and 5 of its track (D19): a
  lieutenant (one mechanic), a captain (two phases), and the sector boss (the
  full framework). Nine bosses in all. Each boss tests one part of the
  loadout: a resistance, single-target damage, area control, or healing.
- **The blueprint choice** (D20): after a boss, the player takes one of three
  offered blueprints. The offer comes from the blueprint pool of the sector,
  and holds at least one unique item and one upgrade while the pool has both.
- **Done when:** the batch win rate for each boss depends on the loadout, as
  the design note says, and a blueprint offer never repeats a blueprint that the
  run already holds.

### M9 — Base expansion and engineering

See Sections 8 and 11.

- The facility framework: each facility has levels that credits and materials
  upgrade, and a marine assigned to an activity misses the next deployment.
- New facilities: the **engineering bay** (crafts the unique items and fits
  the upgrades of the run's blueprints, Section 8), the **training sim**, the
  **ops room**, and the **memorial** (from M7) as a facility.
- **Strain is parked** (A6). M9 does not build it, and the rec room waits
  with it.
- **Done when:** each sector has a blueprint pool of at least 6 (3 uniques and 3
  upgrades), each unique does something that no stock item does, an upgrade
  changes a stock item measurably, and the campaign batch shows that the
  facility upgrades are a credit sink that pays back.

### M10 — Automation and offline progress

- Repeat deployments that follow the squad orders, at a chosen speed. A repeat
  stays inside the current run (A8), and stops at a boss: a blueprint choice is
  always the player's.
- Offline progress, from headless runs or from measured rates.
- A report of each session.
- **Done when:** the offline estimate is within the target error of a real
  headless run.

### M11 — Polish

- Names, presentation, a tutorial, sound if wanted, and the balance pass.

### Why this order

- The four slots (M2) decide what an item is. The stock catalogue (M6) and
  crafting (M9) wait for them.
- Effects and damage types (M4) come before sectors (M5), because an enemy
  family is defined by what it resists and what it uses.
- Materials and the stock that a clear unlocks belong to sectors, so the stock
  catalogue (M6) comes after them.
- Bosses (M8) need effects, sectors, set-pieces and stock. Blueprints come
  from bosses, so engineering (M9) comes after them; it also needs the upgrade
  sockets of the stock (M6). The training sim needs veterans (M7).
- Automation (M10) is a layer over finished content.

## 5. Placeholder register

| Placeholder | Where | Replaced in |
|---|---|---|
| The party of three fixed heroes (Fighter, Thief, Wizard) | `data/delve.json` `classes` | M0 (squad), M2 (generic marine) |
| Teams `A` (party) and `B` (mobs) | `sim/state.ts` | M1 |
| Two weapon slots of generated weapons | `delve/items.ts` | M2 |
| Armour and trinket table, quality by depth | `data/delve.json` `gear` | M2, then M6 (stock) |
| Tournament roles as the AI of each hero | `data/roles.json` | M2 (implants) |
| One item per clear, rolled into the pack | `data/delve.json` `rewards` | M6 (materials, credits), M8 (blueprints) |
| A boss room that holds an elite pack | `data/setpieces.json` (from M5) | M8 |
| Hazard tiles and damage over time | `sim/attacks.ts` | M4 |
| Depth 1, 2, 3… with a cycle of arena styles | `delve/level.ts` | M5 |
| Grunts, archers and brutes | `data/delve.json` `mobs` | M0 (sci-fi names), M5 (enemy families) |
| Heal and revive everyone on return | `delve/run.ts` `returnToTown` | M3 (death rule) |
| The town screen as the whole base | `ui/screens.ts` | M3 (base), M9 (facilities) |
| The tournament code and docs | `src/meta`, `src/report`, `src/cli/batch.ts`, `docs/dev-guide.md` | M0 |

## 6. Effects and attack types (M4)

### 6.1 What the engine has now

- **Seven attack types:** hitscan, projectile, cone, burst, line, ricochet,
  tile.
- **Hazard tiles** (`state.hazards`): a weapon stamps a disc of tiles with a
  fixed damage per tick and an expiry tick. A tile does not spread or fade.
- **Damage over time** (`bot.dots`): a list of fixed ticks on one bot.
- **Cover** reduces the damage of a shot that crosses a low cover tile.
- The danger map already adds hazard tiles, and navigation can avoid hazard
  tiles (yes or no only).

### 6.2 Fields: a diffusion model

A **field** is one value per cell, in a typed array, for each medium: fire, gas
and smoke. Each tick (or every N ticks, for cost):

1. **Spread.** Each cell gives a share of its value to its four open
   neighbours. A wall takes nothing, so a cloud fills a room and stops at its
   walls. A door or a narrow gap lets a little through.
2. **Decay.** Each value falls by a share per tick.
3. **Effect.** An actor on a cell takes damage, or a status effect, from the
   value there.

Each medium has its own rules, in `data/fields.json`:

| Medium | Spreads | Decays | Effect | Notes |
|---|---|---|---|---|
| Fire | Slowly, and only into cells with fuel (vegetation, debris, spilled fuel) | When the fuel is gone | Thermal damage and the **burn** status | Fuel is a property of the tile. A burnt cell has no fuel left. |
| Gas (toxic) | Fast, and evenly | Slowly | Toxic damage and the **poison** status | Fire can ignite some gases. |
| Smoke | Fast | Medium | No damage. **Blocks sight** above a threshold | `blocksSight` reads the smoke field. |

The cost is small: a 60 × 30 map is 1800 cells. Only cells with a value take
part, so an empty field costs almost nothing.

### 6.3 New attack types

| Attack type | What it does | Uses |
|---|---|---|
| Flamethrower | A short cone that puts fire into the field | Fire field, burn |
| Gas launcher | A projectile that releases a gas cloud on impact | Gas field, poison |
| Smoke grenade (gear) | Releases smoke | Smoke field |
| Arc | Hits a target, then chains to the nearest other enemies within a range | Energy damage |
| Cryo | Cryo damage that slows the target; the slow stacks into a stun | Cryo damage, slow, stun |
| EMP | Energy damage that disables drones and shields | Stun on machines |
| Suppressive fire | Low damage; the target loses accuracy and stays in cover | Suppressed |
| Rail | A line that passes through actors and low cover | Kinetic, ignores cover |

### 6.4 Status effects

One list of status effects per actor replaces `bot.dots`. Each effect has a
kind, a magnitude, a duration, a source, and a stacking rule. The first kinds
are burn, poison, slow, stun, suppressed, marked and shielded.

### 6.5 Damage types, resistances and glyphs

Five damage types (D14): kinetic, thermal, toxic, energy, cryo. Armour and
enemies have a resistance to each. This is what gives a sector its own gear:
bugs burn, soldiers wear kinetic armour, machines fall to EMP. Cryo is the
control type: less damage, but it slows, and a slow that stacks becomes a stun,
so it holds a swarm back or pins a heavy target. Radiation is out of scope.

**Each damage type has a glyph** (D13). The glyph appears on item stat lines,
resistance lines, the hit sparks of the effects layer, and the kill feed.

| Damage type | Glyph | Code point | Status |
|---|---|---|---|
| Kinetic (ballistic) | ⚠ | U+26A0 | Core |
| Thermal (fire, plasma heat) | ♨ | U+2668 | Core |
| Toxic (poison, acid, gas) | ☣ | U+2623 | Core |
| Energy (electric, EMP, arc) | ϟ | U+03DF | Core |
| Cryo (cold, slow) | ❄ | U+2744 | Core |

**Status effects use glyphs too:**

| Status | Glyph | Code point | Notes |
|---|---|---|---|
| Marked (target painter) | ⌖ | U+2316 | A position marker: the right meaning |
| Shielded | ◘ | U+25D8 | Already the shield and armour glyph of the UI |
| Stunned | ✱ | U+2731 | |
| Suppressed | ▼ | U+25BC | |
| Bleeding (downed) | ‡ | U+2021 | |
| Burning, poisoned, chilled | ♨, ☣, ❄ | | The glyph of the damage type |
| Blast (area hit spark) | ✹ | U+2739 | |

**Rendering rules.** A check in the game's canvas font (2026-10-09) measured
every glyph above at one cell wide. Two rules still apply:

1. ⚠, ❄ and ☣ have an emoji form on some systems. The game appends the
   text-presentation selector U+FE0E to each of them, and the M4 browser check
   tests them on Windows, macOS and a phone.
2. ☣ and ♨ draw small at grid size. They are for stat lines and the legend; on
   the map, a status shows as the colour of the actor.

Do not use ≈ or ≋ for an effect: ≈ is the hazard tile of the map.

### 6.6 What the AI must learn

- The danger map adds the field values. The path cost reads the danger map, so
  a marine walks around a gas cloud when it can. This replaces the yes-or-no
  hazard rule of navigation.
- Smoke blocks sight, so the existing perception code handles it.
- A gear action (a smoke grenade) and a weapon with an area effect need a
  "where to aim" score: the existing `areaTargetsIfAimedAt` is the start.

### 6.7 Display

The neon grid tints a cell by its field value: orange for fire, green for gas,
grey for smoke. The tint goes under the glyphs, so the arena stays readable.

### 6.8 Weapon handling: ready time and fire rate (D17)

#### 6.8.1 What the engine has now

A shot has two timers today:

| Timer | Field | Belongs to | Meaning |
|---|---|---|---|
| Aim | `reactionByBand` (plus the marine's reaction) | The target | The ticks between the first sight of a target and the first shot. It starts again on each new target. |
| Cadence | `fireIntervalTicks` | The weapon | The ticks between two shots. |

A heavy weapon is slow today because its aim timer is long. That makes it slow
on **every** new target, and a heavy weapon cannot also be fast. A heavy
machine gun that sweeps a corridor of targets is not possible.

#### 6.8.2 The third timer: ready

**Ready** belongs to the weapon in the hands of the marine. It does not start
again when the target changes. A weapon has:

- `readyTicks`: how long it takes to get ready. 0 for most weapons.
- `readyMode`: how it gets ready, and how it stops being ready.
- `fireIntervalTicks`: the cadence **once it is ready**.

Two ready modes:

| Mode | Gets ready when | Stops being ready when | Example |
|---|---|---|---|
| **Brace** | The marine stands still with the weapon for `readyTicks` | The marine moves more than a short step, or changes weapon | A machine gun on a bipod; a heavy cannon on a tripod |
| **Spin-up** | The weapon fires. The cadence starts slow and reaches `fireIntervalTicks` after `readyTicks` of steady fire | The weapon stops firing for a short time; the barrels spin down | A rotary cannon; a minigun |

The aim timer stays as it is, and it can be short on a ready weapon. A braced
machine gun then moves from target to target fast. That is the point of it.

#### 6.8.3 What it costs

The power budget of the weapon generator must price readiness, or a heavy
machine gun is simply the best weapon. Section 7.20.12 of the tournament guide
gives the rule: the budget must trade more than damage.

- A weapon with a long ready time gets a higher cadence or damage for the same
  budget.
- Its damage profile (`dpsProfile`) states **sustained** damage per second, as
  now, plus a second number for the **first seconds** of a fight, which includes
  the ready time. The AI reads both.

#### 6.8.4 What the AI must learn

- **Hold the ground.** A marine with a braced weapon values `HoldPosition` more,
  and the cost of `Reposition` includes the ready time that it loses. A
  Fire Support implant makes this strong.
- **Get ready before the fight.** A marine with a brace weapon braces at a
  choke point or a sightline when no enemy is in sight: the `TakePosition`
  action, which already looks for ground that overlooks the fight.
- **Choose the weapon by the fight.** Against an enemy that is close and
  fast, the sidearm is better than a weapon that is not ready yet. The weapon
  choice already reads the damage profile; it reads the "first seconds" number
  when a fight starts.
- **Enemies use it too.** The heavy gunner of the Rebel Fort and the machine-gun
  nest set-piece (Section 10.3) are braced weapons.

#### 6.8.5 Display

The squad panel shows the state of a ready weapon: "bracing 60 %", "ready", or
"spinning up". The weapon art shows a bipod or a barrel cluster (Section 9.1).

## 7. Sectors (M5)

The first three sectors. Each uses an arena generator the engine already has.

| Sector | Environment | Generator | Enemy family | How it fights | Hazards | Loot bias |
|---|---|---|---|---|---|---|
| **Hive Caverns** | Organic caves | `cavern` | Bugs: swarmers (many, weak, fast), spitters (acid at range), a brood mother (boss) | Swarms close in from several sides. No cover use. Numbers over quality. | Acid pools; egg sacs that release more swarmers | Thermal and area weapons, toxic resistance, bio materials |
| **Rebel Fort** | Walls, bunkers, corridors | `bastion` | Soldiers: riflemen, a heavy gunner, a sniper, a commander (boss) | Hold cover and fire lanes, focus fire, flank. This is the tournament AI almost as it is. | Mines, a mounted turret | Precision weapons, kinetic armour, military materials |
| **Derelict Station** | Long halls, open bays | `openfield` | Machines: drones, sentries, a security mainframe (boss) | Long-range fire from fixed positions; drones that patrol and swarm | Electrified floors, venting gas | Energy weapons, EMP gear, tech materials |

Each sector needs:

- **The swarm budget of M1.** The Hive needs 30 to 50 enemies in a level.
- **A doctrine for the family.** The soldiers use the tournament weights
  (cover, `TakePosition`, `Support`). The bugs use high aggression, no cover
  and strong `Support`. The machines hold position and patrol.
- **A conflict field from the entrance.** The fort's sightlines must point at
  the way the squad comes in.

### 7.1 Sector tracks (D19)

Each sector has a track of 5 levels. A level is one mission. A track keeps its
place between missions, so a run can push the Hive to level 3 while the Fort is
still at level 1.

| Track level | Mission | After the mission |
|---|---|---|
| 1 | A short level with a **lieutenant** boss room | Blueprint choice |
| 2 | A level | Materials and credits |
| 3 | A level with a **captain** boss room | Blueprint choice |
| 4 | A level | Materials and credits |
| 5 | A level with the **sector boss** | Blueprint choice, and the sector clear: its stock unlocks (D21) |

**Difficulty** comes from the track level and nothing else. So the order of the
sectors is the player's strategy: push the sector whose enemies the squad's
gear beats, and take the blueprints that help against the next one.

**First bosses** (placeholders until M8; each tests one part of the loadout):

| Sector | Level 1: lieutenant | Level 3: captain | Level 5: sector boss |
|---|---|---|---|
| Hive Caverns | A **swarm lord**: commands the swarm, and the swarm scatters when it dies | An **acid brood**: lays acid fields; toxic resistance matters | The **brood mother**: egg sacs, waves of critters, area denial |
| Rebel Fort | A **sergeant** with a machine-gun team behind cover | A **captain** with an armoured walker; kinetic armour on the enemy | The **commander**: calls reinforcements and artillery on marked cells |
| Derelict Station | A **sentry overseer** that links the turrets | A **repair hub** that rebuilds drones until it falls | The **security mainframe**: shields, EMP pulses, sealed doors |

**A wipe** on a track does not move the track back. The squad that is lost is
the cost (D15).

## 8. Engineering, blueprints and stock (M6, M8, M9)

### 8.1 Blueprints (D20)

A boss gives a **choice of three blueprints** from the pool of its sector. The
player takes one. A blueprint belongs to the run (A8). There are two kinds:

| Kind | What it gives | Example |
|---|---|---|
| **Unique item** | A pre-made item for any of the four slots. It has a fixed design and a fixed effect. Its numbers scale with the tier of the boss that gave it: lieutenant, captain or sector boss. | **Hive Burner** (weapon): a flamethrower whose fire leaves a toxic gas cloud when it burns out. **Breach Rail** (weapon): a rail that passes through two walls of cover. **Overload Coil** (weapon): an arc whose chain jumps further on machines and stuns them. **Ablative Carapace** (armour): plating grown from hive chitin, strong against toxic damage. **Command Uplink** (AI implant): the marine marks every enemy it sees for the squad. |
| **Upgrade** | A module that the engineering station fits into a socket of a **stock** weapon or **stock** armour. It changes one thing. | **Incendiary rounds:** the weapon's damage type becomes thermal. **Stabiliser:** the brace time of a heavy weapon halves. **Extended magazine.** **Reactive plating:** the armour resists the first hit of each fight. **Cryo coil:** each hit adds a slow. |

A unique item is a statement: it changes how a marine fights. An upgrade
sharpens an item the player already trusts. The offer of three holds at least
one of each kind while the pool has both.

### 8.2 The engineering station

- **Craft a unique:** the blueprint, plus materials of its sector, plus credits
  (A5). A blueprint can be crafted more than once, at the full cost each time.
- **Fit an upgrade:** choose a stock weapon or stock armour with a free socket.
  The cost is the same kind as a craft. An upgrade can be taken out again, and
  goes back to the store of the run.
- **Later, if wanted:** a better tier of a unique, from a second clear of the
  same boss.

### 8.3 Stock (D21)

- **Stock** is a fixed catalogue of standard items for all four slots
  (`data/stock.json`, M6). The quartermaster sells the stock that is unlocked.
- Stock is made with the power budget of the weapon generator, offline, so a
  stock item is balanced against the rest, and the same in every run.
- **A run starts** with the base set: a standard rifle, standard plating, the
  first implants and a medkit.
- **A sector clear unlocks** that sector's stock set, at once and for every
  later run. For example, the Hive clear unlocks a flamethrower and toxic
  plating; the Fort clear unlocks a braced machine gun and a target painter.
- Stock weapons and stock armour have **upgrade sockets** (one or two). A field
  find (A9) and a unique have none: the stock is the base that a run builds on.

### 8.4 How the three sources of items fit together

| Source | Varies between runs? | Can take upgrades? | Lasts after the run? |
|---|---|---|---|
| Stock | No: the same catalogue, larger as sectors are cleared | Yes | The unlock lasts; the items are bought again |
| Unique (blueprint) | Yes: the offers are random | No | No |
| Field find | Yes: generated in each level | No | No |

## 9. Procedural item art (D10)

Each weapon gets a small ASCII picture, as in Cogmind, so a player can read a
loadout at a glance. The picture is **built from the weapon's own numbers**, so
two weapons that fight the same way look alike, and the picture never lies.

### 9.1 How a picture is built

A picture is a fixed box (about 24 columns by 4 rows). A part comes from a
weapon field:

| Part | Comes from | Example |
|---|---|---|
| Barrel length | `rangeMax` and `optimalRange` | A sniper barrel runs the full width; a shotgun barrel is short |
| Muzzle | `attackType` | A flared mouth for a cone, a tube for a projectile, an emitter for a line or arc, a nozzle for a flamethrower |
| Optic | The archetype: marksman and precision | A scope on top |
| Magazine | `ammoMax` | A box under the body; a drum for a large magazine |
| Vents | `fireIntervalTicks` | Cooling fins on a fast-firing weapon |
| Bipod or barrel cluster | The ready mode (from M4) | A bipod for a braced weapon; a rotary barrel cluster for a spin-up weapon |
| Colour | The tier, and the damage type from M4 | Stock, field find tiers, unique |

A sketch of a long-range precision rifle:

```
    ▄▄▄▄▄
 ╒══╧═══╧═╤════════════─
 ╘═╤╤═▄▄▄═╛
   ╘╛ ▐▌
```

A small variant per part (for example, the shape of the stock) comes from a
hash of the weapon id, so the same weapon always gets the same picture.

### 9.2 Where it lives

- `src/weapons/art.ts`: a pure function from a weapon to lines of text and
  colour spans. No browser code, so tests can check it (the same picture for
  the same weapon, a fixed width, and a different picture for a different
  attack type).
- The loadout screen and the squad panel draw it (M2).
- Armour, implants and gear get pictures in M6.

## 10. Procedural set-pieces (D11)

A **set-piece** is a hand-designed room with its own rules, placed by the
level generator, as Brogue's machine rooms. It gives a level a moment that a
random pack of enemies cannot.

### 10.1 What a set-piece is

A set-piece is a data record in `data/setpieces.json`:

- **Where it fits:** the room size, the number of exits, and the position (a
  dead end, a choke point, the centre).
- **Tiles:** walls, low cover, hazards and fuel that it stamps into the room.
- **Actors:** enemies, static emplacements, and destructible objects, each at a
  position in the room.
- **Triggers:** "when X happens, do Y". For example: when an actor dies, spawn
  enemies; when the squad sees a cell, wake the room; when an object is
  destroyed, turn off the emplacements.
- **A reward:** a loot cache, or a material.

### 10.2 What the engine needs

- **Static actors:** an emplacement holds its cell and has a fire arc.
- **Destructible objects:** health and no weapon, for example an egg sac or a
  power node.
- **Triggers:** they listen to the event bus, which already sends `Death`,
  `Hit` and the other events.
- **Placement:** the room graph of the arena generator without the mirror (M1).

### 10.3 First set-pieces

| Sector | Set-piece | What happens |
|---|---|---|
| Hive Caverns | **Brood chamber** | A queen surrounded by egg sacs. When the queen dies, or the squad comes close, the sacs burst into swarms of critters. |
| Hive Caverns | **Acid nursery** | Acid pools and spitters on high ground. |
| Rebel Fort | **Machine-gun nest** | A heavy gun on an emplacement behind a ring of sandbags, with a wide arc over a corridor. Flank it, or smoke it. |
| Rebel Fort | **Alarm room** | A sentry runs for an alarm. If the alarm sounds, reinforcements come. |
| Derelict Station | **Sentry gallery** | Turrets along a hall, fed by a power node. Destroy the node, or EMP it, and the turrets stop. |

Bosses (M8) are set-pieces too, so a boss's adds and phases use the same
triggers.

## 11. The base as a hub (D12)

After each delve the squad comes back to a base with **facilities**, as in
Darkest Dungeon. A facility gives an activity, has levels, and costs credits
and materials to upgrade. This gives the incremental layer a place to spend.
Facility levels belong to the run (A8).

### 11.1 Facilities

| Facility | Activity | Milestone |
|---|---|---|
| Barracks | Recruit marines, up to the cap of 8 (D16). Upgrades raise the quality of recruits. | M3 |
| Medbay | Treat wounds faster. Upgrades shorten recovery. | M3 |
| Quartermaster | Buy unlocked stock and gear charges; sell field finds. | M3 (basic), M6 (stock) |
| Engineering bay | Craft unique items and fit upgrades from the run's blueprints (Section 8). | M9 |
| Training sim | Retrain a marine: change one trait, at a cost. | M9 |
| Rec room | Lower strain (Section 11.2). | Parked with A6 |
| Ops room | Choose missions, with modifiers and rumours of set-pieces and loot. | M9 |
| Memorial | The record of the dead. | M7 (list), M9 (facility) |

A marine assigned to an activity misses the next deployment, as in Darkest
Dungeon. That is the reason for a roster of 8: you rotate the squad.

### 11.2 Strain (A6, parked)

Darkest Dungeon's stress, in a sci-fi form.

- Strain rises on a mission: a marine is downed, a squad mate dies, a swarm
  surrounds it, a mission runs long.
- At a threshold, the marine gets a negative trait (the tournament's trait list
  has "shell-shocked" and "timid" already).
- The rec room lowers strain. A long rest lowers it slowly.

Strain gives rotation a cost and makes the base matter after every delve. It
also changes how the missions and the base pull on each other, so it is parked
(Section 2.2). No milestone builds it until A6 is decided.

## 12. How to change this roadmap

1. Change the decision table (Section 2) or a milestone (Section 4) here.
2. Note the change in the pull request that makes it.
3. Update the placeholder register when a milestone adds or removes a
   placeholder.
