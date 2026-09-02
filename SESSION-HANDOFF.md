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
