# HEIRLOOM - session handoff

## 2026-09-01 / 2026-09-02 - Checkpoint 1: the feel test

**Outcome: the core loop works and is browser-verified.** A wildfire rolls
across gold grass, most things die, and the survivors are measurably enriched
for Ashlung. That is the test section 10 of the design doc asks for.

### What was built

The whole CP1 slice from the design doc, plus the full 26-trait registry
(only 8 are in the mutation pool at CP1 so the fire test stays legible):

- 72x48 tile world, 9 biomes, percentile-based terrain generation
- creatures that wander, forage, breed, age, starve and die
- 26 traits with upkeep costs, resistances and sprite paint; 6 trait slots
- inheritance + 8%-per-birth mutation, with mutually exclusive trait pairs
- wildfire: spreads tile by tile, stops at water, leaves burnt ground and ash
- the narrator log
- speed controls, pan/zoom/pinch, click-a-creature inspector, species panel

### Decisions Tucker made this session

Free browser toy (not Steam); 26 traits / 12 strains rather than all 52;
disasters entirely player-driven with **no auto-timer**; project lives in
`Claude Projects\heirloom` (the `Darwin Sim` folder was folded in and removed).

### Bugs found and fixed - all of these were caught by running it, not by reading it

1. **Zero births, world-wide starvation.** Biome food yields were on a 0-1.35
   scale while creature upkeep was 3.0/yr, so nothing could ever eat enough to
   breed. Rescaled biome `food` to food-per-year.
2. **Fire always burned empty ground.** The unaimed fire picker chose the
   highest-food tile - which is ungrazed ground, i.e. exactly where no creature
   lives. Now it starts near something alive.
3. **Fire resolved in a single tick.** `ignite()` appends to the same array
   `stepFire` was walking, so a fire cascaded through every generation at once
   instead of crawling. Snapshot the length first.
4. **Fire was subcritical and went out.** In a 2D front most neighbours are
   already alight, so the per-neighbour spread chance has to be high (~0.22/tick
   on grass) or the fire dies. It was 0.05.
5. **`stats.died` double-counted** - the generic death counter collided with
   the old-age cause of the same name. Generic counter is now `stats.total`.
6. **Regrown grass never repainted.** The dirty-tile check compared `vis[i]`
   against itself. `World.visKey()` now owns the appearance key.
7. **`BIOMES is not defined` in render.js** - a global hoist rewrote a lookup
   without adding the declaration. The headless harness does not load
   `render.js`, so every Node test passed while the renderer threw on
   construction and nothing drew at all. Found only in the browser.
8. **Uninhabitable worlds.** Absolute elevation thresholds put a huge dead
   highland plateau across the middle of most seeds. Biomes are now cut at
   percentiles of each world's own noise, so every seed gets a similar,
   livable mix.
9. **Both starter species drew the same colour.** Starter hues are now spaced
   137.5 degrees apart.

### Balance, as measured

`node tools/firetest.js test-1 30 300 aimed` - each row is one fire, showing
trait prevalence before>after:

    year  species        pop        Ashlung  Photosyn
      30  Bramblebrood   274>  64      1>5       1>0
      60  Reedkin        241>  59    14>32       9>8
     180  Reedkin        237> 115    33>57     89>92
     270  Bramblebrood   228> 126    10>18     95>98

Every fire pushes Ashlung up. Culls land at 40-80%, inside the doc's 60-90%
guidance, and populations rebound afterwards. The mercy rule has never once
allowed a total wipe in testing.

### Verified how

- **Headless**: 300-year runs across several seeds via `tools/headless.js`.
- **Browser-verified over http://localhost** via `tools/selftest.html`: no JS
  errors, terrain renders 1014 distinct colours, 4017 sim ticks/s in-browser
  (16x speed needs 192, so ~20x headroom), a fire ignites and culls correctly.
- **Looked at**: screenshots of the world, of a fire mid-spread, and zoomed in
  on creature sprites.

### Not yet verified

- **`file://`** has NOT been directly opened. The browser extension in this
  setup refuses to navigate to `file://` URLs. The code contains no `fetch`,
  no XHR, no ES modules and no external resources - which are the only things
  that break under `file://` - so it should be fine, but please confirm by
  double-clicking `index.html` once.
- **Phone/tablet.** Touch pan and pinch-zoom are wired but untested on a real
  device.

### Known and deliberate

- Photosynthetic Skin reaches 90%+ prevalence in most runs. That is the correct
  answer to a world whose only pressure is food; the traits that punish it
  (ash winter, the Long Night) arrive with the slow disasters in checkpoint 3.
  Revisit the balance then, not before.
- Only 8 of the 26 traits are in the mutation pool. Flip `sim.pool` to
  `Traits.ALL.map(t => t.id)` to open it up - that is checkpoint 2's job.

### Next - checkpoint 2

All 26 traits live, richer trait-driven sprites, species splitting with
trait-derived names and colours, and the family tree. `Sim.census()` already
computes each species' `coreMask` (traits held by >60% of members), which is
the hook speciation should hang off.

## 2026-09-02 - Checkpoint 2: all traits, strains, and speciation

**Outcome: species now split off on their own and name themselves.** A run
routinely ends with three or four species that have real genetic identities -
one at 91% Ashlung and 96% Parthenogenesis, another at 96% Photosynthetic Skin.

### What was built

- All 26 traits are now in the mutation pool (checkpoint 1 used only 8).
- `js/data-strains.js`: 12 named strains and 6 flaws. One table holds both -
  a row fires when a creature has every trait in `need` and none in `without`,
  which also lets a row describe a trap (Warning Colours with no poison behind
  it). Strains shift the creature's colour and get a discovery line in the log;
  flaws drain the colour so doomed branches are visible on the map.
- Species splitting: a group that drifts 3+ traits from its species' norm and
  holds it for 6 years becomes a new species, with a trait-derived name, a hue
  shifted off its parent's, and a record of which disaster it happened after.
- The inspector now shows strains, flaws, and lineage ("Split from the
  Reedkins in year 132, after the wildfire").

### The two problems worth remembering

1. **The trait budget was crushed to nothing.** Average traits per creature was
   1.09 - everyone carried exactly one trait, so nothing could ever drift the
   3 traits a split needs. Food, not the population cap, was the binding
   constraint, and at equilibrium that always squeezes the trait budget to
   zero. Fixed by lowering base upkeep 3.0 -> 2.2, easing grazing, raising
   regrow rates, and correcting a modelling error: plant regrowth was being
   multiplied by the *instantaneous* day/night light value, which halved it.
   Regrowth now uses daily-average light (`World.growLightAt`); photosynthetic
   creatures still eat the instantaneous value. Average traits is now ~1.8-2.2.

2. **Nothing ever speciated, and it was a missing mechanism, not a threshold.**
   `tools/splittest.js` showed divergent creatures existed (up to 33 at once)
   but the largest cluster sharing a genome was 5. Inheritance is a per-trait
   coin flip, so a novel combination is halved every generation by mating back
   into the majority. Added **assortative mating** (`CFG.mateChoosiness`):
   creatures prefer mates with similar genomes. Clusters now reinforce and
   splits happen on their own. This is the mechanism real speciation uses and
   the sim was simply missing it.

### Verified how

- `tools/headless.js test-1 400 35`: 4 species, 2 from splits, 6 strains
  discovered, 46 distinct genomes, avg 2.21 traits.
- **Browser-verified** via `tools/selftest.html`: no JS errors, 300 sim years
  driven by hand at 3202 ticks/s, "4 species ever, 2 from splits, 3 alive
  (Sundrinkers from Duncreepers y90; Sunspawns from Duncreepers y220)",
  8 strains discovered, 50 sprites baked.
- Screenshots: three species reading as visibly different colours on the map,
  the creature inspector showing a flaw, strain discoveries in the log.

### Still not verified

`file://` (the extension refuses those URLs) and touch on a real device -
both carried over from checkpoint 1.

### Known

Splits are stochastic - some 300-year runs produce none. That is correct, not
a bug, but if it feels too rare in play, lower `SplitConfig.minGroup` or raise
`CFG.mateChoosiness`.

### Next - checkpoint 3

The rest of the disasters: the nine other sudden ones, the slow squeezes
(ice age, ash winter, famine, sea rise), the good events, and the player-driven
ones. Ash winter and the Long Night are also the traits that finally punish
Photosynthetic Skin, which currently dominates most runs unopposed.

## 2026-09-02 - Checkpoint 3: the rest of the disasters

**Outcome: 21 disasters, all firing, all measured.** Ten sudden, five slow
squeezes that run for decades, four good events, two player tools.

### What was built

- `js/data-disasters.js` grew from 1 row to 22 (21 offered + one internal
  `drainage` row that floods use so their water recedes).
- **Slow disasters**: `Sim.startEffect` / `updateEffects` run a row's
  `update(sim, progress, dt)` every tick for decades. Ice Age freezes the map
  inward and thaws it again, The Long Summer dries water to sand and grass to
  clay, Ash Winter takes the sun away, Famine halves regrowth, Sea Rise drowns
  the coasts.
- **Area damage**: `Sim.strike` / `strikeAll` apply one pulse with distance
  falloff, per-creature resistance, the mercy rule, and an optional filter so a
  disaster can spare things by *where they are* (asleep, burrowed, under forest
  canopy) rather than by what they carry.
- Disaster buttons are grouped behind four tabs - Sudden / Slow / Fortune /
  Yours - because twenty-one buttons in one bar is unusable.
- The renderer now shows the climate: an ash winter darkens the world, an ice
  age washes it blue, a long summer washes it gold.

### Culls, measured (`tools/disastertest.js`, population trough)

    Wildfire 45%   Meteor 60%   Eruption 57%   Lightning 81%
    Hailstorm 21%  Earthquake 22%  Solar Flare 76%  Acid Rain 29%
    Ice Age 90%    Long Summer 76%  Famine 8%
    Deluge 4%      Tsunami 3%       Sea Rise 2%

The last three are low **on purpose**. Creatures avoid the food-poor coast, so
a tsunami takes ground rather than lives - it is the disaster that punishes Salt
Glands and Driftkin specialists, and the coast it drains stays barren for years.

Ash Winter reads as 8% in that table and that is the harness lying: it only
evolves the world 45 years, so almost nothing carries Photosynthetic Skin yet.
Fired at a 200-year world (`tools/maturetest.js ashwinter 200`) it culls **94%**
and takes Photosynthetic Skin from 8% to 0%. Some disasters can only be judged
against a world that has already specialised.

### Bugs the harness caught

1. **Three disasters threw** `Cannot read properties of undefined`. Their strike
   filters read `c.tile`, which was only ever set inside `updateCreature` - so
   any creature that had not had a tick yet had none. Now set in `spawn` too.
2. **Radiation never decayed.** At 0.006 per visit a solar flare left a global
   kill field for a century, which is why it culled 96% instead of its intended
   66%. Decay raised to 0.05; flare deposit lowered.
3. **The ice never melted.** Thawing happened only inside the ice age's
   `update()`, so whatever was still frozen when the effect ended stayed frozen
   forever. Now `end()` reclassifies every ice tile. This is a general trap and
   is written up as invariant 9 in CLAUDE.md.
4. Eruption (95%) and Ash Winter (measured wrong in both directions) needed
   real tuning, not guesses.

### Verified how

- `tools/disastertest.js`: all 21 fire, none throw, cull percentages above.
- `tools/maturetest.js`: slow disasters against an evolved world.
- **Browser-verified**: no JS errors before or after, 4 tabs and 10 buttons
  built from the registry, 300 sim years at 2036 ticks/s, 6 strains discovered.
- Screenshot of an ice age at its peak: the world white, two clay refuges left,
  eleven survivors, one species struck through as extinct.

### Still not verified

`file://` and touch on a real device. Unchanged from checkpoint 1 - the browser
extension here refuses `file://` URLs outright, so it needs a human to
double-click `index.html` once and confirm.

### Next - checkpoint 4

Living plagues (a disease with its own traits and its own mutations, per the
design doc's section 5 - "the single best system in the game and it's cheap to
build"), the family-tree screen, and copy-paste save codes.

---

## 2026-09-02 - Checkpoint 4: living plagues

A plague in HEIRLOOM is a second organism. It carries four numbers, it hands
them to every strain it spawns, and those numbers drift a little each time it
changes hands. Nothing in the code pushes a disease toward mildness. It falls
out of the mechanics on its own, and it is now observable in a panel while you
watch.

New files: `js/data-plagues.js` (the registry - three seed diseases) and
`js/plague.js` (the engine). Four hooks in `sim.js`, nothing else touched in
the simulation.

### What a plague does

Each lineage has `transmission` (new hosts per year while infectious),
`lethality` (deaths per year), `incubation` and `duration`. A host past
incubation rolls once per tick to pass it to one susceptible neighbour within
about three tiles; 2% of those hand-offs create a mutated strain with its own
name, its own numbers and its own place in the panel. Recovering leaves immune
memory keyed to the lineage root, worth `0.72^n` against a strain `n`
mutations further along - so surviving matters, and a plague that keeps
mutating keeps finding bodies.

Damage runs through the existing `kind` system, so `Grit Lids` already shrugs
off a silica bloom (`resist.silica 0.95`) and `Parthenogenesis` already makes
every disease worse (`resist.disease -0.6`). **No plague names a trait**, same
rule as disasters.

Being sick costs beyond the deaths: infected creatures burn extra reserve and
cannot breed. That, not the body count, is what empties a valley - it takes a
generation out as well.

### The result the doc predicted, measured

`node tools/plaguetest.js glass 120 140` - Bloom of Glass starts at
`spread 3.0, kills 0.55` and after ~50 lineages sits at `spread 8-12,
kills 0.03-0.10`. It became a cold. Nothing selected for that; the strains
that killed their hosts before finding the next one died in those hosts.

Cordyceps Bloom does the opposite, because it has `burst: 1` - it infects a
neighbour when its host dies, so lethality *is* transmission for that one, and
its variants drift *more* vicious (0.95 -> 1.10 -> 1.36). Two opposite
evolutionary regimes out of the same eleven lines of drift code.

### Culls measured (population trough, evolved world)

    Whisper Plague    51-73%     crowd disease, burns out, mutates a lot
    Bloom of Glass    23-73%     goes endemic and harmless instead of dying
    Cordyceps Bloom   83-97%     deliberately the worst thing in the game

Cordyceps sits above the usual 60-90% band on purpose and is labelled as such.
Variance is high because these are epidemics, not pulses.

### Bugs found by running it

1. **A plague could not dent a food-capped population.** Deaths were replaced
   by births within the same year, so a working epidemic read as "nothing
   happened". Fixed by making sickness block breeding and drain reserve.
2. **Bursting bypassed mutation entirely.** Cordyceps spread almost only
   through `burstFrom`, which called `infect` directly, so it never produced a
   single variant. Both routes now go through `Sim.passOn`.
3. **Bursting also bypassed immunity**, so no wave could ever run out of
   hosts and Cordyceps swept the map every time. The partial-immunity roll
   moved into `infect` where both routes see it.
4. **Three different variants were all named "Whisper Plague II"** - the name
   came from generation, and generations are not unique. There is now a
   per-root sequence counter (`sim.plagueSeq`).
5. **Variant names grew a tail** ("Bloom of Glass v16 v17 v18...") because the
   name was derived from the parent's name by stripping a roman-numeral
   suffix, which never matched the arabic fallback past gen 15. Each lineage
   now carries its own `root`.

### Verified how

- `tools/plaguetest.js <base> <grow> <watch>` - new harness; prints the
  population trough, peak infected, every lineage and how its numbers moved.
- **Browser-verified** at <http://localhost:4173/tools/selftest.html>: no JS
  errors before or after, 5 tabs, plague fired and ran 45 years, 54 lineages,
  124 survivors carrying immune memory, panel showing 7 rows, 5247 ticks/s
  (16x speed needs 192).
- Screenshots of the real game with an outbreak running: the Plagues card
  listing five strains with live numbers, and infection pips on the map.

### Still not verified

`file://` and touch on a real device - unchanged since checkpoint 1. The
browser extension here refuses `file://` URLs outright. Nothing added in this
checkpoint uses `fetch`, XHR, modules or any external resource, so it should be
fine, but it wants a human to double-click `index.html` once.

### Next - checkpoint 5

The family-tree screen (the thing people screenshot) and copy-paste text save
codes.

---

## 2026-09-02 - Checkpoint 5: the family tree and save codes

Two things from the design doc's list, both finished and both browser-verified.

### The family tree (`js/tree.js`, the "the tree" button, or press T)

Every species that ever lived, drawn against the years: a bar in its own colour
from the year it was founded to the year it died, a line dropping from its
parent at the moment it split, the traits it gained that its parent did not, its
peak population, and a faint dashed rule at every disaster the player set off,
labelled. A species founded by a disaster carries "after the wildfire" under the
start of its bar.

It is one flat SVG with no interaction and no state - built fresh each time the
sheet opens, so it can never be stale. Verified clean across four generated
worlds with splits, extinctions and up to 16 disasters: every species drawn
exactly once, one split line per child, no NaN anywhere.

The trait line under each name is trimmed to 33 characters with a "+2" tail.
Without that, a species carrying five traits wrote straight across the plot.

### Save codes (`js/save.js`, the "save code" button)

    H1|heirloom-986802600|8447|864:wildfire,...,7367:plague-whisper:28:44

**A save code is not a snapshot. It is the seed plus the list of things you did,
and loading replays them.** That is why a 352-year world with ten disasters fits
in 183 characters - short enough to paste into a chat window on a school
computer, which is what the doc asked for. Loading fast-forwards in 1200-tick
slices so the page keeps painting and can show progress.

This only works because the sim is exactly deterministic, so that got proved
before anything was built on it: `tools/determinism.js` runs the same seed and
schedule twice and compares creature genomes, positions, plague lineages and
world tile sums. Identical. `tools/savetest.js` then plays a world, encodes it,
replays from the code and compares the same things - exact over 240 years and
eight disasters.

**This makes determinism load-bearing rather than a nicety.** One `Math.random`
in the tick and every save code in the world silently restores a *different*
world. Written up as a strengthened invariant 2 in CLAUDE.md.

`Game.fire` is now the only thing that appends to `sim.timeline`, so any future
way for the player to change the world has to go through it or it will not be in
the save.

### Bugs found by running it

1. **The tree drew disaster rules at NaN.** `sim.timeline` records `t` in ticks;
   the tree read `m.year`, which does not exist. Caught by a check that greps
   the generated SVG for NaN/undefined/Infinity - worth keeping, since an SVG
   with a bad coordinate just silently omits the element.
2. **A restored world was one `census()` ahead of the original**, which retires
   spent plague lineages and so reordered `plagues.concat(pastPlagues)`. The
   worlds were identical; the comparison was not order-insensitive. Fixed in
   the test, not the code - ending a restore with a census is correct.
3. **Typing a save code changed the game speed**, because the keyboard handler
   only skipped `INPUT`, not `TEXTAREA`.

### Verified how

- `tools/determinism.js 260` and `tools/savetest.js 240`, both exact.
- **Browser-verified** at <http://localhost:4173/tools/selftest.html>: no JS
  errors, the tree builds 12 bars and 4 split lines for 6 species with clean
  numbers, the save sheet prefills and opens and closes, junk codes are refused,
  and - the important one - the real chunked `SaveCode.restore` running through
  `requestAnimationFrame` reproduced **the same year, population, species,
  plague lineages and every genome and position**.
- Screenshot of the family tree over a 420-year world with a split, an
  extinction and eight wildfires marked.

### Still not verified

`file://` and touch on a real device - unchanged since checkpoint 1. Nothing in
this checkpoint uses `fetch`, XHR, modules or any external resource. One thing
here is genuinely worth a human check: **the Copy button** uses
`document.execCommand('copy')` because the async clipboard API is refused from
`file://`. If it fails the textarea is already selected and the message says to
press Ctrl+C, so the feature degrades rather than breaks - but nobody has
watched it work from a real `file://` page.

### Next

The doc's remaining wants: a proper first-run moment (the game currently starts
mid-sandbox with no framing), and whatever a real playtest turns up. There is
still no auto-disaster timer, deliberately - Tucker chose fully player-driven.

---

## 2026-09-02 - A phone build, for playtesting

Tucker asked for a file he could play on an iPhone 16. Two things were needed.

### One self-contained file (`node tools/bundle.js`)

iOS will not serve a folder of files to Safari, but it will open a single
self-contained `.html` out of the Files app. `tools/bundle.js` inlines the
stylesheet and all seventeen scripts into `HEIRLOOM.html` (about 190 KB) and
**refuses to build** if any source contains `</script` or `<!--`, either of
which would silently end the inline block early, or if any external `src`/`href`
survives. The folder-and-`index.html` build is still the real one; this is a
copy of it.

### A small-screen layout

At 393x852 the desktop layout was unusable: the top bar ran off the right edge,
every disaster button was below the fold, and the panels sat on top of each
other. What changed, all of it behind `@media (max-width:700px),
(max-height:520px)` so the desktop layout is untouched:

- The top bar is allowed to wrap. Because it can then be two or three rows tall,
  **its height is measured in `Game.measureTop` and handed back as `--topH`** -
  every panel hangs off that variable. Guessing a constant was the first thing
  that broke.
- The disaster row scrolls sideways instead of wrapping into five rows.
- The Species, Plagues and Record cards fold to their title bar on a tap.
  The first two start folded on a phone; the Record does not, because it is the
  best thing on the screen - it folds only so the map can be seen whole.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` so the notch and the home
  indicator do not eat the controls.
- `orientationchange` re-measures after a 250ms delay; iOS reports the old size
  if you ask immediately.

The map is 3:2 and a portrait phone is about 1:2.2, so the world can never fill
a portrait screen. The layout leans into the letterbox instead of cropping.

### Verified how

`_phone.html` (a throwaway, gitignored) loads the bundle in two iframes at
exactly 393x852 and 852x393, runs each world 188 years with fires and a plague,
then **reports geometry as numbers**: the box of every panel, anything that
overflows the screen edge, every pair of panels that overlap, and how many
disaster buttons are actually reachable. Both orientations now report *no
overflow, no overlap* with all ten buttons in reach. Screenshots after that were
only a sanity check - the numbers found the problems.

The desktop selftest still passes unchanged, including the new `folding` and
`--topH` steps and an exact save-code round trip.

### Still not verified

**Nothing here has been touched by an actual finger.** The layout was measured
in a desktop browser at iPhone dimensions, which catches overflow and overlap
but not iOS Safari's own chrome, not whether Quick Look in the Files app runs
the page, not pinch-zoom feel, and not whether tap-to-place a disaster is
comfortable. That is exactly what the playtest is for.

---

## 2026-09-02 - Published, because a file does not work on a phone

The single-file build did not run on Tucker's iPhone. The cause is iOS, not the
bundle: tapping an `.html` in the Files app opens **Quick Look**, which renders
the markup but does not execute JavaScript. A self-contained file is the right
answer for a laptop and the wrong one for a phone; only a URL works there.

Publishing it as a Claude Artifact was the next thing tried and the tool refused
outright - reading a file to publish is disabled in this session. So, with
Tucker's go-ahead (public source was his call, not mine):

**<https://tuckerstrachan414-maker.github.io/heirloom/>**

GitHub Pages, `main` at the repo root, so **`git push` is now the deploy**. The
checkpoint tags went up with it. `HEIRLOOM.html` and `HEIRLOOM.artifact.html`
stay gitignored and regenerable from `tools/bundle.js`.

The repository is public, which means `HEIRLOOM-design.md`, `CLAUDE.md` and this
handoff are public too. That is fine for a free browser toy but worth knowing
before anything sensitive goes in them.
