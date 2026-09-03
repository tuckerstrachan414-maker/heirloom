// HEIRLOOM - the almanac.
//
// Everything the game contains, read straight off the registries, plus what
// this particular world has actually shown the player. It is a reader and
// nothing else: it never writes to the sim and the tick never reads it, so a
// save code replays the same world whether the almanac was ever opened or not.
//
// Adding a trait, strain, disaster, biome or plague still means appending one
// row to its table (invariant 3). Every page here is generated from the table,
// so a new row shows up in the almanac by itself.
//
// The one piece of real work is "what tends to survive this": a disaster's
// `tags` are matched against trait `resist` keys. Nothing names a trait, the
// same way nothing in the sim does - Wildfire finds Ashlung because Ashlung
// resists fire, not because anyone wrote the pair down.

(function (global) {
  'use strict';

  const T = global.Traits;
  const S = global.Strains;
  const B = global.Biomes;
  const D = global.Disasters;
  const PD = global.PlagueData;

  const TABS = [
    { id: 'traits',    label: 'Traits' },
    { id: 'strains',   label: 'Strains' },
    { id: 'disasters', label: 'Disasters' },
    { id: 'land',      label: 'The land' },
    { id: 'plagues',   label: 'Plagues' }
  ];

  // Damage kinds, said the way a person would say them.
  const KIND_WORD = {
    fire: 'fire', ash: 'ash', heat: 'heat', cold: 'cold', flood: 'water',
    drought: 'drought', famine: 'hunger', impact: 'being hit', hail: 'hail',
    quake: 'the ground shaking', acid: 'acid', radiation: 'radiation',
    dust: 'dust', dark: 'the dark', storm: 'storms', predation: 'being eaten',
    rot: 'rot', disease: 'disease', silica: 'glass spores'
  };

  const KIND_LABEL = {
    sudden: 'Sudden', slow: 'Slow', good: 'Fortune',
    player: 'Yours', plague: 'Plague'
  };

  // ---- small helpers ----------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function list(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  // A world that has not run a census yet, or a sim built by a test harness,
  // simply has nothing to report. Every read below goes through these.
  function seenTraitMask(sim) { return (sim && sim.seenTraits) || 0; }
  function traitYear(sim, i) {
    const a = sim && sim.traitYear;
    return a && a[i] !== undefined ? a[i] : -1;
  }
  function seenStrains(sim) { return (sim && sim.seenStrains) || {}; }
  function seenPlagues(sim) { return (sim && sim.seenPlagues) || {}; }

  // How many creatures alive right now carry each trait.
  function carriers(sim) {
    const out = new Array(T.ALL.length).fill(0);
    if (!sim) return out;
    for (const sp of sim.species) {
      if (!sp.pop || !sp.traitCount) continue;
      for (let i = 0; i < out.length; i++) out[i] += sp.traitCount[i];
    }
    return out;
  }

  // ---- headers ----------------------------------------------------------
  function head(text, found, total) {
    return '<div class="almhead"><p>' + text + '</p>' +
           (total ? '<span class="almcount"><b>' + found + '</b> of ' + total + '</span>' : '') +
           '</div>';
  }

  function stamp(cls, text) {
    return '<div class="almseen ' + cls + '">' + esc(text) + '</div>';
  }

  // ---- traits -----------------------------------------------------------
  // Every trait costs food. That is the whole balance of the game, so the cost
  // is the first thing on the card and it is spelled out in words underneath.
  function traitsPage(sim) {
    const mask = seenTraitMask(sim);
    const carry = carriers(sim);
    let found = 0;
    for (let i = 0; i < T.ALL.length; i++) if (mask & (1 << i)) found++;

    let h = head('Every trait a creature here can end up with. You never choose ' +
      'them - mutation offers them and the world decides which ones stay. ' +
      'A plain creature needs about ' + global.Genome.BASE.upkeep.toFixed(1) +
      ' food a year, and every trait is added on top of that, so nothing can ' +
      'afford to be good at everything.', found, T.ALL.length);

    h += '<div class="almgrid">';
    for (const t of T.ALL) {
      const seen = (mask & (1 << t.index)) !== 0;
      h += '<div class="alm' + (seen ? ' got' : '') + '">';
      h += '<div class="almn">' + esc(t.name) +
           '<em title="Food per year this trait costs to run">' +
           t.cost.toFixed(1) + '/yr</em></div>';
      h += '<div class="almd">' + esc(t.desc) + '</div>';
      h += '<div class="almsnag">' + esc(t.snag) + '</div>';

      const good = [], bad = [];
      for (const k in t.resist) {
        const word = KIND_WORD[k] || k;
        if (t.resist[k] > 0) good.push({ w: word, v: t.resist[k] });
        else if (t.resist[k] < 0) bad.push({ w: word, v: -t.resist[k] });
      }
      good.sort(function (a, b) { return b.v - a.v; });
      bad.sort(function (a, b) { return b.v - a.v; });
      if (good.length) {
        h += '<div class="almline"><span>Shrugs off</span> ' +
             esc(list(good.map(function (g) { return g.w; }))) + '</div>';
      }
      if (bad.length) {
        h += '<div class="almline bad"><span>Worse against</span> ' +
             esc(list(bad.map(function (g) { return g.w; }))) + '</div>';
      }

      const n = carry[t.index];
      if (seen) {
        const yr = traitYear(sim, t.index);
        h += stamp('got', (yr >= 0 ? 'First appeared in year ' + yr + '. ' : '') +
          (n > 0 ? n + ' alive with it now.' : 'Nothing alive carries it now.'));
      } else {
        h += stamp('not', 'Has not appeared in this world.');
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  // ---- strains and flaws -------------------------------------------------
  // A strain is meant to feel like a secret, so an undiscovered row keeps its
  // recipe and its description to itself and shows only the name. The toggle
  // is there for anyone who would rather just read the book.
  function strainsPage(sim, showAll) {
    const seen = seenStrains(sim);
    const strains = S.ALL.filter(function (s) { return s.kind !== 'flaw'; });
    const flaws = S.ALL.filter(function (s) { return s.kind === 'flaw'; });
    let found = 0;
    for (const s of S.ALL) if (seen[s.id] !== undefined) found++;

    let h = head('Hold the right pair of traits at once and something new comes ' +
      'out of the combination. Nothing rolls for these - a creature either has ' +
      'both traits or it does not. Some pairs are a mistake, and those are the ' +
      'flaws.', found, S.ALL.length);

    h += '<div class="almtoggle"><button id="almReveal">' +
         (showAll ? 'Hide what I have not found' : 'Show what I have not found') +
         '</button></div>';

    h += '<div class="almsub">Strains</div><div class="almgrid">';
    for (const s of strains) h += strainCard(s, seen, showAll, 'strain');
    h += '</div>';

    h += '<div class="almsub">Flaws</div><div class="almgrid">';
    for (const s of flaws) h += strainCard(s, seen, showAll, 'flaw');
    h += '</div>';
    return h;
  }

  function strainCard(s, seen, showAll, cls) {
    const year = seen[s.id];
    const got = year !== undefined;
    const open = got || showAll;
    let h = '<div class="alm ' + cls + (got ? ' got' : '') + '">';
    h += '<div class="almn">' + esc(s.name) + '<em>' +
         (cls === 'flaw' ? 'flaw' : 'strain') + '</em></div>';
    if (open) {
      h += '<div class="almd">' + esc(s.desc) + '</div>';
      const need = s.need.map(function (id) { return T.BY_ID[id].name; });
      h += '<div class="almline"><span>Needs</span> ' + esc(need.join(' + ')) + '</div>';
      if (s.without && s.without.length) {
        const no = s.without.map(function (id) { return T.BY_ID[id].name; });
        h += '<div class="almline bad"><span>And no</span> ' + esc(no.join(', ')) + '</div>';
      }
    }
    h += got ? stamp('got', 'Found in year ' + year + '.')
             : stamp('not', 'Not found yet.');
    return h + '</div>';
  }

  // ---- disasters ---------------------------------------------------------
  // "What tends to survive it" is derived, never written down: a disaster's
  // tags are matched against trait resistances. That is the same reason a
  // wildfire selects for Ashlung without anything mentioning Ashlung.
  function survivors(d) {
    const score = Object.create(null);
    for (const tag of d.tags || []) {
      for (const t of T.ALL) {
        const r = t.resist[tag];
        if (r !== undefined && r > 0.15) score[t.id] = (score[t.id] || 0) + r;
        // A tag that is not a damage kind - metal, food, breeding - matches on
        // the trait's own tags instead, so Iron Rain still finds Iron Gut.
        else if (r === undefined && (t.tags || []).indexOf(tag) >= 0) {
          score[t.id] = (score[t.id] || 0) + 0.5;
        }
      }
    }
    return Object.keys(score)
      .sort(function (a, b) { return score[b] - score[a]; })
      .slice(0, 7)
      .map(function (id) { return T.BY_ID[id].name; });
  }

  function disastersPage(sim) {
    const rows = D.available(global.SimConfig.checkpoint);
    const cast = Object.create(null);
    for (const ev of (sim && sim.timeline) || []) {
      const r = cast[ev.id] || (cast[ev.id] = { n: 0, first: Math.floor(ev.t / 24) });
      r.n++;
    }
    let used = 0;
    for (const d of rows) if (cast[d.id]) used++;

    let h = head('Nothing here happens on a timer. The world only changes when ' +
      'you change it. A disaster does not hunt for creatures - it changes the ' +
      'ground, and whatever is standing on that ground has to cope. That is why ' +
      'the same fire that empties a valley leaves the few who can breathe smoke.',
      used, rows.length);

    h += '<div class="almgrid">';
    for (const d of rows) {
      const r = cast[d.id];
      h += '<div class="alm dis-' + d.kind + (r ? ' got' : '') + '">';
      h += '<div class="almn">' + esc(d.name) + '<em>' +
           esc(KIND_LABEL[d.kind] || d.kind) + '</em></div>';
      h += '<div class="almd">' + esc(d.desc) + '</div>';
      h += '<div class="almline"><span>How to use it</span> ' +
           (d.aim === 'point' ? 'pick it, then click the map'
                              : 'pick it - it hits everywhere at once') + '</div>';
      const surv = survivors(d);
      if (surv.length) {
        h += '<div class="almline"><span>' +
             (d.kind === 'good' ? 'Best placed to use it' : 'Tends to survive it') +
             '</span> ' + esc(surv.join(', ')) + '</div>';
      }
      h += r ? stamp('got', 'You have used it ' + r.n + (r.n === 1 ? ' time' : ' times') +
                     ', first in year ' + r.first + '.')
             : stamp('not', 'Never used in this world.');
      h += '</div>';
    }
    return h + '</div>';
  }

  // ---- the land ----------------------------------------------------------
  function tempWord(v) {
    return v < 0.2 ? 'frozen' : v < 0.42 ? 'cold' : v < 0.62 ? 'mild'
         : v < 0.85 ? 'warm' : 'blazing';
  }

  function foodWord(food) {
    const up = global.Genome.BASE.upkeep;
    if (food <= 0) return 'Nothing grows. Nothing can stay.';
    if (food < up) return 'Less than a plain creature burns. Only a specialist lasts here.';
    if (food < up * 2) return 'Enough to get by on, and not much more.';
    if (food < up * 3) return 'Good ground.';
    return 'The richest ground on the map. This is where the crowds are.';
  }

  function landPage(sim) {
    const counts = (sim && sim.biomeCount) || null;
    const seenMask = (sim && sim.seenBiomes) || 0;
    const total = sim && sim.world ? sim.world.n : 0;
    let found = 0;
    for (let i = 0; i < B.ALL.length; i++) if (seenMask & (1 << i)) found++;

    let h = head('What the ground is worth. Food is measured per year at full ' +
      'stock, against the ' + global.Genome.BASE.upkeep.toFixed(1) +
      ' food a year a plain creature burns just staying alive - so a tile ' +
      'below that number is a place things pass through, not a place they live. ' +
      'Disasters rewrite this map, and burnt ground grows back.', found, B.ALL.length);

    h += '<div class="almgrid">';
    for (const b of B.ALL) {
      const n = counts ? counts[b.index] : 0;
      const share = total ? n / total : 0;
      h += '<div class="alm' + (seenMask & (1 << b.index) ? ' got' : '') + '">';
      h += '<div class="almn"><i class="almswatch" style="background:' + b.c + '"></i>' +
           esc(b.name) + '<em>' + b.food.toFixed(1) + '/yr</em></div>';
      h += '<div class="almd">' + esc(foodWord(b.food)) + '</div>';
      h += '<div class="almline"><span>Getting about</span> ' +
           (b.wet ? 'only swimmers cross it'
                  : b.walk >= 1 ? 'easy going'
                  : b.walk >= 0.75 ? 'slow going' : 'hard going') +
           ', and it is ' + tempWord(b.temp) + '</div>';
      h += '<div class="almline"><span>Fire</span> ' +
           (b.burnable >= 0.8 ? 'burns readily'
            : b.burnable > 0.15 ? 'burns poorly' : 'will not burn') + '</div>';
      h += n > 0
        ? stamp('got', pct(share) + ' of the map right now.')
        : stamp('not', (seenMask & (1 << b.index)) ? 'None left on the map.'
                                                   : 'Not in this world.');
      h += '</div>';
    }
    return h + '</div>';
  }

  // ---- plagues -----------------------------------------------------------
  function plaguesPage(sim) {
    const seen = seenPlagues(sim);
    let found = 0;
    for (const s of PD.SEEDS) if (seen[s.base] !== undefined) found++;

    // Every lineage this world has seen, live and spent, grouped by seed.
    const lineages = Object.create(null);
    const all = sim ? (sim.plagues || []).concat(sim.pastPlagues || []) : [];
    for (const p of all) {
      const g = lineages[p.base] || (lineages[p.base] = { n: 0, live: 0, worst: 0, killed: 0 });
      g.n++;
      if (p.active > 0) g.live++;
      if (p.lethality > g.worst) g.worst = p.lethality;
      g.killed += p.killed || 0;
    }

    let h = head('Three diseases, and no more. Everything else on this page is ' +
      'something a disease turned into on its own: each time one changes hands ' +
      'it can mutate, and the new version keeps whichever numbers let it find ' +
      'the next body. Nothing in the game makes a plague get milder or nastier. ' +
      'Whichever version keeps spreading is the one you are left with. Whoever ' +
      'lives through one keeps their immunity - but only against the exact ' +
      'version they beat, which is why a mutating disease keeps finding bodies.',
      found, PD.SEEDS.length);

    h += '<div class="almgrid">';
    for (const s of PD.SEEDS) {
      const g = lineages[s.base];
      const year = seen[s.base];
      const live = (Math.exp(-s.lethality * s.incubation) -
                    Math.exp(-s.lethality * s.duration)) / s.lethality;
      const R = s.transmission * Math.max(0, live) +
                (s.burst || 0) * (1 - Math.exp(-s.lethality * s.duration));

      h += '<div class="alm plague' + (year !== undefined ? ' got' : '') + '">';
      h += '<div class="almn"><i class="almswatch" style="background:' + s.color + '"></i>' +
           esc(s.name) + '<em title="New cases one sick creature is worth. Under 1 ' +
           'and it burns out in its first few bodies.">R ' + R.toFixed(1) + '</em></div>';
      h += '<div class="almd">' + esc(s.desc) + '</div>';
      h += '<div class="almline"><span>Passes to</span> ' + s.transmission.toFixed(1) +
           ' a year &middot; <span>kills</span> ' + s.lethality.toFixed(2) +
           ' a year &middot; <span>lasts</span> ' + s.duration.toFixed(1) + ' years</div>';
      if (s.seeks) {
        h += '<div class="almline"><span>Behaviour</span> the sick walk toward the healthy</div>';
      }
      if (s.burst) {
        h += '<div class="almline bad"><span>On death</span> it takes the neighbours with it, ' +
             'so killing fast is how this one travels</div>';
      }
      if (year !== undefined && g) {
        h += stamp('got', 'Released in year ' + year + '. ' + g.n +
          (g.n === 1 ? ' version' : ' versions') + ' since, ' + g.live + ' still going, ' +
          'the worst of them killing ' + g.worst.toFixed(2) + ' a year.');
      } else if (year !== undefined) {
        h += stamp('got', 'Released in year ' + year + '.');
      } else {
        h += stamp('not', 'Never released in this world.');
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  // ---- the page ----------------------------------------------------------
  function page(sim, tab, showAll) {
    switch (tab) {
      case 'strains':   return strainsPage(sim, showAll);
      case 'disasters': return disastersPage(sim);
      case 'land':      return landPage(sim);
      case 'plagues':   return plaguesPage(sim);
      default:          return traitsPage(sim);
    }
  }

  global.Almanac = { TABS: TABS, page: page, survivors: survivors };
})(window);
