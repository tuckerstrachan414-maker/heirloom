// HEIRLOOM - the plague registry.
//
// THE EXTENSION POINT: adding a disease = appending one row to SEEDS. The
// button on the Plagues tab, the panel entry and the mutation machinery all
// come from the row; nothing else has to be touched.
//
//   transmission - new hosts this one passes it to, per year, while infectious
//   lethality    - deaths per year while infected
//   incubation   - years before it can spread at all
//   duration     - years of infection, after which the host recovers immune
//   kind         - damage kind, so trait resistances already apply to it
//   requires     - optional host filter: (creature, sim) => bool
//   seeks        - infected walk toward the healthy
//   burst        - on death it takes this many nearby with it, which turns
//                  lethality into a way of spreading instead of a cost
//
// One host is worth transmission x (the time it survives while infectious) new
// cases, plus its burst. Under about 1 and the outbreak dies in its first few
// bodies. The three rows below sit either side of that line on purpose: the
// Bloom has time and drifts mild, the Cordyceps has none and drifts vicious.

(function (global) {
  'use strict';

  const SEEDS = [
    {
      base: 'whisper', name: 'Whisper Plague', kind: 'disease',
      transmission: 2.6, lethality: 0.30, incubation: 0.5, duration: 4.0,
      color: '#b9a8d8',
      desc: 'It only takes hold where they are packed in close together.',
      // A crowd disease: it needs a busy neighbourhood to find its next host.
      requires: function (c, sim) {
        const cell = sim.grid[c.g];
        return !!cell && cell.length >= 3;
      }
    },
    {
      base: 'cordyceps', name: 'Cordyceps Bloom', kind: 'disease',
      transmission: 1.2, lethality: 0.55, incubation: 0.4, duration: 2.2,
      color: '#c8a24a',
      desc: 'The infected walk toward the healthy, and then they burst.',
      seeks: 1, burst: 1
    },
    {
      base: 'glass', name: 'Bloom of Glass', kind: 'silica',
      transmission: 3.0, lethality: 0.55, incubation: 0.3, duration: 3.0,
      color: '#cfe0e8',
      desc: 'Silica spores. They kill lungs, unless something keeps them out.'
    }
  ];

  // Variant names come off the lineage root, never off the parent's name -
  // deriving one from the other grows a tail of suffixes within a century.
  const RN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'],
              [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'],
              [5, 'V'], [4, 'IV'], [1, 'I']];

  function roman(n) {
    let s = '';
    for (const r of RN) while (n >= r[0]) { s += r[1]; n -= r[0]; }
    return s;
  }

  function variantName(root, gen) {
    return gen <= 1 ? root : root + ' ' + roman(gen);
  }

  // How far a mutation is allowed to move each number, as a fraction of it.
  const DRIFT = {
    transmission: 0.30,
    lethality: 0.45,
    incubation: 0.35,
    duration: 0.30,
    chance: 0.02           // per successful transmission
  };

  const LIMITS = {
    transmission: [0.08, 12.0],
    lethality: [0.01, 2.4],
    incubation: [0.1, 3.0],
    duration: [0.8, 14]
  };

  global.PlagueData = {
    SEEDS: SEEDS,
    DRIFT: DRIFT,
    LIMITS: LIMITS,
    variantName: variantName
  };
})(window);
