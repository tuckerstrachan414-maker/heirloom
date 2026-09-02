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
// die to the state of the tile they are standing on (see Sim.hazards). That is
// why a wildfire selects for Ashlung without anything checking for Ashlung.

(function (global) {
  'use strict';

  const B = global.Biomes.I;

  const DISASTERS = [
    {
      id: 'wildfire', name: 'Wildfire', kind: 'sudden', aim: 'point', cp: 1,
      icon: 'fire', tags: ['fire'],
      desc: 'Spreads through dry grass and forest. Stops at water.',
      trigger: function (sim, opts) {
        const w = sim.world;
        let start = -1;

        if (opts && opts.x !== undefined) {
          start = w.findNear(opts.x, opts.y, 8, function (i) {
            return global.Biomes.ALL[w.biome[i]].burnable > 0.3 && w.burn[i] <= 0;
          });
        }
        if (start < 0) {
          // Unaimed fires start near something living. Picking the most
          // fuelled tile instead finds ungrazed ground, which is precisely
          // where nothing lives - the fire would burn an empty map.
          const live = sim.creatures.filter(function (c) { return c.alive; });
          for (let k = 0; k < 30 && start < 0; k++) {
            let cx, cy;
            if (live.length) {
              const c = sim.rng.pick(live); cx = c.x | 0; cy = c.y | 0;
            } else {
              cx = sim.rng.int(w.w); cy = sim.rng.int(w.h);
            }
            start = w.findNear(cx, cy, 10, function (i) {
              return global.Biomes.ALL[w.biome[i]].burnable > 0.3 && w.burn[i] <= 0;
            });
          }
        }
        if (start < 0) return null;

        const x = start % w.w, y = (start / w.w) | 0;
        let lit = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 1) continue;
            if (w.inBounds(x + dx, y + dy) && w.ignite(w.idx(x + dx, y + dy), 1)) lit++;
          }
        }
        if (!lit) return null;
        sim.shake(9);
        sim.wash('#e8622a', 0.30);
        return 'Fire in ' + sim.regionName(x, y) + '.';
      }
    }
  ];

  const BY_ID = Object.create(null);
  DISASTERS.forEach(function (d, i) { d.index = i; BY_ID[d.id] = d; });

  global.Disasters = {
    ALL: DISASTERS,
    BY_ID: BY_ID,
    // Only the rows built so far are offered to the player.
    available: function (cp) {
      return DISASTERS.filter(function (d) { return (d.cp || 1) <= cp; });
    }
  };
})(window);
