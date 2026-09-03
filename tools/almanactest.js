// The almanac is generated HTML, which fails silently: a missing field prints
// "undefined" and a bad number prints "NaN" and the page still looks fine. So
// render every tab against a world that has actually been played, and count.
//
//   node tools/almanactest.js [years]
const fs = require('fs'), path = require('path'), vm = require('vm');

function build() {
  const win = {}; win.window = win;
  win.document = { createElement: () => ({ getContext: () => ({}) }) };
  const ctx = vm.createContext(win);
  for (const f of ['rng', 'data-traits', 'data-strains', 'data-plagues', 'data-biomes',
                   'data-disasters', 'world', 'creature', 'species', 'sim', 'plague',
                   'log', 'almanac'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'),
                    ctx, { filename: f });
  return win;
}

const TICK = 1 / 24;
const win = build();
const YEARS = Number(process.argv[2] || 220);
const SEED = 'almanac-check';

const log = new win.Log(null);
const sim = new win.Sim({ seed: SEED, log: log });
sim.computeCoast();
sim.timeline = [];
const narr = new win.Narrator(sim, log);
sim.onYear = narr.year.bind(narr); sim.onDisaster = narr.disaster.bind(narr);
sim.onExtinct = narr.extinct.bind(narr); sim.onSplit = narr.split.bind(narr);
sim.onStrain = narr.strain.bind(narr); sim.onEffectEnd = narr.effectEnd.bind(narr);
sim.onPlague = narr.plague.bind(narr); sim.onPlagueEnd = narr.plagueEnd.bind(narr);
const hue0 = sim.rng.range(0, 360);
for (let k = 0; k < 2; k++) sim.seedSpecies(38, 0, hue0 + k * 137.5);
sim.census();

// Fire a spread of rows so the "you have used it" side has something in it.
// Enough to leave marks all over the almanac, spaced out enough that the
// world is still alive at the end - a dead world exercises none of the
// "carried by N right now" side of the page.
const PLAN = [[20, 'wildfire'], [60, 'eruption'], [100, 'plague-whisper'],
              [140, 'meteor'], [170, 'greenreturn'], [200, 'ironrain']];
let pi = 0;
for (let i = 0; i < 24 * YEARS; i++) {
  while (pi < PLAN.length && PLAN[pi][0] * 24 === i) {
    const sp = sim.livingSpecies().sort((a, b) => b.pop - a.pop)[0];
    const at = Math.round(sim.year * 24);
    const opts = sp ? { x: Math.round(sp.cx), y: Math.round(sp.cy) } : {};
    if (sim.trigger(PLAN[pi][1], opts)) {
      sim.timeline.push({ t: at, id: PLAN[pi][1], name: win.Disasters.BY_ID[PLAN[pi][1]].name,
                          x: opts.x, y: opts.y });
    }
    pi++;
  }
  sim.tick(TICK); sim.world.dirty.length = 0;
}

console.log('world: seed ' + SEED + ', year ' + Math.floor(sim.year) + ', ' +
            sim.aliveCount + ' alive, ' + sim.livingSpecies().length + ' species, ' +
            sim.timeline.length + ' of ' + PLAN.length + ' events landed');

// ---- what the world says it has shown the player -------------------------
function count(mask, n) { let c = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) c++; return c; }
const TN = win.Traits.ALL.length, BN = win.Biomes.ALL.length;
console.log('seen: ' + count(sim.seenTraits, TN) + '/' + TN + ' traits, ' +
            Object.keys(sim.seenStrains).length + '/' + win.Strains.ALL.length + ' strains+flaws, ' +
            count(sim.seenBiomes, BN) + '/' + BN + ' biomes, ' +
            Object.keys(sim.seenPlagues).length + '/' + win.PlagueData.SEEDS.length + ' plagues');

// The years must be real years inside the run, not -1 leftovers or NaN.
let badYear = 0;
for (let i = 0; i < TN; i++) {
  const seen = (sim.seenTraits & (1 << i)) !== 0, y = sim.traitYear[i];
  if (seen && !(y >= 0 && y <= sim.year)) badYear++;
  if (!seen && y !== -1) badYear++;
}
for (const k in sim.seenStrains) {
  const y = sim.seenStrains[k];
  if (!(y >= 0 && y <= sim.year)) badYear++;
}
console.log('first-seen years: ' + (badYear ? 'BAD (' + badYear + ' wrong)' : 'all inside the run'));

// The map has to add up to exactly the map.
let tiles = 0;
for (let i = 0; i < BN; i++) tiles += sim.biomeCount[i];
console.log('biome census: ' + tiles + ' tiles counted of ' + sim.world.n +
            (tiles === sim.world.n ? '  (exact)' : '  MISMATCH'));

// ---- render every tab ----------------------------------------------------
let bad = 0;
for (const showAll of [false, true]) {
  for (const t of win.Almanac.TABS) {
    let html;
    try { html = win.Almanac.page(sim, t.id, showAll); }
    catch (e) { console.log('  ' + t.id + ' THREW ' + e.message); bad++; continue; }
    const junk = (html.match(/NaN|undefined|Infinity|\[object/g) || []);
    const cards = (html.match(/class="alm[ "]/g) || []).length;
    const got = (html.match(/class="alm(?: [^"]*)? got"/g) || []).length;
    if (junk.length) bad++;
    if (!showAll) {
      console.log('  ' + t.id.padEnd(10) + ' ' + String(html.length).padStart(6) + ' chars, ' +
                  String(cards).padStart(3) + ' cards, ' + String(got).padStart(3) + ' of them found' +
                  (junk.length ? '   JUNK: ' + junk.join(',') : ''));
    } else if (junk.length) {
      console.log('  ' + t.id + ' (revealed)  JUNK: ' + junk.join(','));
    }
  }
}

// Unbalanced tags would break the sheet layout without any error at all.
for (const t of win.Almanac.TABS) {
  const h = win.Almanac.page(sim, t.id, false);
  const open = (h.match(/<div/g) || []).length, close = (h.match(/<\/div>/g) || []).length;
  if (open !== close) { console.log('  ' + t.id + ': ' + open + ' <div> vs ' + close + ' </div>'); bad++; }
}

// A hidden strain must not leak its recipe into the page.
const hidden = win.Strains.ALL.filter(s => sim.seenStrains[s.id] === undefined);
const page = win.Almanac.page(sim, 'strains', false);
let leaked = 0;
for (const s of hidden) if (page.indexOf(s.desc.slice(0, 24)) >= 0) leaked++;
console.log('secrets: ' + hidden.length + ' strains not found here, ' +
            (leaked ? 'BUT ' + leaked + ' LEAKED their text' : 'none leaked'));
if (leaked) bad++;
const revealed = win.Almanac.page(sim, 'strains', true);
let shown = 0;
for (const s of hidden) if (revealed.indexOf(s.desc.slice(0, 24)) >= 0) shown++;
console.log('reveal toggle: shows ' + shown + ' of the ' + hidden.length + ' hidden ones');
if (hidden.length && shown !== hidden.length) bad++;

// Every disaster should name something that survives it, or the page is empty
// where it matters most.
let mute = [];
for (const d of win.Disasters.available(win.SimConfig.checkpoint)) {
  if (!win.Almanac.survivors(d).length) mute.push(d.id);
}
console.log('selection: ' + (mute.length ? mute.length + ' disasters name nothing (' +
            mute.join(', ') + ')' : 'every disaster names what tends to survive it'));

// The whole point of the derivation: fire has to find Ashlung on its own.
const fire = win.Almanac.survivors(win.Disasters.BY_ID.wildfire);
console.log('wildfire selects for: ' + fire.join(', '));
if (fire.indexOf('Ashlung') < 0) { console.log('  Ashlung is missing from that list'); bad++; }

console.log(bad ? 'ALMANAC: ' + bad + ' PROBLEM(S)' : 'ALMANAC OK');
process.exit(bad ? 1 : 0);
