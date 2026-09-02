# HEIRLOOM - project notes

A creature-evolution sandbox. You seed plain creatures, leave them alone, and
poke the world with disasters. Whatever survives is the new normal.

Design source of truth: `HEIRLOOM-design.md` (Tucker's doc). Read it first.

## Decisions taken (2026-09-01, with Tucker)

- **Free browser toy / itch.io**, not a paid Steam title. Sandbox-focused.
- **26 traits, 12 strains** - the doc's own advice over shipping all ~52.
- **Disasters are fully player-driven.** No auto-timer. Click a disaster, click
  the map. Tucker chose this explicitly over a timer; do not add one without
  asking.
- Lives in `C:\Local AI\Claude Projects\heirloom` per the workspace layout rule.

## Running it

Open `index.html`. That is the whole story - no build step, no server.
It must stay that way (see invariants).

For verification only, `node tools/serve.js` serves it on
<http://localhost:4173>; the browser extension refuses `file://` navigation, so
automated checks go through HTTP.

## Layout

    index.html          DOM shell; loads every script in dependency order
    css/style.css       all styling
    js/rng.js           seeded RNG (mulberry32)
    js/data-traits.js   THE TRAIT REGISTRY - 26 rows
    js/data-strains.js  THE STRAIN REGISTRY - 12 synergies + 6 flaws
    js/data-disasters.js THE DISASTER REGISTRY - 21 offered + 1 internal
    js/data-biomes.js   biome table
    js/data-disasters.js THE DISASTER REGISTRY
    js/world.js         tiles, terrain generation, food, fire, climate
    js/creature.js      genome -> derived stats (window.Genome)
    js/species.js       species records, trait-derived naming, colour
    js/sim.js           the tick: movement, eating, hazards, breeding, census
    js/log.js           the log and the narrator
    js/render.js        terrain cache + trait-baked creature sprites + camera
    js/ui.js            panels, species list, inspector, disaster buttons
    js/main.js          boot, frame loop, input

    tools/headless.js   run the sim with no browser (the main tuning tool)
    tools/firetest.js   measures whether a disaster actually selects for a trait
    tools/profile.js    per-phase timing
    tools/selftest.html in-browser smoke test; reports numbers, not vibes
    tools/patch.js      exact-string file patcher (there is no Edit tool here)
    tools/visual-driver.js  drives the real game for screenshots

## Invariants - do not break these

1. **No build step, and `file://` must keep working.** Classic `<script src>`
   only. ES modules, `fetch`, and XHR all fail from `file://`. There are
   currently zero external resources; keep it that way.
2. **All simulation randomness goes through `sim.rng`.** Never `Math.random` in
   sim code, or seeds stop reproducing. The one deliberate exception is the
   cosmetic screen-shake jitter in `render.js`.
3. **Adding a trait = appending one row to `TRAITS`.** Nothing else should need
   to know it exists. Same for `DISASTERS` and `STRAINS` (which holds both
   synergies and anti-synergies: `need` plus optional `without`).
4. **Disasters change the world; creatures die from the tile they stand on.**
   A disaster must never check for a trait by name. This is why a wildfire
   selects for Ashlung without anything anywhere mentioning Ashlung.
5. **The mercy rule stays.** `Sim.mercy()` makes a species steeply harder to
   kill below `safeFloor`. Without it every run ends in an empty world.
6. **Derived stats are cached per genome mask** in `Genome.derive`. A new
   `mods` key must be folded in there or it silently does nothing.
7. **`world.dirty` must be drained every frame** by `Renderer.flushDirty`.
   Anything running the sim without a renderer has to clear it itself, or the
   array grows without bound.
8. **Biome `food` is food/year at full stock**, directly comparable to a
   creature's upkeep (2.2/yr before traits). These two numbers being on
   different scales was the first serious bug in this project.
9. **A slow disaster must undo itself in `end()`.** Anything its `update()`
   changed - climate values, frozen tiles, flooded tiles - is still changed
   when the effect is removed, and `update` is no longer running to put it
   back. An ice age that forgot this left the world frozen permanently.
10. **Target cull is 60-90%,** measured as the population *trough*, not the
    figure some years later - the world refills fast enough to hide a real
    disaster completely. Habitat disasters (Deluge, Tsunami, Sea Rise) cull far
    less on purpose: they take ground rather than lives, and they exist to
    punish coastal specialists.

## Balance knobs

`SimConfig` in `js/sim.js`:

    worldW/worldH  72 x 48   the doc's one-screen scale
    popCap         420       hard ceiling; food scarcity should do most of the work
    safeFloor      12        below this, the mercy curve protects a species
    mutChance      0.08      per birth (the doc's number)
    breedAt/Cost   0.62/0.34 fraction of energy reserve to breed / to spend
    eatRate        1.55      how much over upkeep a creature tries to take
    deplete        0.55      how hard grazing strips a tile
    checkpoint     3         which disaster rows the UI offers
    mateChoosiness 9         weight on genome similarity when picking a mate.
                             LOAD-BEARING: without it a novel combination is
                             halved every generation by mating back into the
                             majority, no cluster grows, and nothing speciates.

    HAZ            per-year death rates by hazard. Applied as rate*dt, so keep
                   rate*dt well under 1 or the linear form overstates the odds.
    RANGE   (20)   home-range radius. A species that spreads evenly over the map
                   can never be caught by one disaster and nothing dramatic ever
                   happens. This number is load-bearing.

`SplitConfig` in `js/sim.js` governs speciation: `minDist` traits away from the
species norm, `minGroup` creatures holding that genome, sustained `years` years,
from a parent of at least `minParent`.

`js/world.js`: `FIRE_FALL` / `FIRE_MIN` bound how far a fire carries. A fire
front loses strength each tile it spreads; below `FIRE_MIN` it dies. Raising
`FIRE_FALL` toward 1 makes fires eat the whole map.

## Testing

    node tools/headless.js <seed> <years> <fireEvery>   # population, traits, log
    node tools/firetest.js <seed> <every> <years> aimed # does fire select for Ashlung?
    node tools/profile.js  <seed> <years>               # per-phase timing
    node tools/splittest.js <seed> <years> <fireEvery>  # why is nothing speciating?
    node tools/disastertest.js                         # fires all 21, reports cull %
    node tools/maturetest.js <id> <growYears>          # fire one at an evolved world

`disastertest.js` takes about 90 seconds - run it in the background. It is the
only thing that catches a disaster row that throws, does nothing, or wipes the
map, and it has caught all three.

Then in a browser: `node tools/serve.js` and open
<http://localhost:4173/tools/selftest.html>. It prints errors, canvas colour
counts, in-browser tick rate, and drives a real fire. **The headless harness
does not load `render.js` or `ui.js`** - a renderer bug will pass every Node
test and only show up in `selftest.html`. That has already happened once.

To rebuild the screenshot page:

    node -e "const f=require('fs');f.writeFileSync('_visual.html',f.readFileSync('index.html','utf8').replace('</body>','<script src=\"tools/visual-driver.js\"></script></body>'))"

then open `_visual.html?r=1#y=90&fire&burn=2&pause`. Hash-only URL changes do
not reload the page - always bump the `?r=` query too.

## Environment notes

- There is no Edit/Write tool in this setup; files are written with `cat`
  heredocs and patched with `node tools/patch.js`.
- Bash heredocs here truncate around 10KB - write long files in chunks.
- **Never nest a Python heredoc inside a bash heredoc.** The double layer
  strips a backslash, which silently turned `join('\n')` into a raw newline
  inside a string literal and produced an unreachable parse error.
- PowerShell mangles UTF-8 on write; use `cat`/node for source files.
