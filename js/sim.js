// HEIRLOOM - the simulation.
//
// One tick advances every creature by `dt` years. Creatures do not know what
// disasters exist; they only know the tile they are standing on. All selection
// falls out of that.

(function (global) {
  'use strict';

  const T = global.Traits, G = global.Genome, SP = global.SpeciesLib;
  const BIOMES = global.Biomes.ALL;
  const LAVA = global.Biomes.I.lava;

  const CFG = {
    worldW: 72, worldH: 48,   // the doc's one-screen scale, a little roomier
    popCap: 420,
    safeFloor: 12,       // below this a species gets steeply harder to kill
    mutChance: 0.08,     // per birth
    breedAt: 0.62,       // fraction of energy reserve needed to breed
    breedCost: 0.34,
    breedCool: 1.6,      // years between litters
    mateChoosiness: 9,   // weight on genome similarity when picking a mate
    eatRate: 1.40,       // how much more than upkeep a creature tries to take
    deplete: 0.32,       // how hard grazing strips a tile
    checkpoint: 2
  };

  // Rates are per year and applied as rate*dt, so keep rate*dt well under 1
  // or the linear approximation starts overstating the odds.
  const HAZ = { fire: 8, lava: 24, ash: 1.2, drown: 6, rad: 1.6 };

  function Sim(opts) {
    this.rng = new global.Rng(opts.seed);
    this.seedText = String(opts.seed);
    this.world = new global.World(opts.w || CFG.worldW, opts.h || CFG.worldH, this.rng);
    this.creatures = [];
    this.species = [];
    this.namesTaken = new Set();
    // Checkpoint 2 opens the whole registry. Pass opts.pool to narrow it.
    this.pool = opts.pool || T.ALL.map(function (t) { return t.id; });
    this.discovered = new Set();
    this.log = opts.log;
    this.year = 0;
    this.lastYearMark = 0;
    this.nextId = 1;
    this.births = [];
    // `total` is every death; the rest are causes. Keeping a separate total
    // matters because 'died' (old age) is itself one of the causes.
    this.stats = { born: 0, total: 0, died: 0, burned: 0, starved: 0, frozen: 0, cooked: 0, drowned: 0 };
    this.aliveCount = 0;
    this.newGenomes = 0;
    this.events = [];
    this.yearStats = null;
    this.resetYearStats();
    this.shakeAmt = 0;
    this.washColor = null; this.washAmt = 0;
    this.flashes = [];

    // spatial grid for mate-finding and, later, contagion
    this.cell = 4;
    this.gw = Math.ceil(this.world.w / this.cell);
    this.gh = Math.ceil(this.world.h / this.cell);
    this.grid = [];
    for (let i = 0; i < this.gw * this.gh; i++) this.grid.push([]);
  }

  Sim.prototype.resetYearStats = function () {
    this.yearStats = { born: 0, total: 0, died: 0, burned: 0, starved: 0, frozen: 0, cooked: 0, drowned: 0 };
  };

  Sim.prototype.shake = function (a) { this.shakeAmt = Math.max(this.shakeAmt, a); };
  Sim.prototype.wash = function (c, a) { this.washColor = c; this.washAmt = Math.max(this.washAmt, a); };

  Sim.prototype.regionName = function (x, y) {
    const w = this.world.w, h = this.world.h;
    const ns = y < h * 0.33 ? 'north' : y > h * 0.67 ? 'south' : '';
    const ew = x < w * 0.33 ? 'west' : x > w * 0.67 ? 'east' : '';
    if (ns && ew) return 'the ' + ns + '-' + ew;
    if (ns) return 'the ' + ns;
    if (ew) return 'the ' + ew;
    return 'the heartland';
  };

  // ---- seeding ----------------------------------------------------------
  Sim.prototype.livableTile = function () {
    const w = this.world;
    for (let k = 0; k < 900; k++) {
      const i = this.rng.int(w.n);
      const bi = BIOMES[w.biome[i]];
      if (bi.wet > 0 || bi.food < 2.5) continue;
      const t = w.tempAt(i);
      if (t < 0.28 || t > 0.95) continue;
      return i;
    }
    return (w.n / 2) | 0;
  };

  Sim.prototype.seedSpecies = function (count, mask, hue) {
    const home = this.livableTile();
    const hx = home % this.world.w, hy = (home / this.world.w) | 0;
    mask = mask || 0;
    const sp = new SP.Species({
      name: SP.nameFor(mask, this.rng, this.namesTaken),
      hue: hue !== undefined ? hue : SP.hueFor(mask, this.rng, null),
      coreMask: mask,
      founded: 0
    });
    this.species.push(sp);

    for (let k = 0; k < count; k++) {
      const x = Math.max(1, Math.min(this.world.w - 2, hx + this.rng.gauss() * 4));
      const y = Math.max(1, Math.min(this.world.h - 2, hy + this.rng.gauss() * 4));
      this.spawn(sp, mask, x, y, this.rng.range(1, 8));
    }
    return sp;
  };

  Sim.prototype.spawn = function (sp, mask, x, y, age) {
    const d = G.derive(mask);
    const c = {
      id: this.nextId++,
      sp: sp,
      mask: mask,
      d: d,
      x: x, y: y,
      hx: this.rng.range(-1, 1), hy: this.rng.range(-1, 1),
      age: age || 0,
      sex: this.rng.int(2),
      energy: d.reserve * 0.55,
      starve: 0,
      cool: this.rng.range(0, CFG.breedCool),
      think: this.rng.range(0, 0.4),
      dormant: 0,
      asleep: 0,
      alive: true,
      born: this.year,
      wob: this.rng.range(0, 6.283)
    };
    this.creatures.push(c);
    this.aliveCount++;
    sp.pop++; sp.born++;
    if (sp.pop > sp.peakPop) sp.peakPop = sp.pop;
    return c;
  };

  // ---- spatial grid -----------------------------------------------------
  Sim.prototype.buildGrid = function () {
    const g = this.grid;
    for (let i = 0; i < g.length; i++) if (g[i].length) g[i].length = 0;
    const cs = this.cell, gw = this.gw, gh = this.gh;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      let gx = (c.x / cs) | 0, gy = (c.y / cs) | 0;
      if (gx < 0) gx = 0; else if (gx >= gw) gx = gw - 1;
      if (gy < 0) gy = 0; else if (gy >= gh) gy = gh - 1;
      c.g = gy * gw + gx;
      g[c.g].push(c);
    }
  };

  Sim.prototype.nearby = function (c, out) {
    out.length = 0;
    const gx = c.g % this.gw, gy = (c.g / this.gw) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= this.gw || ny >= this.gh) continue;
        const cell = this.grid[ny * this.gw + nx];
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
    return out;
  };

  // ---- where a creature would rather be ---------------------------------
  Sim.prototype.computeCoast = function () {
    const w = this.world;
    this.coast = new Uint8Array(w.n);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x;
        if (w.isWet(i)) continue;
        let touch = 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (w.inBounds(nx, ny) && w.isWet(ny * w.w + nx)) touch = 1;
        }
        this.coast[i] = touch;
      }
    }
  };

  Sim.prototype.tileScore = function (c, i) {
    const w = this.world, d = c.d;
    const bi = BIOMES[w.biome[i]];
    if (bi.wet > 0 && !d.swim) return -1000;
    if (w.biome[i] === LAVA) return -900;

    let s = w.foodAt(i) * d.forage;
    if (d.sunFood) s += d.sunFood * w.lightAt(i) * 0.4;
    if (d.radFood) s += d.radFood * w.rad[i] * 0.4;
    if (d.coastFood && this.coast[i]) s += d.coastFood * 0.4;
    if (w.burn[i] > 0) s -= 60 * w.fireStr[i] * (1 - d.rFire);
    if (w.ash[i] > 0) s -= w.ash[i] * 12 * (1 - d.rAsh);

    const t = w.tempAt(i);
    if (t < d.tempLo) s -= (d.tempLo - t) * 34 * (1 - d.rCold);
    else if (t > d.tempHi) s -= (t - d.tempHi) * 34 * (1 - d.rHeat);
    return s;
  };

  const TAU = Math.PI * 2;
  const RANGE = 20;                 // how far a creature strays from its kind

  Sim.prototype.wander = function (c, dt) {
    const w = this.world, d = c.d;
    if (d.rooted) return;

    c.think -= dt;
    if (c.think <= 0) {
      c.think = this.rng.range(0.25, 0.55);
      const v = Math.max(1.5, d.vision);
      let bestS = -Infinity, bx = c.hx, by = c.hy;
      for (let k = 0; k < 4; k++) {
        const a = (k === 0 && (c.hx || c.hy))
          ? Math.atan2(c.hy, c.hx) + this.rng.range(-0.5, 0.5)
          : this.rng.next() * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = c.x + ca * v, ny = c.y + sa * v;
        if (!w.inBounds(nx | 0, ny | 0)) continue;
        const s = this.tileScore(c, ((ny | 0) * w.w) + (nx | 0)) + this.rng.range(0, 0.35);
        if (s > bestS) { bestS = s; bx = ca; by = sa; }
      }
      // Home range. A species that smears itself evenly across the map can
      // never be caught by one disaster, and nothing dramatic ever happens.
      // Beyond RANGE tiles from its own centre a creature drifts back; the
      // last few of a kind head home hard, or they die alone and scattered.
      const sp = c.sp;
      if (sp.cx !== undefined) {
        const dx = sp.cx - c.x, dy = sp.cy - c.y;
        const m = Math.sqrt(dx * dx + dy * dy);
        const pull = sp.pop <= 10 ? 0.65 : (m > RANGE ? 0.30 : 0);
        if (pull > 0 && m > 2) {
          bx = bx * (1 - pull) + (dx / m) * pull;
          by = by * (1 - pull) + (dy / m) * pull;
        }
      }
      c.hx = bx; c.hy = by;
    }

    const bi = BIOMES[w.biome[c.tile]];
    const step = d.speed * bi.walk * dt;
    let nx = c.x + c.hx * step, ny = c.y + c.hy * step;
    if (nx < 0.5) { nx = 0.5; c.hx = -c.hx; }
    if (ny < 0.5) { ny = 0.5; c.hy = -c.hy; }
    if (nx > w.w - 1.5) { nx = w.w - 1.5; c.hx = -c.hx; }
    if (ny > w.h - 1.5) { ny = w.h - 1.5; c.hy = -c.hy; }

    const ni = ((ny | 0) * w.w) + (nx | 0);
    if (BIOMES[w.biome[ni]].wet > 0 && !d.swim) {
      // Cannot enter water. Turn and try again shortly.
      c.hx = -c.hx; c.hy = -c.hy; c.think = 0;
      return;
    }
    c.x = nx; c.y = ny;
  };

  // ---- death ------------------------------------------------------------
  Sim.prototype.kill = function (c, cause) {
    if (!c.alive) return;
    c.alive = false;
    c.cause = cause;
    this.aliveCount--;
    c.sp.pop--; c.sp.died++;
    this.stats.total++; this.yearStats.total++;
    if (this.yearStats[cause] !== undefined) { this.yearStats[cause]++; this.stats[cause]++; }
    this.flashes.push({ x: c.x, y: c.y, t: 1, c: cause });
    if (this.flashes.length > 260) this.flashes.shift();
  };

  // The mercy rule: a disaster is never allowed to take the last handful of a
  // species outright. Without this the game ends in silence every time.
  Sim.prototype.mercy = function (c) {
    const p = c.sp.pop;
    if (p > CFG.safeFloor) return 1;
    if (p <= 1) return 0.02;
    return 0.02 + 0.98 * Math.pow((p - 1) / (CFG.safeFloor - 1), 2.2);
  };

  Sim.prototype.hazards = function (c, dt) {
    const w = this.world, d = c.d, i = c.tile;
    let rate = 0, cause = 'died';

    // Most tiles are harmless most of the time; skip the whole block cheaply.
    if (w.burn[i] > 0 || w.ash[i] > 0.18 || w.rad[i] > 0.15) {
      if (w.burn[i] > 0) {
        rate += HAZ.fire * w.fireStr[i] * (1 - d.rFire); cause = 'burned';
      }
      if (w.ash[i] > 0.18) {
        const r = HAZ.ash * w.ash[i] * (1 - d.rAsh);
        if (r > rate) cause = 'burned';
        rate += r;
      }
      if (w.rad[i] > 0.15) rate += HAZ.rad * w.rad[i] * (1 - d.rRad);
    }
    const bi = BIOMES[w.biome[i]];
    if (bi.wet > 0 && !d.swim) {
      rate += HAZ.drown * (1 - d.rFlood); cause = 'drowned';
    } else if (w.biome[i] === LAVA) {
      rate += HAZ.lava * (1 - d.rFire); cause = 'burned';
    }

    const t = w.tempAt(i);
    if (t < d.tempLo) {
      const r = (d.tempLo - t) * 5.5 * (1 - d.rCold);
      if (r > rate) cause = 'frozen';
      rate += r;
    } else if (t > d.tempHi) {
      const r = (t - d.tempHi) * 5.5 * (1 - d.rHeat);
      if (r > rate) cause = 'cooked';
      rate += r;
    }

    if (rate <= 0) return false;
    if (c.dormant) rate *= 0.25;
    rate *= this.mercy(c);
    if (this.rng.next() < rate * dt) { this.kill(c, cause); return true; }
    return false;
  };

  // ---- one creature, one tick ------------------------------------------
  const scratch = [];

  Sim.prototype.updateCreature = function (c, dt) {
    const w = this.world, d = c.d;
    let tx = c.x | 0, ty = c.y | 0;
    if (tx < 0) tx = 0; else if (tx >= w.w) tx = w.w - 1;
    if (ty < 0) ty = 0; else if (ty >= w.h) ty = w.h - 1;
    c.tile = ty * w.w + tx;
    const i = c.tile;
    const bi = BIOMES[w.biome[i]];

    // --- dormancy: curl up rather than die, at the cost of the whole year
    if (d.dormancy) {
      const t = w.tempAt(i);
      const lethal = w.burn[i] > 0 || t < d.tempLo || t > d.tempHi || w.ash[i] > 0.35 || w.rad[i] > 0.2;
      const lean = lethal || w.foodAt(i) < d.upkeep * 0.55 || c.energy < d.reserve * 0.2;
      c.dormant = (d.dormancy === 'lethal' ? lethal : lean) ? 1 : 0;
    }

    // --- night creatures sleep the day away, and sleep through what it brings
    c.asleep = (d.nocturnal && w.lightAt(i) > 0.32) ? 1 : 0;

    if (this.hazards(c, dt)) return;

    if (!c.dormant && !c.asleep) this.wander(c, dt);

    // --- eat
    let intake = 0;
    if (!c.dormant && !c.asleep) {
      const avail = w.foodAt(i);
      const take = Math.min(d.upkeep * CFG.eatRate, avail * d.forage);
      if (take > 0 && bi.food > 0) {
        w.food[i] = Math.max(0, w.food[i] - take * dt * CFG.deplete / bi.food);
        if (w.visKey(i) !== w.vis[i]) w.dirty.push(i);
      }
      intake = take;
      if (d.sunFood) intake += d.sunFood * w.lightAt(i);
      if (d.radFood) intake += d.radFood * w.rad[i];
      if (d.ironFood) intake += d.ironFood * w.iron[i];
      if (d.coastFood && this.coast[i]) intake += d.coastFood;
    }

    const costMul = c.dormant ? (d.dormancy === 'lethal' ? 0.06 : 0.24) : (c.asleep ? 0.36 : 1);
    c.energy += (intake - d.upkeep * costMul) * dt;
    if (c.energy > d.reserve) c.energy = d.reserve;

    if (c.energy <= 0) {
      c.energy = 0;
      c.starve += dt;
      if (this.rng.next() < 0.85 * this.mercy(c) * dt) {
        this.kill(c, 'starved'); return;
      }
    } else if (c.starve > 0) {
      c.starve = Math.max(0, c.starve - dt * 2);
    }

    // --- age out
    c.age += dt;
    const a = Math.max(0, c.age / d.lifespan), a2 = a * a, a4 = a2 * a2;
    if (this.rng.next() < (0.006 + a4 * a4 * 0.75) * dt) {
      this.kill(c, 'died'); return;
    }

    // --- breed
    c.cool -= dt;
    if (c.cool > 0 || c.dormant || c.asleep) return;
    if (c.age < d.maturity || c.energy < d.reserve * CFG.breedAt) return;
    if (this.aliveCount >= CFG.popCap) return;
    if (d.burnBirth && w.biome[i] !== global.Biomes.I.burnt && w.ash[i] < 0.3) return;

    let mate = null;
    if (d.selfBreed) {
      mate = c;
    } else {
      const near = this.nearby(c, scratch);
      const r2 = d.mateRange * d.mateRange;
      let bestScore = Infinity;
      // Below a handful, the last of a kind will take whoever is left.
      const desperate = c.sp.pop <= 8;
      for (let k = 0; k < near.length; k++) {
        const o = near[k];
        if (o === c || !o.alive || o.sp !== c.sp) continue;
        if (!desperate && o.sex === c.sex) continue;
        if (o.age < o.d.maturity || o.cool > 0 || o.dormant || o.asleep) continue;
        if (o.energy < o.d.reserve * CFG.breedAt * 0.8) continue;
        const dx = o.x - c.x, dy = o.y - c.y, dd = dx * dx + dy * dy;
        if (dd >= r2) continue;
        // Like breeds with like. Without this preference a novel combination
        // is halved every generation by mating back into the majority, no
        // cluster ever grows, and nothing ever speciates.
        const gd = desperate ? 0 : T.popcount(o.mask ^ c.mask);
        const score = dd + gd * gd * CFG.mateChoosiness;
        if (score < bestScore) { bestScore = score; mate = o; }
      }
    }
    if (!mate) return;

    const litter = Math.max(1, Math.round(d.litter * (0.6 + this.rng.next() * 0.8)));
    for (let k = 0; k < litter; k++) {
      this.births.push({ a: c, b: mate });
    }
    c.energy -= d.reserve * CFG.breedCost;
    c.cool = CFG.breedCool * (1 / Math.max(0.2, d.fertility));
    if (mate !== c) {
      mate.energy -= mate.d.reserve * CFG.breedCost * 0.6;
      mate.cool = CFG.breedCool * (1 / Math.max(0.2, mate.d.fertility)) * 0.7;
    }
  };

  Sim.prototype.flushBirths = function () {
    for (const b of this.births) {
      if (this.aliveCount >= CFG.popCap) break;
      const a = b.a, m = b.b;
      if (!a.alive) continue;
      const mutMul = (a.d.mutate + m.d.mutate) * 0.5;
      const mask = G.inherit(a.mask, m.mask, this.rng, this.pool, CFG.mutChance, mutMul);
      const jitter = 0.9;
      const x = Math.max(0.5, Math.min(this.world.w - 1.5, a.x + this.rng.range(-jitter, jitter)));
      const y = Math.max(0.5, Math.min(this.world.h - 1.5, a.y + this.rng.range(-jitter, jitter)));
      const child = this.spawn(a.sp, mask, x, y, 0);
      child.gen = (a.gen || 0) + 1;
      if (child.gen > a.sp.generations) a.sp.generations = child.gen;
      child.energy = child.d.reserve * 0.45;
      child.cool = child.d.maturity;
      this.stats.born++; this.yearStats.born++;
      if (mask !== a.mask && mask !== m.mask) this.newGenomes++;
      for (const s of child.d.strains) {
        if (!this.discovered.has(s.id)) {
          this.discovered.add(s.id);
          if (this.onStrain) this.onStrain(s, child);
        }
      }
    }
    this.births.length = 0;
  };

  // ---- the tick ---------------------------------------------------------
  Sim.prototype.tick = function (dt) {
    this.year += dt;
    this.world.tick(dt);
    this.buildGrid();

    const cs = this.creatures;
    for (let k = 0, n = cs.length; k < n; k++) {
      if (cs[k].alive) this.updateCreature(cs[k], dt);
    }
    this.flushBirths();

    // Sweep out the dead in batches rather than every tick.
    const dead = this.creatures.length - this.aliveCount;
    if (dead > 80) {
      const live = [];
      for (let k = 0; k < cs.length; k++) if (cs[k].alive) live.push(cs[k]);
      this.creatures = live;
      this.aliveCount = live.length;
    }

    const y = Math.floor(this.year);
    if (y > this.lastYearMark) {
      this.lastYearMark = y;
      this.census();
      if (this.onYear) this.onYear(y);
      this.resetYearStats();
    }
  };

  Sim.prototype.decayFx = function (realDt) {
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - realDt * 18);
    if (this.washAmt > 0) this.washAmt = Math.max(0, this.washAmt - realDt * 0.55);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t -= realDt * 1.6;
      if (this.flashes[i].t <= 0) this.flashes.splice(i, 1);
    }
  };

  // ---- yearly census ----------------------------------------------------
  Sim.prototype.census = function () {
    for (const sp of this.species) {
      sp.traitCount.fill(0);
      sp.pop = 0; sp.sx = 0; sp.sy = 0;
    }
    for (const c of this.creatures) {
      if (!c.alive) continue;
      c.sp.pop++; c.sp.sx += c.x; c.sp.sy += c.y;
      const tc = c.sp.traitCount;
      let m = c.mask, i = 0;
      while (m) { if (m & 1) tc[i]++; m >>>= 1; i++; }
    }
    for (const sp of this.species) {
      if (sp.pop > 0) { sp.cx = sp.sx / sp.pop; sp.cy = sp.sy / sp.pop; }
      if (sp.pop > sp.peakPop) sp.peakPop = sp.pop;
      if (sp.pop === 0 && sp.extinct === null && sp.born > 0) {
        sp.extinct = Math.floor(this.year);
        if (this.onExtinct) this.onExtinct(sp);
      }
      // Which strains and flaws the species as a whole is running.
      const sc = Object.create(null);
      let flawed = 0;
      if (sp.pop > 0) {
        for (const c of this.creatures) {
          if (!c.alive || c.sp !== sp) continue;
          for (const s of c.d.strains) sc[s.id] = (sc[s.id] || 0) + 1;
          if (c.d.flaws.length) flawed++;
        }
      }
      sp.strains = Object.keys(sc).filter(function (k) { return sc[k] / sp.pop > 0.5; });
      const sick = sp.pop > 0 && flawed / sp.pop > 0.5;
      if (sick !== sp.sickly) { sp.sickly = sick; sp.recolour(); }

      // The species' "normal": what a clear majority of it carries.
      let core = 0;
      if (sp.pop > 0) {
        for (let i = 0; i < sp.traitCount.length; i++) {
          if (sp.traitCount[i] / sp.pop > 0.6) core |= (1 << i);
        }
      }
      sp.coreMask = core;
      if (sp.pop > 0) this.checkSplit(sp);
    }
  };

  Sim.prototype.livingSpecies = function () {
    return this.species.filter(function (s) { return s.pop > 0; });
  };

  // Prevalence of a trait inside a species, 0..1.
  Sim.prototype.prevalence = function (sp, traitId) {
    if (!sp.pop) return 0;
    return sp.traitCount[T.BY_ID[traitId].index] / sp.pop;
  };

  // ---- disasters --------------------------------------------------------
  Sim.prototype.trigger = function (id, opts) {
    const d = global.Disasters.BY_ID[id];
    if (!d) return null;
    const before = this.aliveCount;
    const line = d.trigger(this, opts || {});
    if (line) {
      this.lastDisaster = { id: d.id, name: d.name, year: Math.floor(this.year) };
      this.pending = { disaster: d, year: Math.floor(this.year), popBefore: before };
      if (this.onDisaster) this.onDisaster(d, line);
    }
    return line;
  };

  // ---- speciation -------------------------------------------------------
  // A group drifts far enough from its parent's normal, holds that way for a
  // few years, and becomes its own species. This is the moment the world stops
  // being the player's and starts being its own.
  const SPLIT = { minDist: 3, minGroup: 8, minParent: 28, years: 6, maxSpecies: 10 };

  Sim.prototype.checkSplit = function (sp) {
    if (sp.pop < SPLIT.minParent || this.livingSpecies().length >= SPLIT.maxSpecies) {
      sp.pendingSplit = null; return;
    }
    // Bucket everyone who is at least minDist traits away from the norm.
    const counts = new Map();
    for (const c of this.creatures) {
      if (!c.alive || c.sp !== sp) continue;
      if (T.popcount(c.mask ^ sp.coreMask) < SPLIT.minDist) continue;
      counts.set(c.mask, (counts.get(c.mask) || 0) + 1);
    }
    if (!counts.size) { sp.pendingSplit = null; return; }

    let seed = 0, best = 0;
    counts.forEach(function (n, m) { if (n > best) { best = n; seed = m; } });

    // Count everyone within one trait of that genome - mutation keeps genomes
    // from ever matching exactly, so an exact-match test would never fire.
    let group = 0;
    counts.forEach(function (n, m) { if (T.popcount(m ^ seed) <= 1) group += n; });
    if (group < SPLIT.minGroup) { sp.pendingSplit = null; return; }

    const y = Math.floor(this.year);
    if (!sp.pendingSplit || T.popcount(sp.pendingSplit.seed ^ seed) > 1) {
      sp.pendingSplit = { seed: seed, since: y };
      return;
    }
    sp.pendingSplit.seed = seed;
    if (y - sp.pendingSplit.since >= SPLIT.years) this.split(sp, seed);
  };

  Sim.prototype.split = function (parent, seed) {
    const child = new SP.Species({
      name: SP.nameFor(seed, this.rng, this.namesTaken),
      hue: SP.hueFor(seed, this.rng, parent.hue),
      coreMask: seed,
      parent: parent,
      founded: Math.floor(this.year),
      foundedBy: this.lastDisaster ? this.lastDisaster.name : null
    });
    this.species.push(child);

    let moved = 0, mx = 0, my = 0;
    for (const c of this.creatures) {
      if (!c.alive || c.sp !== parent) continue;
      if (T.popcount(c.mask ^ seed) > 1) continue;
      parent.pop--; c.sp = child; child.pop++; child.born++;
      mx += c.x; my += c.y; moved++;
    }
    parent.pendingSplit = null;
    child.peakPop = child.pop;
    child.generations = parent.generations;
    if (moved) { child.cx = mx / moved; child.cy = my / moved; }
    if (this.onSplit) this.onSplit(child, parent, moved);
    return child;
  };

  global.Sim = Sim;
  global.SimConfig = CFG;
  global.SplitConfig = SPLIT;
})(window);
