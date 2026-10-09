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
  later crafts signature weapons.

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
| D8 | **Engineering at base.** A boss clear unlocks a blueprint. A blueprint crafts a signature weapon. |
| D9 | **Effects get their own milestone.** New attack types and status effects, including a diffusion model for fire and gas. |
| D10 | **Procedural item art.** Each weapon gets a small ASCII picture, built from its own numbers, as in Cogmind (Section 9). |
| D11 | **Procedural set-pieces.** A level can hold hand-designed, procedurally placed rooms with their own rules, as Brogue's machine rooms (Section 10). |
| D12 | **The base is a hub of facilities**, as in Darkest Dungeon (Section 11). |
| D13 | **Each damage type and status effect has a glyph** (Section 6.5). |
| D14 | **Five damage types:** kinetic, thermal, toxic, energy, cryo. No radiation. |

### 2.1 Defaults that still need a confirmation

These are the recommendations of the scoping discussion. The work uses them
until a confirmation changes them.

| # | Default | Decided in |
|---|---|---|
| A1 | **Death rule:** a downed marine bleeds out after a time unless a medic treats it. When the squad clears the level, a downed marine that did not bleed out comes home wounded and misses missions. When the squad is wiped, every downed marine dies. | M3 |
| A2 | **Barracks:** a maximum of 8 marines; 3 deploy. | M3 |
| A3 | **Progression:** from gear and traits only. No experience levels. Look at this again after M6. | M6 |
| A4 | **A sector:** a chain of 3 to 5 levels, with a boss room at the end from M8. | M5 |
| A5 | **Crafting cost:** a blueprint (from a boss clear), plus materials (from sector loot), plus credits. | M9 |

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
  trait (D6). Deploy 3 (A2).
- **The death rule** (A1): bleed-out, rescue by a medic, wounds, and deaths on
  a wipe.
- **Traits, first set:** about 10 traits, each with a bonus and a cost.
  `dev-guide` Section 7.13 has the first list.
- **Base:** healing, the repair and resupply of gear charges, credits from
  missions, and a shop for basic items.
- **Squad orders:** come back when a marine is down, when gear charges run out,
  or when health falls under a set share. This is the "when to retreat"
  control, and the base for automatic play in M10.
- The save gets a schema version 2, with a migration from version 1.
- **Done when:** the campaign batch shows progression, different orders give
  different results, and a save of version 1 loads.

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
- The AI reads the fields: they raise the danger map and the path cost, and
  smoke blocks sight.
- **Replaces:** the hazard tiles and the damage-over-time list of the
  tournament.
- **Done when:** a gas cloud fills a room and not the corridor behind a closed
  wall, smoke breaks a sightline, and the batch shows that a damage type matters
  against an enemy that resists it.

### M5 — Sectors

A world map of sectors (D7, A4). Each sector is a chain of levels, and unlocks
the next ones when it is cleared. See Section 7 for the first three.

- A sector names: an arena generator and its parameters, an enemy family, the
  environment hazards, and a loot bias.
- An **enemy family** is a set of enemy types plus an AI doctrine for the
  family. Bugs swarm and close in; soldiers hold cover and fire lanes, which is
  what the tournament AI already does.
- **Set-pieces** (D11, Section 10): the framework, and two or three set-pieces
  for each sector.
- **Replaces:** depth 1, 2, 3 with a cycle of arena styles, and the placeholder
  enemies.
- **Done when:** each sector plays differently in the batch (fight distance,
  time in cover, enemies per fight), a loadout that is strong in one sector is
  measurably weaker in another, and every set-piece fires its triggers in a
  test.

### M6 — Loot and materials

- An item generator for all four slots, from the power budget of the weapon
  generator: item level, rarity, affixes (including resistances).
- Drop tables for each sector and enemy type. Loot drops from enemies.
- **Materials** for engineering (A5), with sector-specific kinds.
- The inventory screen: compare, filter, sell, and a stash limit.
- Item art (Section 9) for armour, implants and gear.
- **Replaces:** the loot of each clear (`rewards`) and the fixed item templates
  of M2, which stay as the starting items.
- **Done when:** the time to the next upgrade and the power curve meet the
  targets of the design note.

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
- One boss per sector. Each boss tests one part of the loadout: a resistance,
  single-target damage, area control, or healing.
- A boss clear sets a flag that engineering reads.
- **Done when:** the batch win rate for each boss depends on the loadout, as
  the design note says.

### M9 — Base expansion and engineering

See Sections 8 and 11.

- The facility framework: each facility has levels that credits and materials
  upgrade, and a marine assigned to an activity misses the next deployment.
- New facilities: the **engineering bay** (crafts signature weapons from
  blueprints), the **training sim**, the **ops room**, and the **memorial**
  (from M7) as a facility.
- **Strain is parked** (A6). M9 does not build it, and the rec room waits
  with it.
- **Done when:** each boss unlocks at least one blueprint, each signature
  weapon does something that no generated weapon does, and the campaign batch
  shows that the facility upgrades are a credit sink that pays back.

### M10 — Automation and offline progress

- Repeat deployments that follow the squad orders, at a chosen speed.
- Offline progress, from headless runs or from measured rates.
- A report of each session.
- **Done when:** the offline estimate is within the target error of a real
  headless run.

### M11 — Polish

- Names, presentation, a tutorial, sound if wanted, and the balance pass.

### Why this order

- The four slots (M2) decide what an item is. Loot (M6) and crafting (M9) wait
  for them.
- Effects and damage types (M4) come before sectors (M5), because an enemy
  family is defined by what it resists and what it uses.
- Drop tables and materials belong to sectors, so loot (M6) comes after them.
- Bosses (M8) need effects, sectors, set-pieces and good loot. Engineering
  (M9) needs bosses, and the training sim needs veterans (M7).
- Automation (M10) is a layer over finished content.

## 5. Placeholder register

| Placeholder | Where | Replaced in |
|---|---|---|
| The party of three fixed heroes (Fighter, Thief, Wizard) | `data/delve.json` `classes` | M0 (squad), M2 (generic marine) |
| Teams `A` (party) and `B` (mobs) | `sim/state.ts` | M1 |
| Two weapon slots of generated weapons | `delve/items.ts` | M2 |
| Armour and trinket table, quality by depth | `data/delve.json` `gear` | M2, then M6 |
| Tournament roles as the AI of each hero | `data/roles.json` | M2 (implants) |
| One item per clear, rolled into the pack | `data/delve.json` `rewards` | M6 |
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

## 8. Engineering (M9)

- A **base module** with a list of blueprints. A blueprint is locked until its
  boss is cleared.
- **Crafting cost:** the blueprint, sector materials, and credits (A5).
- A **signature weapon** is fixed, not generated. It combines the M4 effects in
  a way that no generated weapon can. Examples:
  - **Hive Burner** (from the brood mother): a flamethrower whose fire leaves a
    toxic gas cloud when it burns out.
  - **Breach Rail** (from the commander): a rail that passes through two walls'
    worth of cover.
  - **Overload Coil** (from the mainframe): an arc weapon whose chain jumps
    further on machines and stuns them.
- **Later, if wanted:** upgrades of a crafted item, using more materials.

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
| Colour | The tier, and the damage type from M4 | Standard, strong, prize, signature |

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

### 11.1 Facilities

| Facility | Activity | Milestone |
|---|---|---|
| Barracks | Recruit marines. Upgrades raise the roster cap and the quality of recruits. | M3 |
| Medbay | Treat wounds faster. Upgrades shorten recovery. | M3 |
| Quartermaster | Buy and sell basic items and gear charges. | M3 |
| Engineering bay | Craft signature weapons from blueprints (Section 8). | M9 |
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
