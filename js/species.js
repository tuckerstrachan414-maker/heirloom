// HEIRLOOM - species records, naming and colour.
//
// A species name is generated from its traits, so it always describes what
// actually happened to it. A burrowing ash-breather becomes the Ashdelvers.

(function (global) {
  'use strict';

  const T = global.Traits;

  const PLAIN_PREFIX = ['Pale', 'Dun', 'Umber', 'Ochre', 'Sable', 'Tawny',
                        'Vale', 'Marsh', 'Dust', 'Reed', 'Loam', 'Bramble'];
  const PLAIN_SUFFIX = ['kin', 'crawler', 'walker', 'folk', 'brood', 'spine',
                        'hide', 'wing', 'grazer', 'creeper'];

  let nextId = 1;

  function Species(opts) {
    this.id = nextId++;
    this.name = opts.name || 'Unnamed';
    this.hue = opts.hue !== undefined ? opts.hue : 40;
    this.coreMask = opts.coreMask || 0;
    this.parent = opts.parent || null;
    this.children = [];
    this.founded = opts.founded || 0;
    this.foundedBy = opts.foundedBy || null;   // the disaster that split them off
    this.extinct = null;
    this.pop = 0;
    this.peakPop = 0;
    this.born = 0;
    this.died = 0;
    this.generations = 0;
    this.strains = [];
    this.sickly = false;                        // carries an anti-synergy
    this.traitCount = new Int32Array(T.ALL.length);
    this.recolour();
    if (this.parent) this.parent.children.push(this);
  }

  Species.prototype.recolour = function () {
    const h = ((this.hue % 360) + 360) % 360;
    this.color = hsl(h, this.sickly ? 22 : 66, this.sickly ? 44 : 60);
    this.dark = hsl(h, this.sickly ? 20 : 52, 30);
    this.light = hsl(h, this.sickly ? 26 : 66, 78);
  };

  function hsl(h, s, l) { return 'hsl(' + h.toFixed(0) + ',' + s + '%,' + l + '%)'; }

  Species.prototype.plural = function () {
    return /s$/.test(this.name) ? this.name : this.name + 's';
  };

  // ---- naming -----------------------------------------------------------
  // The loudest trait donates the prefix; a second donates the suffix.
  function nameFor(mask, rng, taken) {
    const traits = T.listOf(mask).slice();
    // Expensive traits shout louder than cheap ones.
    traits.sort(function (a, b) { return b.cost - a.cost; });

    const prefixes = traits.filter(function (t) { return t.prefix; });
    const suffixes = traits.filter(function (t) { return t.suffix; });

    for (let attempt = 0; attempt < 24; attempt++) {
      let p, s;
      if (prefixes.length && attempt < 12) {
        p = prefixes[Math.min(prefixes.length - 1, attempt % Math.max(1, prefixes.length))].prefix;
      } else {
        p = rng.pick(PLAIN_PREFIX);
      }
      if (suffixes.length && attempt < 12) {
        // Do not take prefix and suffix from the same trait if we can help it.
        const pool = suffixes.filter(function (t) { return t.prefix !== p; });
        s = (pool.length ? rng.pick(pool) : rng.pick(suffixes)).suffix;
      } else {
        s = rng.pick(PLAIN_SUFFIX);
      }
      const name = p + s;
      if (!taken || !taken.has(name.toLowerCase())) {
        if (taken) taken.add(name.toLowerCase());
        return name;
      }
    }
    let n = 2, base = rng.pick(PLAIN_PREFIX) + rng.pick(PLAIN_SUFFIX);
    while (taken && taken.has((base + ' ' + n).toLowerCase())) n++;
    const name = base + ' ' + n;
    if (taken) taken.add(name.toLowerCase());
    return name;
  }

  // Hue drawn from the loudest trait's paint tint where there is one, so a
  // species' colour hints at what it carries.
  function hueFor(mask, rng, parentHue) {
    const traits = T.listOf(mask);
    for (const t of traits) {
      if (t.paint && t.paint.hue !== undefined) return t.paint.hue;
    }
    if (parentHue !== undefined && parentHue !== null) {
      return parentHue + rng.range(28, 74) * (rng.chance(0.5) ? 1 : -1);
    }
    return rng.range(0, 360);
  }

  global.SpeciesLib = {
    Species: Species,
    nameFor: nameFor,
    hueFor: hueFor,
    resetIds: function () { nextId = 1; }
  };
})(window);
