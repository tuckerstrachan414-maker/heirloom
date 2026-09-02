// HEIRLOOM - the family tree.
//
// Every species that ever lived, drawn against the years, with a line dropping
// from the parent at the moment it split and a faint rule at every disaster
// the player set off. It is meant to be looked at and screenshotted, so it is
// one flat SVG: no interaction, no state, nothing to get out of date.

(function (global) {
  'use strict';

  const T = global.Traits;

  const W = 1000;              // viewBox width; the card scales it to fit
  const GUT = 196;             // left gutter, for names
  const RIGHT = 74;            // right margin, for the end-of-life note
  const TOP = 46;              // room for the year axis and disaster labels
  const LANE = 46;             // vertical pitch per species
  const BAR = 15;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Parents immediately above their children, oldest first. A species whose
  // parent is missing (there is none, at the root) sorts by founding year.
  function order(species) {
    const roots = species.filter(function (s) { return !s.parent; });
    const out = [];
    (function walk(list, depth) {
      list.slice().sort(function (a, b) { return a.founded - b.founded || a.id - b.id; })
        .forEach(function (s) {
          out.push({ sp: s, depth: depth });
          walk(species.filter(function (k) { return k.parent === s; }), depth + 1);
        });
    })(roots, 0);
    // Anything orphaned (an invasive species arrives with no parent) is a root
    // already, but guard so nothing can be silently dropped from the picture.
    for (const s of species) if (!out.some(function (o) { return o.sp === s; })) out.push({ sp: s, depth: 0 });
    return out;
  }

  // Which traits this species carries that its parent did not, trimmed to
  // what fits the gutter - the line is drawn beside the bars, and a species
  // carrying five traits would otherwise write straight across the plot.
  const GUTCHARS = 33;

  function gained(sp) {
    const from = sp.parent ? sp.parent.coreMask : 0;
    const names = T.listOf(sp.coreMask & ~from).map(function (t) { return t.name; });
    if (!names.length) return sp.parent ? 'nothing new' : 'plain stock';
    let out = '', kept = 0;
    for (const n of names) {
      const next = out ? out + ', ' + n : n;
      if (kept && next.length > GUTCHARS) break;
      out = next; kept++;
    }
    const rest = names.length - kept;
    return rest > 0 ? out + ' +' + rest : out;
  }

  function build(sim, seedText) {
    const rows = order(sim.species);
    const now = Math.max(1, sim.year);
    const H = TOP + rows.length * LANE + 34;
    const plot = W - GUT - RIGHT;
    const X = function (yr) { return GUT + Math.max(0, Math.min(1, yr / now)) * plot; };
    const Y = function (i) { return TOP + i * LANE + LANE / 2; };

    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" ' +
            'preserveAspectRatio="xMidYMin meet" font-family="Georgia,serif">';

    // --- the years
    const step = now <= 60 ? 10 : now <= 160 ? 25 : now <= 400 ? 50 : now <= 900 ? 100 : 250;
    for (let yr = 0; yr <= now; yr += step) {
      s += '<line x1="' + X(yr).toFixed(1) + '" y1="' + (TOP - 8) + '" x2="' + X(yr).toFixed(1) +
           '" y2="' + (H - 26) + '" stroke="#d9a441" stroke-opacity="0.07"/>' +
           '<text x="' + X(yr).toFixed(1) + '" y="' + (H - 10) + '" fill="#8a8070" font-size="11" ' +
           'text-anchor="middle">' + yr + '</text>';
    }

    // --- the disasters that caused all this
    const marks = (sim.timeline || []).slice(-16);
    marks.forEach(function (m, i) {
      const x = X(m.t / 24).toFixed(1);   // the timeline records ticks, not years
      s += '<line x1="' + x + '" y1="' + (TOP - 30) + '" x2="' + x + '" y2="' + (H - 26) +
           '" stroke="#c07a4a" stroke-opacity="0.22" stroke-dasharray="2 3"/>' +
           '<text x="' + x + '" y="' + (TOP - 34 - (i % 2) * 13) + '" fill="#c08a5a" font-size="9.5" ' +
           'text-anchor="middle" letter-spacing="0.06em">' + esc(m.name.toUpperCase()) + '</text>';
    });

    // --- one lane per species
    rows.forEach(function (r, i) {
      const sp = r.sp, y = Y(i);
      const x0 = X(sp.founded);
      const x1 = X(sp.extinct === null ? now : sp.extinct);
      const alive = sp.pop > 0;

      if (sp.parent) {
        const pi = rows.findIndex(function (k) { return k.sp === sp.parent; });
        if (pi >= 0) {
          s += '<path d="M' + x0.toFixed(1) + ' ' + Y(pi) + ' V' + y + '" fill="none" ' +
               'stroke="' + sp.parent.color + '" stroke-opacity="0.5" stroke-width="1.5"/>' +
               '<circle cx="' + x0.toFixed(1) + '" cy="' + Y(pi) + '" r="3" fill="' + sp.parent.color + '"/>';
        }
      }

      s += '<rect x="' + x0.toFixed(1) + '" y="' + (y - BAR / 2) + '" width="' +
           Math.max(3, x1 - x0).toFixed(1) + '" height="' + BAR + '" rx="' + (BAR / 2) +
           '" fill="' + sp.color + '" fill-opacity="' + (alive ? 0.95 : 0.4) + '"/>';
      if (!alive) {
        s += '<line x1="' + x1.toFixed(1) + '" y1="' + (y - 9) + '" x2="' + x1.toFixed(1) +
             '" y2="' + (y + 9) + '" stroke="#d4886a" stroke-width="1.5"/>';
      }

      // name and what it carries, in the gutter
      s += '<rect x="14" y="' + (y - 5) + '" width="9" height="9" rx="2" fill="' + sp.color + '"' +
           (alive ? '' : ' fill-opacity="0.4"') + '/>' +
           '<text x="29" y="' + (y - 1) + '" font-size="13" fill="' + (alive ? '#e8dcc2' : '#8a8070') +
           '"' + (r.depth ? ' font-style="italic"' : '') + '>' + esc(sp.plural()) + '</text>';
      s += '<text x="29" y="' + (y + 12) + '" font-size="10" fill="#8a8070">' +
           esc(gained(sp)) + '</text>';

      // and how it ended, at the right
      const note = alive ? sp.pop + ' now' : 'died y' + sp.extinct;
      s += '<text x="' + (W - RIGHT + 10) + '" y="' + (y + 4) + '" font-size="11" fill="' +
           (alive ? '#c8bda4' : '#8a8070') + '">' + esc(note) + '</text>';
      s += '<text x="' + (x1 + 7).toFixed(1) + '" y="' + (y - 9) + '" font-size="9.5" ' +
           'fill="#7d745f">peak ' + sp.peakPop + '</text>';

      if (sp.foundedBy) {
        s += '<text x="' + (x0 + 6).toFixed(1) + '" y="' + (y + 20) + '" font-size="9.5" ' +
             'fill="#c08a5a" fill-opacity="0.85">after the ' + esc(sp.foundedBy.toLowerCase()) + '</text>';
      }
    });

    s += '</svg>';

    const living = sim.livingSpecies().length;
    const head = esc(seedText) + ' &middot; year ' + Math.floor(sim.year) + ' &middot; ' +
                 sim.species.length + ' species ever, ' + living + ' still here';
    return { svg: s, head: head };
  }

  global.Tree = { build: build };
})(window);
