// HEIRLOOM - the world: tiles, terrain generation, food, fire, climate.
//
// Everything the creatures stand on lives here. Tile data is kept in parallel
// typed arrays rather than objects: 6000 tiles updated many times a second.

(function (global) {
  'use strict';

  const B = global.Biomes.I;
  const BIOMES = global.Biomes.ALL;

  // A fire front loses strength as it spreads; below FIRE_MIN it cannot carry.
  // This is what stops one wildfire eating the entire map.
  const FIRE_FALL = 0.968, FIRE_MIN = 0.40;

  // ---- value noise ------------------------------------------------------
  function octave(w, h, cells, rng) {
    const gw = cells + 1;
    const gh = Math.max(2, Math.round(cells * h / w) + 1);
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng.next();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / (h - 1) * (gh - 1);
      const y0 = Math.min(gh - 2, fy | 0), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / (w - 1) * (gw - 1);
        const x0 = Math.min(gw - 2, fx | 0), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1];
        const c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
      }
    }
    return out;
  }

  function fbm(w, h, rng, baseCells, octaves) {
    const out = new Float32Array(w * h);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const layer = octave(w, h, baseCells << o, rng);
      for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
      total += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  // ---- world ------------------------------------------------------------
  function World(w, h, rng) {
    this.w = w; this.h = h; this.n = w * h;
    this.rng = rng;
    this.year = 0;

    this.biome = new Uint8Array(this.n);
    this.elev  = new Float32Array(this.n);
    this.moist = new Float32Array(this.n);
    this.baseTemp = new Float32Array(this.n);   // latitude + elevation, never changes
    this.food  = new Float32Array(this.n);      // 0..1 of the biome's capacity
    this.burn  = new Float32Array(this.n);      // >0 while on fire
    this.fireStr = new Float32Array(this.n);    // how fierce this fire is, 0..1
    this.ash   = new Float32Array(this.n);      // ashfall depth 0..1
    this.rad   = new Float32Array(this.n);      // lingering radiation 0..1
    this.iron  = new Float32Array(this.n);      // meteor metal in the soil 0..1
    this.vis   = new Int32Array(this.n);        // renderer's cached appearance key

    // Global climate, pushed around by the slow disasters.
    this.climate = { cold: 0, heat: 0, sun: 1, foodMul: 1, wet: 0 };
    this.dayPhase = 0;                          // 0..1, 0.5 = midnight
    this.dayRate = 4;                           // day/night cycles per year
    this.dayLight = 1;

    this.dirty = [];                            // tile indexes needing a repaint
    this.dirtyAll = true;
    this.fires = [];                            // active burning tile indexes

    this.generate();
  }

  World.prototype.idx = function (x, y) { return y * this.w + x; };
  World.prototype.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  World.prototype.at = function (x, y) { return this.biome[((y | 0) * this.w) + (x | 0)]; };

  World.prototype.markDirty = function (i) { this.dirty.push(i); };

  // How a tile currently looks, as one integer. The renderer stores the key it
  // last painted in vis[]; anything else means the tile needs repainting.
  World.prototype.visKey = function (i) {
    return this.biome[i] * 100000
      + ((this.food[i] * 7) | 0) * 10000
      + ((this.fireStr[i] * 3) | 0) * 1000
      + ((this.ash[i] * 4) | 0) * 100
      + ((this.rad[i] * 3) | 0) * 10
      + ((this.iron[i] * 2) | 0);
  };

  World.prototype.generate = function () {
    const w = this.w, h = this.h, rng = this.rng;
    const el = fbm(w, h, rng, 4, 4);
    const mo = fbm(w, h, rng, 3, 3);

    // Radial falloff so the map is land ringed by sea, with room for islands.
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = (x - cx) / cx, dy = (y - cy) / cy;
        const d = Math.sqrt(dx * dx + dy * dy * 1.15);
        const fall = 1 - Math.min(1, Math.max(0, (d - 0.55) / 0.62));
        this.elev[i] = el[i] * 0.70 + fall * 0.45;
        this.moist[i] = mo[i];
      }
    }

    // Cut the biomes at percentiles of this world's own noise rather than at
    // fixed heights. Absolute thresholds give a different (and often mostly
    // uninhabitable) world for every seed; percentiles guarantee that every
    // world gets roughly the same mix of sea, lowland, forest and highland.
    const es = Float32Array.from(this.elev).sort();
    const ms = Float32Array.from(this.moist).sort();
    const q = function (a, p) { return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
    this.tDeep  = q(es, 0.15);
    this.tWater = q(es, 0.28);
    this.tShore = q(es, 0.36);
    this.tRock  = q(es, 0.91);
    this.tDry   = q(ms, 0.32);
    this.tWet   = q(ms, 0.66);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // Cold at the top and bottom edges, warm through the middle band,
        // and colder the higher you climb.
        const lat = 1 - Math.abs(y - cy) / cy;
        const alt = Math.max(0, (this.elev[i] - this.tShore) / Math.max(0.01, this.tRock - this.tShore));
        this.baseTemp[i] = Math.max(0, Math.min(1, lat * 0.98 + 0.04 - alt * 0.30));
      }
    }
    for (let i = 0; i < this.n; i++) this.biome[i] = this.classify(i);
    for (let i = 0; i < this.n; i++) this.food[i] = 0.55 + rng.next() * 0.45;
  };

  World.prototype.classify = function (i) {
    const e = this.elev[i], m = this.moist[i], t = this.baseTemp[i];
    if (e < this.tDeep) return B.deep;
    if (e < this.tWater) return B.water;
    if (t < 0.15) return B.ice;
    if (e < this.tShore) return (m > this.tWet) ? B.swamp : B.sand;
    if (e > this.tRock) return B.rock;
    if (m > this.tWet) return B.forest;
    if (m < this.tDry && t > 0.50) return B.clay;
    return B.grass;
  };

  World.prototype.setBiome = function (i, b) {
    if (this.biome[i] === b) return;
    this.biome[i] = b;
    this.dirty.push(i);
  };

  // Local temperature: the tile's own nature, its biome, and whatever the
  // climate is currently doing to everyone.
  World.prototype.tempAt = function (i) {
    const bi = BIOMES[this.biome[i]];
    let t = this.baseTemp[i] * 0.62 + bi.temp * 0.38;
    t += this.climate.heat - this.climate.cold;
    if (this.burn[i] > 0) t += 0.55;
    return t < 0 ? 0 : (t > 1.4 ? 1.4 : t);
  };

  // Light reaching this tile now: biome canopy, ash overhead, global sun,
  // and the day/night cycle.
  World.prototype.lightAt = function (i) {
    const bi = BIOMES[this.biome[i]];
    return bi.sun * this.climate.sun * (1 - this.ash[i] * 0.75) * this.dayLight;
  };

  // Food actually available to a forager standing here.
  World.prototype.foodAt = function (i) {
    const bi = BIOMES[this.biome[i]];
    return bi.food * this.food[i] * this.climate.foodMul;
  };

  World.prototype.isWet = function (i) { return BIOMES[this.biome[i]].wet > 0; };

  // ---- fire -------------------------------------------------------------
  World.prototype.ignite = function (i, strength) {
    if (strength === undefined) strength = 1;
    if (strength < FIRE_MIN || this.burn[i] > 0) return false;
    const bi = BIOMES[this.biome[i]];
    if (bi.burnable <= 0) return false;
    this.burn[i] = 1;
    this.fireStr[i] = strength;
    this.fires.push(i);
    this.dirty.push(i);
    return true;
  };

  World.prototype.stepFire = function (dt) {
    if (!this.fires.length) return;
    const next = [];
    const w = this.w, h = this.h;
    // Only the tiles already alight at the start of the tick get to spread.
    // Without this snapshot, ignite() appends into the array we are walking
    // and the whole fire resolves in a single tick instead of crawling.
    const count = this.fires.length;
    for (let k = 0; k < count; k++) {
      const i = this.fires[k];
      if (this.burn[i] <= 0) continue;

      // Try to spread to the four neighbours.
      const x = i % w, y = (i / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (this.burn[j] > 0) continue;
        const bj = BIOMES[this.biome[j]];
        if (bj.burnable <= 0) continue;
        // Dry fuel burns; wet years and thin food slow it down.
        // A tile burns for about 7.5 ticks, and in a 2D front most of its
        // neighbours are already alight - so the per-tick chance has to be
        // high (~0.22 on grass) or the fire goes out instead of spreading.
        const fuel = bj.burnable * (0.35 + this.food[j] * 0.65) * (1 - this.climate.wet * 0.6);
        if (this.rng.next() < fuel * 0.9 * dt * 6) this.ignite(j, this.fireStr[i] * FIRE_FALL);
      }

      this.burn[i] -= dt * 3.2;
      if (this.burn[i] <= 0) {
        const str = this.fireStr[i];
        this.burn[i] = 0; this.fireStr[i] = 0;
        this.food[i] = 0;
        this.ash[i] = Math.min(1, this.ash[i] + 0.60 * str);
        this.setBiome(i, B.burnt);
        this.dirty.push(i);
      } else {
        next.push(i);
        this.dirty.push(i);
      }
    }
    for (let k = count; k < this.fires.length; k++) next.push(this.fires[k]);
    this.fires = next;
  };

  // ---- yearly world update ---------------------------------------------
  World.prototype.tick = function (dt) {
    this.year += dt;
    this.dayPhase = (this.dayPhase + dt * this.dayRate) % 1;
    // One cosine per tick instead of one per lightAt() call.
    this.dayLight = 0.5 + 0.5 * Math.cos(this.dayPhase * Math.PI * 2);

    this.stepFire(dt);

    // Regrow food and let ash, radiation and burnt ground recover.
    // Sampled rather than swept: a slice of the map each tick, which is
    // indistinguishable on screen and far cheaper.
    const n = this.n;
    const slice = Math.max(1, Math.round(n * dt * 1.2));
    for (let k = 0; k < slice; k++) {
      const i = (this.rng.next() * n) | 0;
      const bi = BIOMES[this.biome[i]];

      if (this.burn[i] <= 0 && bi.regrow > 0) {
        const light = 0.35 + this.lightAt(i) * 0.65;
        this.food[i] = Math.min(1, this.food[i] + bi.regrow * light * (n / slice) * dt * 1.2);
      }
      if (this.ash[i] > 0) this.ash[i] = Math.max(0, this.ash[i] - 0.030 * (n / slice) * dt);
      if (this.rad[i] > 0) this.rad[i] = Math.max(0, this.rad[i] - 0.006 * (n / slice) * dt);

      // Burnt ground greens over again once the food has come back.
      if (this.biome[i] === B.burnt && this.food[i] > 0.45) {
        this.setBiome(i, this.classify(i));
      }
      if (this.visKey(i) !== this.vis[i]) this.dirty.push(i);
    }
  };

  // Nearest tile satisfying a predicate, searched in rings. Used for
  // "where can this thing actually live" questions.
  World.prototype.findNear = function (x, y, radius, pred) {
    x |= 0; y |= 0;
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const i = ny * this.w + nx;
          if (pred(i, nx, ny)) return i;
        }
      }
    }
    return -1;
  };

  global.World = World;
})(window);
