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
    js/data-plagues.js  THE PLAGUE REGISTRY - 3 seed diseases
    js/data-biomes.js   biome table
    js/data-disasters.js THE DISASTER REGISTRY - 21 written + 3 generated
                        from the plague rows, + 1 internal
    js/world.js         tiles, terrain generation, food, fire, climate
    js/creature.js      genome -> derived stats (window.Genome)
    js/species.js       species records, trait-derived naming, colour
    js/sim.js           the tick: movement, eating, hazards, breeding, census
    js/plague.js        infection, contagion, mutation, immune memory
    js/log.js           the log and the narrator
    js/render.js        terrain cache + trait-baked creature sprites + camera
    js/tree.js          the family tree, built as one flat SVG
    js/save.js          save codes: seed + what you did, replayed on load
    js/ui.js            panels, species list, inspector, disaster buttons
    js/main.js          boot, frame loop, input

    tools/headless.js   run the sim with no browser (the main tuning tool)
    tools/firetest.js   measures whether a disaster actually selects for a trait
    tools/profile.js    per-phase timing
    tools/selftest.html in-browser smoke test; reports numbers, not vibes
    tools/patch.js      exact-string file patcher (there is no Edit tool here)
    tools/plaguetest.js drops a plague on a grown world and follows the lineages
    tools/determinism.js  proves the same seed and schedule replays identically
    tools/savetest.js   plays a world, encodes it, replays it, compares everything
    tools/visual-driver.js  drives the real game for screenshots

## Invariants - do not break these

1. **No build step, and `file://` must keep working.** Classic `<script src>`
   only. ES modules, `fetch`, and XHR all fail from `file://`. There are
   currently zero external resources; keep it that way.
2. **All simulation randomness goes through `sim.rng`.** Never `Math.random` in
   sim code. The one deliberate exception is the cosmetic screen-shake jitter
   in `render.js`, which nothing reads back.

   Since checkpoint 5 this is **load-bearing, not a nicety**: a save code is
   the seed plus the list of things the player did, and loading replays them.
   One `Math.random` anywhere in the tick and every save code in the world
   silently restores a different world. `tools/determinism.js` and
   `tools/savetest.js` exist to catch exactly that - run them after touching
   anything in the tick.
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
10. **Nothing makes a plague evolve mild. It has to stay emergent.** A
    strain's numbers only ever drift symmetrically (`Plague.drift`); which
    strains survive is decided entirely by whether they find a new host
    before killing the one they have. Never add a rule that nudges
    lethality down - the whole point is that the player watches it happen
    and no line of code did it. `Cordyceps Bloom` drifting *more* lethal,
    because `burst` makes dying its way of travelling, is the proof the
    mechanism is real and not a scripted story.

11. **Every route a plague takes to a new host goes through `Sim.passOn`.**
    It is where mutation happens, and `Sim.infect` is where immunity is
    rolled. Bursting once bypassed both: no variants ever appeared and no
    epidemic could run out of hosts.

12. **Target cull is 60-90%,** measured as the population *trough*, not the
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
    eatRate        1.40      how much over upkeep a creature tries to take
    deplete        0.32      how hard grazing strips a tile
    checkpoint     4         which disaster rows the UI offers
    mateChoosiness 9         weight on genome similarity when picking a mate.
                             LOAD-BEARING: without it a novel combination is
                             halved every generation by mating back into the
                             majority, no cluster grows, and nothing speciates.

    HAZ            per-year death rates by hazard. Applied as rate*dt, so keep
                   rate*dt well under 1 or the linear form overstates the odds.
    RANGE   (20)   home-range radius. A species that spreads evenly over the map
                   can never be caught by one disaster and nothing dramatic ever
                   happens. This number is load-bearing.

## Save codes

    H1|<seed>|<ticks>|<tick>:<disaster>[:<x>:<y>],...

Not a snapshot - a replay log, which is why a five-hundred-year world fits in
under 200 characters and can be pasted into a chat window. `Game.fire` is the
only thing that appends to `sim.timeline`, so anything the player does must go
through it or it will not be in the save. Loading fast-forwards in 1200-tick
slices so the page keeps painting.

A code naming a disaster that no longer exists skips that event rather than
refusing the whole code. Bump the `H1` tag if a change ever makes old codes
restore a *different* world - a silently wrong world is much worse than a
rejected one.

`SplitConfig` in `js/sim.js` governs speciation: `minDist` traits away from the
species norm, `minGroup` creatures holding that genome, sustained `years` years,
from a parent of at least `minParent`.

`js/plague.js`: `MEMORY_DECAY` (0.72) is what surviving a strain is worth
against one a mutation further along, and it is the knob that decides
whether an epidemic burns out or grinds on forever. `DRIFT.chance` (0.02,
in `js/data-plagues.js`) is how often changing hands makes a new lineage;
`MAX_LIVE` (14) caps how many exist at once.

A plague seed row is worth roughly `transmission x (time it survives while
infectious) + burst` new cases per host. Under about 1 it dies in its first
few bodies - `tools/plaguetest.js` prints that number as `R`.

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
    node tools/plaguetest.js <base> <grow> <watch>     # follow a plague's lineages
    node tools/determinism.js <years>                  # same seed twice, compared
    node tools/savetest.js <years>                     # play, encode, replay, compare

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

then open `_visual.html?r=1#y=90&fire&burn=2&pause`; other hash options are
`every=<years>`, `cast=<disaster-id>`, `then=<years>`, `zoom`, `inspect`,
`tree` and `savecode`. Hash-only URL changes do
not reload the page - always bump the `?r=` query too.

## Environment notes

- There is no Edit/Write tool in this setup; files are written with `cat`
  heredocs and patched with `node tools/patch.js`.
- Bash heredocs here truncate around 10KB - write long files in chunks.
- **A quoted heredoc still collapses a doubled backslash.** Writing a JS
  patch script containing `\s` delivers `s`, which the JS string then
  reads as plain `s`, and the patch silently fails to match. Never put a
  regex escape inside a heredoc; rewrite the whole file instead, or build
  the character with `String.fromCharCode`.
- **Never nest a Python heredoc inside a bash heredoc.** The double layer
  strips a backslash, which silently turned `join('\n')` into a raw newline
  inside a string literal and produced an unreachable parse error.
- PowerShell mangles UTF-8 on write; use `cat`/node for source files.
