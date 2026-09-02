// HEIRLOOM - creatures: genome, derived stats, inheritance, mutation.
//
// A creature's traits are a 26-bit mask. Every number that matters is derived
// from that mask once, at birth, and cached per-genome - the sim then runs on
// plain floats and never walks the trait list again.

(function (global) {
  'use strict';

  const T = global.Traits;

  const BASE = {
    speed: 2.6,        // tiles per year
    upkeep: 3.0,       // food per year just to stay alive
    lifespan: 22,
    maturity: 4,
    fertility: 1,
    litter: 1,
    forage: 1,
    vision: 3,
    mateRange: 3.5,
    coldTol: 0,        // shifts the temperature band the creature tolerates
    heatTol: 0,
    armour: 0,
    frailty: 0,
    reserve: 14,       // energy ceiling; fat to burn in a bad year
    mutate: 1
  };

  const FOOD_KEYS = ['sunFood', 'radFood', 'ironFood', 'coastFood'];
  const FLAG_KEYS = ['rooted', 'swim', 'selfBreed', 'clone', 'burnBirth', 'eggBank',
                     'nocturnal', 'sheltered', 'toxic', 'conspicuous', 'scavenge',
                     'ironPlating'];

  const deriveCache = new Map();

  function derive(mask) {
    let d = deriveCache.get(mask);
    if (d) return d;

    d = {
      speed: BASE.speed, upkeep: BASE.upkeep, lifespan: BASE.lifespan,
      maturity: BASE.maturity, fertility: BASE.fertility, litter: BASE.litter,
      forage: BASE.forage, vision: BASE.vision, mateRange: BASE.mateRange,
      coldTol: BASE.coldTol, heatTol: BASE.heatTol, armour: BASE.armour,
      frailty: BASE.frailty, reserve: BASE.reserve, mutate: BASE.mutate,
      sunFood: 0, radFood: 0, ironFood: 0, coastFood: 0,
      dormancy: null, mask: mask, traits: T.listOf(mask), traitCost: 0,
      resist: Object.create(null)
    };
    for (const k of FLAG_KEYS) d[k] = 0;

    const remain = Object.create(null);   // multiplicative damage passthrough

    for (const t of d.traits) {
      d.traitCost += t.cost;
      const m = t.mods;

      // multiplicative stats
      if (m.speed !== undefined) d.speed *= m.speed;
      if (m.lifespan !== undefined) d.lifespan *= m.lifespan;
      if (m.maturity !== undefined) d.maturity *= m.maturity;
      if (m.fertility !== undefined) d.fertility *= m.fertility;
      if (m.forage !== undefined) d.forage *= m.forage;
      if (m.vision !== undefined) d.vision *= m.vision;
      if (m.mateRange !== undefined) d.mateRange *= m.mateRange;
      if (m.mutate !== undefined) d.mutate *= m.mutate;

      // additive stats
      if (m.litter !== undefined) d.litter += m.litter;
      if (m.coldTol !== undefined) d.coldTol += m.coldTol;
      if (m.heatTol !== undefined) d.heatTol += m.heatTol;
      if (m.armour !== undefined) d.armour += m.armour;
      if (m.frailty !== undefined) d.frailty += m.frailty;
      if (m.reserve !== undefined) d.reserve += m.reserve;
      for (const k of FOOD_KEYS) if (m[k] !== undefined) d[k] += m[k];
      for (const k of FLAG_KEYS) if (m[k] !== undefined) d[k] += m[k];
      if (m.dormancy) d.dormancy = (d.dormancy === 'lethal') ? 'lethal' : m.dormancy;

      // resistances stack on what still gets through, so two half-defences
      // leave a quarter of the damage - and a vulnerability multiplies it up.
      for (const kind in t.resist) {
        const r = t.resist[kind];
        remain[kind] = (remain[kind] === undefined ? 1 : remain[kind]) * (1 - r);
      }
    }

    // Nothing is ever fully immune. A disaster must always be able to kill you.
    for (const kind in remain) {
      d.resist[kind] = Math.max(-3, Math.min(0.97, 1 - remain[kind]));
    }

    // Hot resistances get their own numeric fields: hazards() reads these
    // every creature every tick and a property miss is expensive there.
    d.rFire = d.resist.fire || 0;
    d.rCold = d.resist.cold || 0;
    d.rHeat = d.resist.heat || 0;
    d.rAsh = d.resist.ash || 0;
    d.rRad = d.resist.radiation || 0;
    d.rFlood = d.resist.flood || 0;
    d.tempLo = 0.20 - d.coldTol;
    d.tempHi = 0.90 + d.heatTol;

    d.upkeep = BASE.upkeep + d.traitCost;
    d.litter = Math.max(1, Math.round(d.litter));
    d.maturity = Math.max(0.8, d.maturity);
    if (d.rooted) d.speed = 0;

    deriveCache.set(mask, d);
    return d;
  }

  function resistOf(d, kind) {
    const r = d.resist[kind];
    return r === undefined ? 0 : r;
  }

  // ---- genome operations ------------------------------------------------
  const SLOTS = 6;
  // Traits that cannot share a body.
  const EXCLUSIVE = [['stonehide', 'glassbones'], ['rootfoot', 'buoyant']];

  function enforceExclusive(mask, rng) {
    for (const pair of EXCLUSIVE) {
      const a = T.bit(pair[0]), b = T.bit(pair[1]);
      if ((mask & a) && (mask & b)) mask &= ~(rng.chance(0.5) ? a : b);
    }
    return mask;
  }

  function trimToSlots(mask, rng) {
    let ids = T.idsOf(mask);
    while (ids.length > SLOTS) {
      ids.splice(rng.int(ids.length), 1);
    }
    return T.maskOf(ids);
  }

  // Child genome: each slot drawn from one parent or the other, then mutated.
  function inherit(maskA, maskB, rng, pool, mutChance, mutMul) {
    let ids;
    if (maskA === maskB) {
      ids = T.idsOf(maskA);
    } else {
      const set = new Set();
      const a = T.idsOf(maskA), b = T.idsOf(maskB);
      // Traits both parents carry are near-certain; single-parent traits are a coin flip.
      for (const id of a) set.add(id);
      for (const id of b) set.add(id);
      ids = [];
      for (const id of set) {
        const inA = a.indexOf(id) >= 0, inB = b.indexOf(id) >= 0;
        const p = (inA && inB) ? 0.97 : 0.5;
        if (rng.chance(p)) ids.push(id);
      }
    }
    let mask = T.maskOf(ids);

    if (rng.chance(mutChance * mutMul)) mask = mutate(mask, rng, pool);
    mask = enforceExclusive(mask, rng);
    mask = trimToSlots(mask, rng);
    return mask;
  }

  // One mutation event: gain, swap or lose a trait.
  function mutate(mask, rng, pool) {
    const held = T.idsOf(mask);
    const free = pool.filter(function (id) { return !T.has(mask, id); });
    const roll = rng.next();

    if (held.length < SLOTS && free.length && roll < 0.62) {
      mask |= T.bit(rng.pick(free));
    } else if (held.length && free.length && roll < 0.88) {
      mask &= ~T.bit(rng.pick(held));
      mask |= T.bit(rng.pick(free));
    } else if (held.length) {
      mask &= ~T.bit(rng.pick(held));
    } else if (free.length) {
      mask |= T.bit(rng.pick(free));
    }
    return mask;
  }

  global.Genome = {
    SLOTS: SLOTS,
    BASE: BASE,
    derive: derive,
    resistOf: resistOf,
    inherit: inherit,
    mutate: mutate,
    enforceExclusive: enforceExclusive,
    trimToSlots: trimToSlots,
    clearCache: function () { deriveCache.clear(); }
  };
})(window);
