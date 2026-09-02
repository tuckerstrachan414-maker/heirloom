// HEIRLOOM - biome registry.
// Warm palette only: cream, gold, peach, rust, teal, ash. No dark neon.
//
//   food    - food/year a fully stocked tile yields. Compare against a
//             creature's upkeep, which starts at 3.0/yr before traits.
//   regrow  - fraction of capacity regained per year
//   walk    - movement multiplier
//   temp    - biome's own contribution to local temperature (0 frozen .. 1 blazing)
//   sun     - how much light reaches the ground (photosynthesis)
//   wet     - standing water; only swimmers cross it
//   burnable- can catch and carry fire

(function (global) {
  'use strict';

  const BIOMES = [
    { id: 'deep',   name: 'Deep Water', c: '#2b6b73', c2: '#255e66', food: 2.0, regrow: 0.30, walk: 0.55, temp: 0.42, sun: 0.35, wet: 2, burnable: 0 },
    { id: 'water',  name: 'Shallows',   c: '#3f8f8c', c2: '#469b95', food: 5.0, regrow: 0.42, walk: 0.65, temp: 0.46, sun: 0.60, wet: 1, burnable: 0 },
    { id: 'sand',   name: 'Sand',       c: '#e8d9b0', c2: '#ddcaa0', food: 1.8, regrow: 0.22, walk: 1.05, temp: 0.72, sun: 1.00, wet: 0, burnable: 0.2 },
    { id: 'grass',  name: 'Grassland',  c: '#d9b656', c2: '#cba84c', food: 6.0, regrow: 0.55, walk: 1.00, temp: 0.55, sun: 0.95, wet: 0, burnable: 1.0 },
    { id: 'forest', name: 'Forest',     c: '#6f8442', c2: '#63763b', food: 8.0, regrow: 0.36, walk: 0.80, temp: 0.50, sun: 0.45, wet: 0, burnable: 0.85 },
    { id: 'clay',   name: 'Clay Flats', c: '#b56a44', c2: '#a75f3c', food: 2.5, regrow: 0.20, walk: 0.95, temp: 0.80, sun: 1.00, wet: 0, burnable: 0.3 },
    { id: 'swamp',  name: 'Swamp',      c: '#6b7a4e', c2: '#5f6d46', food: 6.5, regrow: 0.55, walk: 0.60, temp: 0.58, sun: 0.65, wet: 0, burnable: 0.35 },
    { id: 'rock',   name: 'Highland',   c: '#8a8073', c2: '#7d7468', food: 1.2, regrow: 0.16, walk: 0.70, temp: 0.34, sun: 0.95, wet: 0, burnable: 0.1 },
    { id: 'ice',    name: 'Ice',        c: '#dfe9ef', c2: '#cfdde6', food: 0.9, regrow: 0.12, walk: 0.75, temp: 0.05, sun: 0.90, wet: 0, burnable: 0 },
    { id: 'ash',    name: 'Ashfield',   c: '#b9b3a8', c2: '#aca69c', food: 1.3, regrow: 0.30, walk: 0.85, temp: 0.60, sun: 0.55, wet: 0, burnable: 0.15 },
    { id: 'burnt',  name: 'Burnt Waste',c: '#5a4a3c', c2: '#4e4033', food: 0.6, regrow: 0.55, walk: 1.00, temp: 0.68, sun: 0.95, wet: 0, burnable: 0.05 },
    { id: 'lava',   name: 'Lava',       c: '#e8622a', c2: '#f08a3c', food: 0.00, regrow: 0.00, walk: 0.35, temp: 1.00, sun: 1.00, wet: 0, burnable: 0 }
  ];

  const B = Object.create(null);
  BIOMES.forEach(function (b, i) { b.index = i; B[b.id] = i; });

  global.Biomes = {
    ALL: BIOMES,
    I: B,                                  // Biomes.I.grass -> index
    get: function (i) { return BIOMES[i]; }
  };
})(window);
