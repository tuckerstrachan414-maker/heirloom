// HEIRLOOM - renderer.
//
// Terrain is painted once into an offscreen canvas at 8 real pixels per tile
// and only repainted where tiles actually changed appearance, then blitted
// scaled with smoothing off. That is what keeps it chunky and cheap.
//
// Creatures are drawn from their traits, never from a species template: the
// sprite for a given (species, genome) pair is baked once and reused.

(function (global) {
  'use strict';

  const TILE_PX = 8;
  const T = global.Traits;
  const BIOMES = global.Biomes.ALL;

  // ---- colour helpers ---------------------------------------------------
  function parseColor(c) {
    if (c[0] === '#') {
      return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
    }
    const m = /hsl\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/.exec(c);
    if (!m) return [200, 180, 140];
    return hsl2rgb(parseFloat(m[1]) / 360, parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
  }
  function hsl2rgb(h, s, l) {
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = function (t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function shade(c, f) {
    return 'rgb(' + Math.max(0, Math.min(255, Math.round(c[0] * f))) + ',' +
                    Math.max(0, Math.min(255, Math.round(c[1] * f))) + ',' +
                    Math.max(0, Math.min(255, Math.round(c[2] * f))) + ')';
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  // Deterministic per-tile noise, so the ground texture never shimmers.
  function tileHash(i) {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---- renderer ---------------------------------------------------------
  function Renderer(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.world = sim.world;

    this.terrain = document.createElement('canvas');
    this.terrain.width = this.world.w * TILE_PX;
    this.terrain.height = this.world.h * TILE_PX;
    this.tctx = this.terrain.getContext('2d');
    this.tctx.imageSmoothingEnabled = false;

    this.sprites = new Map();
    this.cam = { x: this.world.w / 2, y: this.world.h / 2, z: 9 };
    this.showGrid = false;
    this.paintAll();
  }

  Renderer.prototype.paintAll = function () {
    for (let i = 0; i < this.world.n; i++) this.paintTile(i);
    this.world.dirty.length = 0;
    this.world.dirtyAll = false;
  };

  Renderer.prototype.visKey = function (i) { return this.world.visKey(i); };

  Renderer.prototype.paintTile = function (i) {
    const w = this.world, g = this.tctx;
    w.vis[i] = this.visKey(i);
    const bi = BIOMES[w.biome[i]];
    const x = (i % w.w) * TILE_PX, y = ((i / w.w) | 0) * TILE_PX;
    const n = tileHash(i);

    // Lean ground reads darker and browner; lush ground reads full colour.
    const base = parseColor(bi.c), alt = parseColor(bi.c2);
    const lush = bi.food > 0 ? (0.55 + w.food[i] * 0.45) : 1;
    let col = mix(alt, base, n * 0.55 + 0.25);
    col = [col[0] * lush, col[1] * lush, col[2] * lush];

    g.fillStyle = shade(col, 1);
    g.fillRect(x, y, TILE_PX, TILE_PX);

    // Two speckles of texture per tile, fixed by the tile's own hash.
    g.fillStyle = shade(col, 1 + (n > 0.5 ? 0.10 : -0.10));
    g.fillRect(x + ((n * 6) | 0), y + ((n * 11) % 6 | 0), 2, 2);
    g.fillRect(x + ((n * 17) % 7 | 0), y + ((n * 23) % 7 | 0), 1, 1);

    if (w.iron[i] > 0.15) {
      g.fillStyle = 'rgba(207,154,74,' + Math.min(0.75, w.iron[i]) + ')';
      g.fillRect(x + ((n * 5) | 0) + 1, y + ((n * 7) % 5 | 0) + 1, 2, 1);
    }
    if (w.ash[i] > 0.05) {
      g.fillStyle = 'rgba(196,190,180,' + Math.min(0.8, w.ash[i] * 0.85) + ')';
      g.fillRect(x, y, TILE_PX, TILE_PX);
    }
    if (w.rad[i] > 0.08) {
      g.fillStyle = 'rgba(140,224,122,' + Math.min(0.35, w.rad[i] * 0.4) + ')';
      g.fillRect(x, y, TILE_PX, TILE_PX);
    }
    if (w.burn[i] > 0) {
      const heat = Math.min(1, w.fireStr[i]);
      g.fillStyle = 'rgb(' + (200 + 55 * heat | 0) + ',' + (70 + 90 * heat | 0) + ',30)';
      g.fillRect(x, y, TILE_PX, TILE_PX);
      g.fillStyle = 'rgba(255,232,150,' + (0.35 + n * 0.4) + ')';
      g.fillRect(x + ((n * 4) | 0) + 1, y + ((n * 9) % 4 | 0) + 1, 3, 3);
    }
  };

  Renderer.prototype.flushDirty = function () {
    const d = this.world.dirty;
    if (this.world.dirtyAll) { this.paintAll(); return; }
    if (!d.length) return;
    for (let k = 0; k < d.length; k++) {
      const i = d[k];
      if (this.world.vis[i] !== this.visKey(i)) this.paintTile(i);
    }
    d.length = 0;
  };

  // ---- creature sprites, baked from the genome --------------------------
  const S = 12;                       // sprite grid, in creature-pixels
  const BODY = [
    '............',
    '....####....',
    '...######...',
    '..########..',
    '.##########.',
    '.##########.',
    '.##########.',
    '..########..',
    '...######...',
    '..#.#..#.#..',
    '............',
    '............'
  ];

  Renderer.prototype.sprite = function (sp, mask) {
    const key = sp.id + ':' + mask;
    let s = this.sprites.get(key);
    if (s) return s;

    const d = global.Genome.derive(mask);
    const traits = d.traits;
    let body = parseColor(sp.color);
    let bulk = 1, alpha = 1, dark = 0;

    for (const t of traits) {
      const p = t.paint;
      if (p.tint) body = mix(body, parseColor(p.tint), 0.28);
      if (p.bulk) bulk *= p.bulk;
      if (p.alpha) alpha *= p.alpha;
      if (p.dark) dark = 1;
    }
    // A strain shifts the colour hard enough to pick out on the map; a flaw
    // drains it, so the doomed branches are visible at a glance.
    for (const s of d.strains) if (s.tint) body = mix(body, parseColor(s.tint), 0.38);
    if (d.flaws.length) {
      const grey = Math.round((body[0] + body[1] + body[2]) / 3);
      body = mix(body, [grey, grey, grey], 0.55);
    }

    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    // Species colour has to stay legible at four pixels across, so traits
    // shade it rather than replace it.
    body = mix(body, parseColor(sp.color), 0.30);
    const belly = mix(body, [20, 14, 10], 0.26);
    const top = mix(body, [255, 244, 214], 0.13);

    // body
    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        if (BODY[r][c] !== '#') continue;
        g.fillStyle = rgb(r <= 3 ? top : (r >= 7 ? belly : body));
        g.fillRect(c, r, 1, 1);
      }
    }
    if (dark) { g.fillStyle = 'rgba(40,30,20,0.30)'; g.fillRect(0, 6, S, S - 6); }

    // trait layers, painted over the body in a fixed order
    for (const t of traits) {
      const p = t.paint;
      if (p.plate) {
        g.fillStyle = p.plate;
        g.fillRect(3, 2, 6, 1); g.fillRect(2, 3, 8, 1); g.fillRect(2, 4, 2, 1); g.fillRect(8, 4, 2, 1);
      }
      if (p.fin) {
        g.fillStyle = p.fin;
        g.fillRect(0, 4, 1, 3); g.fillRect(11, 4, 1, 3); g.fillRect(1, 3, 1, 1); g.fillRect(10, 3, 1, 1);
      }
      if (p.sac) { g.fillStyle = p.sac; g.fillRect(4, 1, 4, 2); g.fillRect(3, 2, 6, 1); }
      if (p.root) {
        g.fillStyle = p.root;
        g.fillRect(2, 9, 8, 1); g.fillRect(1, 10, 3, 1); g.fillRect(8, 10, 3, 1); g.fillRect(5, 10, 2, 2);
        g.clearRect(2, 9, 1, 1);
      }
      if (p.stripe) {
        g.fillStyle = p.stripe;
        g.fillRect(2, 5, 8, 1); g.fillRect(3, 7, 6, 1);
      }
      if (p.plume) {
        g.fillStyle = p.plume;
        g.globalAlpha = 0.55; g.fillRect(5, 0, 1, 1); g.fillRect(7, 0, 1, 1); g.globalAlpha = 1;
      }
      if (p.egg) { g.fillStyle = p.egg; g.fillRect(5, 8, 2, 2); }
      if (p.belly) { g.fillStyle = p.belly; g.fillRect(4, 7, 4, 2); }
      if (p.speck) {
        g.fillStyle = p.speck;
        g.fillRect(3, 4, 1, 1); g.fillRect(7, 5, 1, 1); g.fillRect(5, 7, 1, 1); g.fillRect(8, 6, 1, 1);
      }
      if (p.eye) { g.fillStyle = p.eye; g.fillRect(4, 3, 1, 1); g.fillRect(7, 3, 1, 1); }
    }
    // default eyes if no trait supplied any
    if (!traits.some(function (t) { return t.paint.eye; })) {
      g.fillStyle = 'rgba(30,22,16,0.75)';
      g.fillRect(4, 3, 1, 1); g.fillRect(7, 3, 1, 1);
    }

    if (d.strains.length) {
      // a bright pip so a strain reads even at one or two pixels
      g.fillStyle = 'rgba(255,238,190,0.9)';
      g.fillRect(5, 5, 2, 1);
    }
    s = { cv: cv, bulk: bulk, alpha: alpha, flat: rgb(body) };
    this.sprites.set(key, s);
    return s;
  };

  Renderer.prototype.clearSprites = function () { this.sprites.clear(); };

  // ---- camera -----------------------------------------------------------
  Renderer.prototype.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.cssW = r.width; this.cssH = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.ctx.imageSmoothingEnabled = false;
    this.vignette = null;
  };

  Renderer.prototype.fit = function () {
    const zx = this.canvas.width / this.world.w, zy = this.canvas.height / this.world.h;
    this.cam.z = Math.max(2, Math.min(zx, zy));
    this.cam.x = this.world.w / 2;
    this.cam.y = this.world.h / 2;
  };

  Renderer.prototype.screenToWorld = function (px, py) {
    const z = this.cam.z, d = this.dpr || 1;
    return { x: (px * d - this.canvas.width / 2) / z + this.cam.x,
             y: (py * d - this.canvas.height / 2) / z + this.cam.y };
  };

  Renderer.prototype.zoomAt = function (px, py, factor) {
    const before = this.screenToWorld(px, py);
    this.cam.z = Math.max(2, Math.min(40, this.cam.z * factor));
    const after = this.screenToWorld(px, py);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clamp();
  };

  Renderer.prototype.clamp = function () {
    const halfW = this.canvas.width / this.cam.z / 2, halfH = this.canvas.height / this.cam.z / 2;
    const w = this.world.w, h = this.world.h;
    this.cam.x = (halfW * 2 >= w) ? w / 2 : Math.max(halfW, Math.min(w - halfW, this.cam.x));
    this.cam.y = (halfH * 2 >= h) ? h / 2 : Math.max(halfH, Math.min(h - halfH, this.cam.y));
  };

  // ---- the frame --------------------------------------------------------
  const FLASH_COLOR = { burned: '#ffca6a', starved: '#c9b48f', frozen: '#cfe8f5',
                        cooked: '#ff9a5c', drowned: '#7fd4d0', died: '#e0d3bb',
                        plague: '#c9a8e0' };

  Renderer.prototype.draw = function () {
    const ctx = this.ctx, sim = this.sim, w = this.world;
    const cw = this.canvas.width, ch = this.canvas.height;
    this.flushDirty();

    let shx = 0, shy = 0;
    if (sim.shakeAmt > 0.2) {
      shx = (Math.random() - 0.5) * sim.shakeAmt * this.dpr;
      shy = (Math.random() - 0.5) * sim.shakeAmt * this.dpr;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#171512';
    ctx.fillRect(0, 0, cw, ch);

    const z = this.cam.z;
    const ox = cw / 2 - this.cam.x * z + shx;
    const oy = ch / 2 - this.cam.y * z + shy;

    ctx.drawImage(this.terrain, 0, 0, this.terrain.width, this.terrain.height,
                  ox, oy, w.w * z, w.h * z);

    // creatures
    const cs = sim.creatures;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (!c.alive) continue;
      const sx = c.x * z + ox, sy = c.y * z + oy;
      if (sx < -24 || sy < -24 || sx > cw + 24 || sy > ch + 24) continue;
      const spr = this.sprite(c.sp, c.mask);
      let size = z * 0.66 * spr.bulk * (c.age < c.d.maturity ? 0.72 : 1);
      if (c.dormant) size *= 0.72;

      if (size < 4) {
        const s = Math.max(2, Math.round(size));
        ctx.globalAlpha = spr.alpha * (c.dormant ? 0.65 : 1);
        ctx.fillStyle = spr.flat;
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
        ctx.globalAlpha = 1;
      } else {
        const s = Math.round(size);
        ctx.globalAlpha = spr.alpha * (c.dormant ? 0.7 : (c.asleep ? 0.82 : 1));
        ctx.drawImage(spr.cv, Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
        ctx.globalAlpha = 1;
      }

      // A pip in the plague's own colour. Watching the colour spread across
      // a valley is most of the point of having plagues at all.
      if (c.inf) {
        const ps = Math.max(2, Math.round(z * 0.22));
        ctx.fillStyle = c.inf.p.color;
        ctx.fillRect(Math.round(sx - ps / 2), Math.round(sy - size * 0.55 - ps), ps, ps);
      }
    }

    // the dying
    for (const f of sim.flashes) {
      const sx = f.x * z + ox, sy = f.y * z + oy;
      if (sx < -8 || sy < -8 || sx > cw + 8 || sy > ch + 8) continue;
      ctx.globalAlpha = Math.max(0, f.t) * 0.8;
      ctx.fillStyle = FLASH_COLOR[f.c] || '#e0d3bb';
      const s = Math.max(2, Math.round(z * 0.4 * (1.4 - f.t)));
      ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      ctx.globalAlpha = 1;
    }

    // night, deepened by whatever the sky is doing
    const cl = w.climate;
    const day = (0.5 + 0.5 * Math.cos(w.dayPhase * Math.PI * 2)) * cl.sun;
    if (day < 0.9) {
      ctx.fillStyle = 'rgba(26,30,58,' + ((1 - day) * 0.30).toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }

    // A slow disaster has to be visible or it is just a number going down.
    if (cl.cold > 0.04) {
      ctx.fillStyle = 'rgba(150,190,225,' + Math.min(0.30, cl.cold * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    if (cl.heat > 0.04) {
      ctx.fillStyle = 'rgba(226,150,60,' + Math.min(0.26, cl.heat * 0.60).toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    if (cl.sun < 0.92) {
      ctx.fillStyle = 'rgba(120,112,100,' + Math.min(0.34, (1 - cl.sun) * 0.38).toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }

    // disaster colour wash
    if (sim.washAmt > 0.01 && sim.washColor) {
      ctx.globalAlpha = sim.washAmt;
      ctx.fillStyle = sim.washColor;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }

    if (!this.vignette) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35,
                                         cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(20,14,8,0.42)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, cw, ch);
  };

  global.Renderer = Renderer;
  global.TILE_PX = TILE_PX;
})(window);
