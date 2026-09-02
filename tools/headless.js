// Run HEIRLOOM's simulation with no browser. Sim modules touch no DOM.
// Usage: node tools/headless.js [seed] [years] [fireEvery]
const fs = require('fs'), path = require('path'), vm = require('vm');

const win = {};
win.window = win;
win.document = { createElement: function () { return { getContext: function () { return {}; } }; } };
win.performance = { now: function () { return Date.now(); } };
const ctx = vm.createContext(win);

for (const f of ['rng', 'data-traits', 'data-strains', 'data-biomes', 'data-disasters',
                 'world', 'creature', 'species', 'sim', 'log']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: f + '.js' });
}

const seed = process.argv[2] || 'test-1';
const YEARS = Number(process.argv[3] || 400);
const FIRE_EVERY = Number(process.argv[4] || 60);
const TICK = 1 / 24;

const log = new win.Log(null);
const sim = new win.Sim({ seed: seed, log: log });
sim.computeCoast();
const narr = new win.Narrator(sim, log);
sim.onYear = narr.year.bind(narr);
sim.onDisaster = narr.disaster.bind(narr);
sim.onExtinct = narr.extinct.bind(narr);
for (let k = 0; k < 2; k++) sim.seedSpecies(30, 0);
sim.census();

const T = win.Traits;
const fireLog = [];
function countBurnt(s) { let n = 0; for (let i = 0; i < s.world.n; i++) if (s.world.ash[i] > 0.05) n++; return n; }
const t0 = Date.now();
let nextFire = FIRE_EVERY, ticks = 0;
const curve = [];

while (sim.year < YEARS) {
  sim.tick(TICK); ticks++;
  sim.world.dirty.length = 0;   // no renderer here to consume it
  if (FIRE_EVERY > 0 && sim.year >= nextFire) {
    nextFire += FIRE_EVERY;
    const popBefore = sim.aliveCount, burntBefore = countBurnt(sim);
    sim.trigger('wildfire', {});
    fireLog.push({ y: Math.floor(sim.year), pop: popBefore, burntBefore: burntBefore });
  }
  if (fireLog.length && !fireLog[fireLog.length - 1].done && sim.year > fireLog[fireLog.length - 1].y + 8) {
    const f = fireLog[fireLog.length - 1];
    f.done = true; f.after = sim.aliveCount; f.burnt = countBurnt(sim) - f.burntBefore;
  }
  if (Math.floor(sim.year) % 25 === 0 && curve[curve.length - 1] !== Math.floor(sim.year)) {
    curve.push(Math.floor(sim.year));
    curve.push(sim.aliveCount);
  }
}
const ms = Date.now() - t0;

console.log('=== HEIRLOOM headless: seed "' + seed + '", ' + YEARS + ' yr, fire every ' + FIRE_EVERY + ' ===');
console.log('perf      : ' + ticks + ' ticks in ' + ms + 'ms  (' + (ticks / (ms / 1000)).toFixed(0) + ' ticks/s)');
console.log('alive     : ' + sim.aliveCount + '   born ' + sim.stats.born + '   died ' + sim.stats.died);
console.log('deaths    : ' + JSON.stringify(sim.stats));
const liveC = sim.creatures.filter(c => c.alive);
const tc = liveC.map(c => c.d.traits.length);
const hist = {}; tc.forEach(n => hist[n] = (hist[n]||0)+1);
console.log('traits/ea : avg ' + (tc.reduce((a,b)=>a+b,0)/Math.max(1,tc.length)).toFixed(2) +
  '   spread ' + Object.keys(hist).sort().map(k => k+':'+hist[k]).join(' '));
console.log('upkeep    : avg ' + (liveC.reduce((a,c)=>a+c.d.upkeep,0)/Math.max(1,liveC.length)).toFixed(2));
console.log('strains   : ' + (sim.discovered.size ? [...sim.discovered].join(', ') : 'none discovered'));
console.log('genomes   : ' + new Set(sim.creatures.filter(c => c.alive).map(c => c.mask)).size + ' distinct');
let pc = '';
for (let i = 0; i < curve.length; i += 2) pc += curve[i] + ':' + curve[i + 1] + ' ';
console.log('pop curve : ' + pc);

for (const sp of sim.species) {
  const rows = [];
  for (let i = 0; i < T.ALL.length; i++) {
    if (sp.pop && sp.traitCount[i] / sp.pop > 0.02) {
      rows.push(T.ALL[i].name + ' ' + Math.round(sp.traitCount[i] / sp.pop * 100) + '%');
    }
  }
  console.log('  ' + sp.plural().padEnd(16) + ' pop ' + String(sp.pop).padStart(4) +
    '  peak ' + String(sp.peakPop).padStart(4) + '  gen ' + String(sp.generations).padStart(3) +
    (sp.extinct !== null ? '  EXTINCT y' + sp.extinct : '') +
    (rows.length ? '\n      ' + rows.join(', ') : '  (plain)'));
}
console.log('fires     : ' + fireLog.map(f => 'y' + f.y + ' ' + f.pop + '->' + (f.after === undefined ? '?' : f.after) + ' (' + (f.burnt === undefined ? '?' : f.burnt) + ' tiles)').join('  '));
console.log('--- last 22 log lines ---');
console.log(log.lines.slice(-22).map(l => '  ' + l.text).join('\n'));
