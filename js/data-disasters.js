// HEIRLOOM - the disaster registry.
//
// THE EXTENSION POINT: adding a disaster = appending one row to DISASTERS.
// The UI builds its buttons from this table and the sim never hard-codes a
// disaster by name.
//
//   kind    - 'sudden' | 'slow' | 'good' | 'player'
//   aim     - 'point' if the player picks a spot on the map, 'world' otherwise
//   trigger - (sim, opts) => log line, or null if it could not happen
//
// Killing is mostly NOT done here. Disasters change the world; creatures then
// die to the state of the tile they are standing on (see Sim.hazards), or to a
// single pulse through Sim.strike. That is why a wildfire selects for Ashlung
// without anything checking for Ashlung.

(function (global) {
  'use strict';

  const B = global.Biomes.I;
  const BIOMES = global.Biomes.ALL;

  // Resolve where a disaster lands: where the player clicked, else near
  // something alive - a disaster in an empty corner is not a disaster.
  function aim(sim, opts, pred) {
    const w = sim.world;
    if (opts && opts.x !== undefined) {
      if (pred) {
        const i = w.findNear(opts.x, opts.y, 10, pred);
        if (i >= 0) return { x: i % w.w, y: (i / w.w) | 0 };
      }
      return { x: Math.max(0, Math.min(w.w - 1, opts.x)), y: Math.max(0, Math.min(w.h - 1, opts.y)) };
    }
    const live = [];
    for (const c of sim.creatures) if (c.alive) live.push(c);
    for (let k = 0; k < 20; k++) {
      let cx, cy;
      if (live.length) { const c = sim.rng.pick(live); cx = c.x | 0; cy = c.y | 0; }
      else { cx = sim.rng.int(w.w); cy = sim.rng.int(w.h); }
      if (!pred) return { x: cx, y: cy };
      const i = w.findNear(cx, cy, 12, pred);
      if (i >= 0) return { x: i % w.w, y: (i / w.w) | 0 };
    }
    return { x: sim.rng.int(w.w), y: sim.rng.int(w.h) };
  }

  function isLand(w) { return function (i) { return BIOMES[w.biome[i]].wet === 0; }; }
  function burnable(w) {
    return function (i) { return BIOMES[w.biome[i]].burnable > 0.3 && w.burn[i] <= 0; };
  }

  const DISASTERS = [
    // ---- sudden ---------------------------------------------------------
    {
      id: 'wildfire', name: 'Wildfire', kind: 'sudden', aim: 'point', cp: 1,
      tags: ['fire'],
      desc: 'Spreads through dry grass and forest. Stops at water.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, burnable(w));
        let lit = 0;
        for (let d = 0; d < 5; d++) {
          const x = p.x + (d === 1 ? 1 : d === 2 ? -1 : 0);
          const y = p.y + (d === 3 ? 1 : d === 4 ? -1 : 0);
          if (w.inBounds(x, y) && w.ignite(w.idx(x, y), 1)) lit++;
        }
        if (!lit) return null;
        sim.shake(9); sim.wash('#e8622a', 0.30);
        return 'Fire in ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'meteor', name: 'Meteor Strike', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['impact', 'fire', 'metal'],
      desc: 'A crater, a ring of fire, metal in the soil, and years of dust.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, isLand(w));
        const R = 5 + sim.rng.next() * 4;

        sim.eachTile(p.x, p.y, R * 3.2, function (i, f) {
          if (f < 0.14) {                       // the crater itself
            w.setBiome(i, B.rock); w.food[i] = 0;
            w.iron[i] = Math.min(1, w.iron[i] + 0.9);
          } else if (f < 0.34) {                // molten rim
            w.iron[i] = Math.min(1, w.iron[i] + 0.55);
            w.ignite(i, 1);
          } else if (f < 0.55) {
            w.iron[i] = Math.min(1, w.iron[i] + 0.2);
            if (sim.rng.chance(0.35)) w.ignite(i, 0.85);
          }
          w.ash[i] = Math.min(1, w.ash[i] + 0.7 * (1 - f));   // the dust years
          w.dirty.push(i);
        });

        const killed = sim.strike(p.x, p.y, R * 2.4, 'impact', 0.95);
        sim.shake(30); sim.wash('#ffd9a0', 0.55);
        return 'A rock falls out of the sky onto ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'eruption', name: 'Volcanic Eruption', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['fire', 'ash'],
      desc: 'Lava that stays forever, and ash spreading outward for a decade.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, isLand(w));
        const R = 4 + sim.rng.next() * 3;

        sim.eachTile(p.x, p.y, R * 3, function (i, f) {
          if (f < 0.22) { w.setBiome(i, B.lava); w.food[i] = 0; }
          else if (f < 0.45) { w.ignite(i, 1); }
          w.ash[i] = Math.min(1, w.ash[i] + 0.5 * (1 - f * 0.8));
          w.dirty.push(i);
        });
        sim.strike(p.x, p.y, R * 2, 'fire', 0.8);
        sim.shake(24); sim.wash('#e8622a', 0.5);

        // The sky closes over afterwards, every time.
        const winter = BY_ID['ashwinter'];
        if (winter) sim.startEffect(winter, {});
        return 'The ground opens in ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'deluge', name: 'Deluge', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['flood'],
      desc: 'Low ground goes under. It drains again in a few years.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, isLand(w));
        const R = 14 + sim.rng.next() * 9;
        const flooded = [];
        // Water finds the low ground, so the flood follows elevation, not the
        // shape of the circle.
        let sum = 0, n = 0;
        sim.eachTile(p.x, p.y, R, function (i) { sum += w.elev[i]; n++; });
        const level = (sum / Math.max(1, n)) * 0.55 + w.tShore * 0.45;
        sim.eachTile(p.x, p.y, R, function (i) {
          if (BIOMES[w.biome[i]].wet > 0) return;
          if (w.elev[i] > level) return;
          flooded.push(i);
          w.setBiome(i, B.water);
          if (w.burn[i] > 0) { w.burn[i] = 0; w.fireStr[i] = 0; }
          w.ash[i] = 0;
        });
        if (!flooded.length) return null;
        sim.strike(p.x, p.y, R, 'flood', 0.55, function (c) {
          return BIOMES[w.biome[c.tile]].wet > 0 ? 1 : 0.15;
        });
        sim.wash('#3f8f8c', 0.4); sim.shake(8);
        sim.startEffect(BY_ID['drainage'], { tiles: flooded });
        return 'The water comes up over ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'tsunami', name: 'Tsunami', kind: 'sudden', aim: 'world', cp: 3,
      tags: ['flood'],
      desc: 'The entire coast, gone - and it stays barren for years afterwards.',
      trigger: function (sim, opts) {
        const w = sim.world;
        sim.computeCoast();
        // "The entire coast, gone" means more than the single tile touching the
        // sea - the wave runs a few tiles inland wherever the ground is low.
        const hit = [];
        const seen = new Uint8Array(w.n);
        let front = [];
        for (let i = 0; i < w.n; i++) if (sim.coast[i]) { front.push(i); seen[i] = 1; }
        for (let step = 0; step < 3 && front.length; step++) {
          const next = [];
          for (const i of front) {
            hit.push(i);
            w.setBiome(i, B.water);
            if (w.burn[i] > 0) { w.burn[i] = 0; w.fireStr[i] = 0; }
            w.ash[i] = 0;
            w.food[i] = 0;           // salt: the coast stays barren after it drains
            const x = i % w.w, y = (i / w.w) | 0;
            for (let d = 0; d < 4; d++) {
              const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
              const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
              if (!w.inBounds(nx, ny)) continue;
              const j = ny * w.w + nx;
              if (seen[j] || BIOMES[w.biome[j]].wet > 0) continue;
              if (w.elev[j] > w.tShore + (w.tRock - w.tShore) * 0.30) continue;
              seen[j] = 1; next.push(j);
            }
          }
          front = next;
        }
        if (!hit.length) return null;
        // Only things at or near the shoreline drown.
        const killed = sim.strikeAll('flood', 0.92, function (c) {
          return seen[c.tile] ? 1 : 0;
        });
        sim.wash('#2b6b73', 0.6); sim.shake(26);
        sim.startEffect(BY_ID['drainage'], { tiles: hit, barren: true });
        return 'The sea comes in. Every coast at once.';
      }
    },
    {
      id: 'lightning', name: 'Lightning Storm', kind: 'sudden', aim: 'world', cp: 3,
      tags: ['fire', 'storm'],
      desc: 'Ignitions all over the map. Kills whatever is standing in the open.',
      trigger: function (sim, opts) {
        const w = sim.world;
        let lit = 0;
        for (let k = 0; k < 40 && lit < 5; k++) {
          const p = aim(sim, {}, burnable(w));
          if (w.ignite(w.idx(p.x, p.y), 0.9)) { lit++; sim.strike(p.x, p.y, 5, 'storm', 0.5); }
        }
        if (!lit) return null;
        sim.shake(16); sim.wash('#e8e0c0', 0.4);
        return 'Dry lightning. ' + global.numWord(lit) + ' fires start at once.';
      }
    },
    {
      id: 'hail', name: 'Hailstorm', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['hail'],
      desc: 'Kills anything unarmoured caught in the open.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, null);
        const R = 17 + sim.rng.next() * 9;
        sim.eachTile(p.x, p.y, R, function (i) {
          if (w.burn[i] > 0) { w.burn[i] = 0; w.fireStr[i] = 0; w.dirty.push(i); }
        });
        const killed = sim.strike(p.x, p.y, R, 'hail', 0.92, function (c) {
          // Forest canopy is worth something when the sky turns to stones.
          return BIOMES[w.biome[c.tile]].id === 'forest' ? 0.45 : 1;
        });
        sim.shake(18); sim.wash('#dfe9ef', 0.42);
        return 'Hail over ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'earthquake', name: 'Earthquake', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['quake'],
      desc: 'Chasms open. Uniquely, this one kills burrowers.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, isLand(w));
        const R = 12 + sim.rng.next() * 8;
        let chasms = 0;
        sim.eachTile(p.x, p.y, R, function (i, f) {
          if (BIOMES[w.biome[i]].wet > 0) return;
          if (sim.rng.chance(0.16 * (1 - f))) {
            w.setBiome(i, B.rock); w.food[i] = 0; chasms++;
          }
        });
        const killed = sim.strike(p.x, p.y, R, 'quake', 0.7);
        sim.shake(34); sim.wash('#8a8073', 0.35);
        return 'The ground splits open across ' + sim.regionName(p.x, p.y) + '.';
      }
    },
    {
      id: 'solarflare', name: 'Solar Flare', kind: 'sudden', aim: 'world', cp: 3,
      tags: ['radiation'],
      desc: 'Anything on the surface in daylight dies. The radiation lingers.',
      trigger: function (sim, opts) {
        const w = sim.world;
        for (let i = 0; i < w.n; i++) {
          w.rad[i] = Math.min(1, w.rad[i] + 0.18 + BIOMES[w.biome[i]].sun * 0.22);
        }
        w.dirtyAll = true;
        const killed = sim.strikeAll('radiation', 0.55, function (c) {
          // the night-sleepers and the buried miss it entirely
          return c.asleep ? 0.12 : (c.d.sheltered ? 0.2 : 1);
        });
        sim.wash('#f0e3a8', 0.65); sim.shake(10);
        return 'The sun flares. Everything above ground is caught in the open.';
      }
    },
    {
      id: 'acidrain', name: 'Acid Rain', kind: 'sudden', aim: 'point', cp: 3,
      tags: ['acid'],
      desc: 'Kills the soft-skinned. Spares the armoured and the buried.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, null);
        const R = 16 + sim.rng.next() * 9;
        sim.eachTile(p.x, p.y, R, function (i, f) {
          w.food[i] = Math.max(0, w.food[i] - 0.55 * (1 - f));
          if (w.burn[i] > 0) { w.burn[i] = 0; w.fireStr[i] = 0; }
          w.dirty.push(i);
        });
        sim.strike(p.x, p.y, R, 'acid', 0.75, function (c) {
          return c.d.sheltered ? 0.1 : 1;
        });
        sim.wash('#a8c46a', 0.4);
        return 'The rain turns sour over ' + sim.regionName(p.x, p.y) + '.';
      }
    },

    // ---- slow: a squeeze over decades ------------------------------------
    {
      id: 'iceage', name: 'Ice Age', kind: 'slow', aim: 'world', cp: 3,
      tags: ['cold'], duration: 70,
      desc: 'Cold creeps in from the edges over decades, then slowly retreats.',
      trigger: function (sim) {
        if (!sim.startEffect(this, {})) return null;
        sim.wash('#dfe9ef', 0.35);
        return 'The cold begins to come down from the edges of the world.';
      },
      update: function (sim, p, dt) {
        const w = sim.world;
        // in over the first half, back out over the second
        w.climate.cold = Math.sin(p * Math.PI) * 0.56;
        const slice = Math.max(1, Math.round(w.n * dt * 0.8));
        for (let k = 0; k < slice; k++) {
          const i = sim.rng.int(w.n);
          if (BIOMES[w.biome[i]].wet > 0) continue;
          const t = w.tempAt(i);
          if (t < 0.19 && w.biome[i] !== B.ice) { w.setBiome(i, B.ice); w.food[i] *= 0.3; }
          else if (t > 0.28 && w.biome[i] === B.ice) w.setBiome(i, w.classify(i));
        }
      },
      end: function (sim) {
        const w = sim.world;
        w.climate.cold = 0;
        // Thawing only happens inside update(), so anything still frozen when
        // the effect ends would stay frozen for good. Melt it here.
        for (let i = 0; i < w.n; i++) if (w.biome[i] === B.ice) w.biome[i] = w.classify(i);
        w.dirtyAll = true;
        return 'The ice lets go. What is left has the whole world to itself.';
      }
    },
    {
      id: 'longsummer', name: 'The Long Summer', kind: 'slow', aim: 'world', cp: 3,
      tags: ['heat', 'drought'], duration: 55,
      desc: 'Water shrinks, rivers vanish, the map turns gold and then rust.',
      trigger: function (sim) {
        if (!sim.startEffect(this, {})) return null;
        sim.wash('#d9a441', 0.3);
        return 'The rains do not come. They do not come the next year either.';
      },
      update: function (sim, p, dt) {
        const w = sim.world;
        w.climate.heat = Math.sin(p * Math.PI) * 0.30;
        w.climate.wet = -Math.sin(p * Math.PI) * 0.5;
        const slice = Math.max(1, Math.round(w.n * dt * 0.7));
        for (let k = 0; k < slice; k++) {
          const i = sim.rng.int(w.n);
          if (p < 0.5) {
            if (w.biome[i] === B.water && sim.rng.chance(0.35)) w.setBiome(i, B.sand);
            else if (w.biome[i] === B.swamp) w.setBiome(i, B.clay);
            else if (w.biome[i] === B.grass && sim.rng.chance(0.30)) w.setBiome(i, B.clay);
            else if (w.biome[i] === B.forest && sim.rng.chance(0.10)) w.setBiome(i, B.grass);
          } else if (w.biome[i] !== w.classify(i)) {
            w.setBiome(i, w.classify(i));
          }
        }
      },
      end: function (sim) {
        sim.world.climate.heat = 0; sim.world.climate.wet = 0;
        sim.world.dirtyAll = true;
        for (let i = 0; i < sim.world.n; i++) sim.world.biome[i] = sim.world.classify(i);
        return 'The rain comes back.';
      }
    },
    {
      id: 'ashwinter', name: 'Ash Winter', kind: 'slow', aim: 'world', cp: 3,
      tags: ['dark', 'ash'], duration: 34,
      desc: 'The sun goes out. Photosynthesis fails. Follows every eruption.',
      trigger: function (sim) {
        if (!sim.startEffect(this, {})) return null;
        sim.wash('#9a9086', 0.45);
        return 'The sky closes over. It is going to be dark for a long time.';
      },
      update: function (sim, p, dt) {
        const w = sim.world;
        const depth = Math.sin(p * Math.PI);
        w.climate.sun = 1 - depth * 0.85;
        w.climate.cold = depth * 0.20;
        w.climate.foodMul = 1 - depth * 0.34;
        // A dusting for the look and for the light it blocks, deliberately
        // kept under the ash hazard threshold: an ash winter should starve
        // the world, not poison every tile on the map at once.
        const slice = Math.max(1, Math.round(w.n * dt * 0.6));
        for (let k = 0; k < slice; k++) {
          const i = sim.rng.int(w.n);
          if (p < 0.5) w.ash[i] = Math.min(0.15, w.ash[i] + 0.10);
          w.dirty.push(i);
        }
      },
      end: function (sim) {
        sim.world.climate.sun = 1; sim.world.climate.cold = 0;
        sim.world.climate.foodMul = 1;
        return 'The sun comes back through.';
      }
    },
    {
      id: 'famine', name: 'Famine', kind: 'slow', aim: 'world', cp: 3,
      tags: ['famine'], duration: 30,
      desc: 'Food regrows at half speed. The hungriest bodies go first.',
      trigger: function (sim) {
        if (!sim.startEffect(this, {})) return null;
        return 'The ground stops giving.';
      },
      update: function (sim, p) {
        sim.world.climate.foodMul = 1 - Math.sin(p * Math.PI) * 0.62;
      },
      end: function (sim) {
        sim.world.climate.foodMul = 1;
        return 'The lean years end.';
      }
    },
    {
      id: 'searise', name: 'Sea Rise', kind: 'slow', aim: 'world', cp: 3,
      tags: ['flood'], duration: 65,
      desc: 'The coasts drown slowly. Islands appear, and some never come back.',
      trigger: function (sim) {
        if (!sim.startEffect(this, {})) return null;
        return 'The tide line is further up the shore every year.';
      },
      update: function (sim, p, dt, e) {
        const w = sim.world;
        if (!e.opts.level) e.opts.level = w.tShore;
        const rise = Math.sin(p * Math.PI) * (w.tRock - w.tShore) * 0.30;
        const level = e.opts.level + rise;
        const slice = Math.max(1, Math.round(w.n * dt * 0.9));
        for (let k = 0; k < slice; k++) {
          const i = sim.rng.int(w.n);
          const wet = BIOMES[w.biome[i]].wet > 0;
          if (!wet && w.elev[i] < level) { w.setBiome(i, B.water); w.ash[i] = 0; }
          else if (wet && w.elev[i] > level && w.elev[i] > w.tWater) w.setBiome(i, w.classify(i));
        }
      },
      end: function (sim) {
        for (let i = 0; i < sim.world.n; i++) sim.world.biome[i] = sim.world.classify(i);
        sim.world.dirtyAll = true;
        return 'The sea settles back into its old shape. Mostly.';
      }
    },
    {
      // Not offered to the player - floods and tsunamis start this themselves
      // so the water they leave behind drains again instead of being permanent.
      id: 'drainage', name: 'Drainage', kind: 'hidden', aim: 'world', cp: 99,
      tags: [], duration: 7, desc: '',
      trigger: function () { return null; },
      end: function (sim, e) {
        const w = sim.world;
        for (const i of (e.opts.tiles || [])) {
          if (BIOMES[w.biome[i]].wet > 0 && w.elev[i] > w.tWater) {
            w.setBiome(i, w.classify(i));
            if (!e.opts.barren) w.food[i] = Math.max(w.food[i], 0.55);
          }
        }
        return (e.opts.tiles && e.opts.tiles.length > 40) ? 'The flood water drains away.' : null;
      }
    },

    // ---- good events: rare, and lovely -----------------------------------
    {
      id: 'bloom', name: 'Bloom', kind: 'good', aim: 'world', cp: 3,
      tags: ['food'],
      desc: 'Food everywhere. Everything breeds.',
      trigger: function (sim) {
        const w = sim.world;
        for (let i = 0; i < w.n; i++) w.food[i] = 1;
        w.dirtyAll = true;
        for (const c of sim.creatures) {
          if (!c.alive) continue;
          c.energy = c.d.reserve;
          c.cool = Math.min(c.cool, 0.2);
        }
        sim.wash('#93b169', 0.35);
        return 'A good year. The whole world is green at once.';
      }
    },
    {
      id: 'bloodmoon', name: 'Blood Moon', kind: 'good', aim: 'world', cp: 3,
      tags: ['breeding'],
      desc: 'One night of universal mating success.',
      trigger: function (sim) {
        let ready = 0;
        for (const c of sim.creatures) {
          if (!c.alive || c.age < c.d.maturity) continue;
          c.cool = 0;
          c.energy = Math.max(c.energy, c.d.reserve * 0.75);
          ready++;
        }
        if (!ready) return null;
        sim.wash('#c8663a', 0.4);
        return 'A red moon. Everything that can breed, breeds tonight.';
      }
    },
    {
      id: 'ironrain', name: 'Iron Rain', kind: 'good', aim: 'point', cp: 3,
      tags: ['metal'],
      desc: 'A meteor shower that seeds metal into the ground.',
      trigger: function (sim, opts) {
        const w = sim.world;
        const p = aim(sim, opts, isLand(w));
        const R = 16 + sim.rng.next() * 10;
        sim.eachTile(p.x, p.y, R, function (i, f) {
          w.iron[i] = Math.min(1, w.iron[i] + 0.75 * (1 - f * 0.7));
          w.dirty.push(i);
        });
        sim.strike(p.x, p.y, R, 'impact', 0.12);
        sim.shake(12); sim.wash('#cf9a4a', 0.3);
        return 'Metal falls over ' + sim.regionName(p.x, p.y) + ' all night.';
      }
    },
    {
      id: 'greenreturn', name: 'The Green Return', kind: 'good', aim: 'world', cp: 3,
      tags: ['heal'],
      desc: 'The map heals in a wave you can watch move.',
      trigger: function (sim) {
        const w = sim.world;
        for (const e of sim.effects.slice()) {
          if (e.d.kind === 'slow' && e.d.id !== 'drainage') {
            sim.effects.splice(sim.effects.indexOf(e), 1);
            if (e.d.end) e.d.end(sim, e);
          }
        }
        w.climate.cold = 0; w.climate.heat = 0; w.climate.sun = 1;
        w.climate.foodMul = 1; w.climate.wet = 0;
        for (let i = 0; i < w.n; i++) {
          w.ash[i] = 0; w.rad[i] = 0;
          w.burn[i] = 0; w.fireStr[i] = 0;
          if (w.biome[i] === B.burnt || w.biome[i] === B.ice) w.biome[i] = w.classify(i);
          w.food[i] = Math.max(w.food[i], 0.85);
        }
        w.fires.length = 0;
        w.dirtyAll = true;
        sim.wash('#93b169', 0.45);
        return 'The world heals. Grass comes back over everything that burned.';
      }
    },

    // ---- yours ------------------------------------------------------------
    {
      id: 'genebolt', name: 'Gene Bolt', kind: 'player', aim: 'point', cp: 3,
      tags: ['mutation'],
      desc: 'Force a mutation on whatever is standing here. Your finger on the tree of life.',
      trigger: function (sim, opts) {
        const p = aim(sim, opts, null);
        const hit = [];
        for (const c of sim.creatures) {
          if (!c.alive) continue;
          const dx = c.x - p.x, dy = c.y - p.y;
          if (dx * dx + dy * dy < 36) hit.push(c);
        }
        if (!hit.length) return null;
        const G = global.Genome;
        let changed = 0;
        for (const c of hit) {
          let m = G.mutate(c.mask, sim.rng, sim.pool);
          m = G.trimToSlots(G.enforceExclusive(m, sim.rng), sim.rng);
          if (m === c.mask) continue;
          c.mask = m; c.d = G.derive(m); changed++;
          for (const s of c.d.strains) {
            if (!sim.discovered.has(s.id)) {
              sim.discovered.add(s.id);
              if (sim.onStrain) sim.onStrain(s, c);
            }
          }
        }
        if (!changed) return null;
        sim.wash('#e8d9b0', 0.3);
        return 'Something reaches into ' + global.numWord(changed) + ' of them and changes it.';
      }
    },
    {
      id: 'invasive', name: 'Invasive Species', kind: 'player', aim: 'point', cp: 3,
      tags: ['species'],
      desc: 'Drop a foreign species in and see what happens.',
      trigger: function (sim, opts) {
        const w = sim.world;
        if (sim.livingSpecies().length >= 10) return null;
        const p = aim(sim, opts, isLand(w));
        const T = global.Traits, G = global.Genome;
        // Two or three traits it did not evolve here, so it arrives strange.
        const pool = sim.pool.slice();
        sim.rng.shuffle(pool);
        let mask = T.maskOf(pool.slice(0, sim.rng.between(2, 3)));
        mask = G.trimToSlots(G.enforceExclusive(mask, sim.rng), sim.rng);

        const sp = new global.SpeciesLib.Species({
          name: global.SpeciesLib.nameFor(mask, sim.rng, sim.namesTaken),
          hue: sim.rng.range(0, 360),
          coreMask: mask,
          founded: Math.floor(sim.year)
        });
        sim.species.push(sp);
        sp.cx = p.x; sp.cy = p.y;
        for (let k = 0; k < 22; k++) {
          const x = Math.max(1, Math.min(w.w - 2, p.x + sim.rng.gauss() * 3));
          const y = Math.max(1, Math.min(w.h - 2, p.y + sim.rng.gauss() * 3));
          sim.spawn(sp, mask, x, y, sim.rng.range(1, 6));
        }
        return 'Something that did not evolve here arrives in ' +
               sim.regionName(p.x, p.y) + '. They are calling it the ' + sp.plural() + '.';
      }
    }
  ];

  // Plagues are not written out here. Every row in js/data-plagues.js becomes
  // a button, so adding a disease stays a one-row change in one file.
  for (const s of global.PlagueData.SEEDS) {
    DISASTERS.push({
      id: 'plague-' + s.base, name: s.name, kind: 'plague', aim: 'point', cp: 4,
      tags: ['plague'], color: s.color,
      desc: s.desc,
      trigger: function (sim, opts) {
        const p = aim(sim, opts, null);
        return sim.startPlague(s.base, p.x, p.y);
      }
    });
  }

  const BY_ID = Object.create(null);
  DISASTERS.forEach(function (d, i) { d.index = i; BY_ID[d.id] = d; });

  global.Disasters = {
    ALL: DISASTERS,
    BY_ID: BY_ID,
    // Only the rows built so far are offered to the player.
    available: function (cp) {
      return DISASTERS.filter(function (d) { return (d.cp || 1) <= cp && d.kind !== 'hidden'; });
    }
  };
})(window);
