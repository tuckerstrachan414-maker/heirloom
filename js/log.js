// HEIRLOOM - the log and the narrator.
//
// The log is the loudest thing in the game. It is a field journal, not a
// combat readout: short, dry, past tense, and it never explains a mechanic.
//
//   Year 214. Fire in the north.
//   The Ashdelvers survived. Three of forty remain.
//   Year 219. All three carry Ashlung.

(function (global) {
  'use strict';

  const T = global.Traits;

  const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
                 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function num(n) { return n <= 12 ? WORDS[n] : String(n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function Log(el, max) {
    this.el = el;
    this.max = max || 320;
    this.lines = [];
  }

  Log.prototype.say = function (text, cls, year) {
    const line = { text: text, cls: cls || 'plain', year: year };
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.shift();
    if (this.el) {
      const div = document.createElement('div');
      div.className = 'logline ' + line.cls;
      div.textContent = text;
      this.el.appendChild(div);
      while (this.el.childNodes.length > this.max) this.el.removeChild(this.el.firstChild);
      this.el.scrollTop = this.el.scrollHeight;
    }
    return line;
  };

  Log.prototype.clear = function () {
    this.lines.length = 0;
    if (this.el) this.el.innerHTML = '';
  };

  Log.prototype.text = function () {
    return this.lines.map(function (l) { return l.text; }).join('\n');
  };

  // ---- narrator ---------------------------------------------------------
  function Narrator(sim, log) {
    this.sim = sim;
    this.log = log;
    this.mem = new Map();          // species -> what we have already said about it
    this.pending = null;           // a disaster waiting to be scored
    this.quiet = 0;
    this.lastYearSaid = -1;
  }

  Narrator.prototype.memo = function (sp) {
    let m = this.mem.get(sp);
    if (!m) {
      m = { lastPop: sp.pop, fixed: new Set(), peakSaid: 0, introduced: false };
      this.mem.set(sp, m);
    }
    return m;
  };

  // "Year 214. " prefix, but only once per year, so a busy year reads as a
  // paragraph rather than a list.
  Narrator.prototype.stamp = function (y) {
    if (y === this.lastYearSaid) return '';
    this.lastYearSaid = y;
    return 'Year ' + y + '. ';
  };

  Narrator.prototype.disaster = function (d, line) {
    const y = Math.floor(this.sim.year);
    this.log.say(this.stamp(y) + line, 'event', y);
    const snap = [];
    for (const sp of this.sim.livingSpecies()) snap.push({ sp: sp, pop: sp.pop });
    this.pending = { name: d.name, id: d.id, year: y, snap: snap, dueAt: y + 3 };
    this.quiet = 0;
  };

  Narrator.prototype.founded = function (sp, x, y0) {
    const y = Math.floor(this.sim.year);
    this.log.say(this.stamp(y) + 'The ' + sp.plural() + ' are seeded in ' +
      this.sim.regionName(x || 0, y0 || 0) + '.', 'life', y);
    this.memo(sp).introduced = true;
  };

  // Called once per simulated year.
  Narrator.prototype.year = function (y) {
    const sim = this.sim;
    this.quiet++;

    // Score a disaster a few years after it landed, once the dying is done.
    if (this.pending && y >= this.pending.dueAt) {
      const p = this.pending; this.pending = null;
      for (const s of p.snap) {
        const sp = s.sp;
        if (s.pop < 4) continue;
        const now = sp.pop, lost = s.pop - now;
        if (now === 0) {
          this.log.say(this.stamp(y) + 'The ' + sp.plural() + ' did not survive it.', 'death', y);
        } else if (lost >= Math.max(3, s.pop * 0.35)) {
          this.log.say(this.stamp(y) + 'The ' + sp.plural() + ' survived. ' +
            cap(num(now)) + ' of ' + num(s.pop) + ' remain.', 'death', y);
          this.survivorTraits(sp, y);
        } else if (lost > 0) {
          this.log.say(this.stamp(y) + 'The ' + sp.plural() + ' lost ' + num(lost) + '.', 'plain', y);
        }
      }
      this.quiet = 0;
    }

    for (const sp of sim.species) {
      const m = this.memo(sp);
      if (sp.pop === 0) { m.lastPop = 0; continue; }

      if (sp.pop >= 3) {
        for (let i = 0; i < T.ALL.length; i++) {
          const share = sp.traitCount[i] / sp.pop;
          const id = T.ALL[i].id;
          if (share >= 0.95 && !m.fixed.has(id)) {
            m.fixed.add(id);
            this.log.say(this.stamp(y) + (sp.pop <= 14
              ? 'All ' + num(sp.pop) + ' carry ' + T.ALL[i].name + '.'
              : 'Every ' + sp.name + ' now carries ' + T.ALL[i].name + '.'), 'life', y);
            this.quiet = 0;
          } else if (share <= 0.05 && m.fixed.has(id)) {
            m.fixed.delete(id);
            this.log.say(this.stamp(y) + T.ALL[i].name + ' has gone out of the ' +
              sp.plural() + '.', 'plain', y);
            this.quiet = 0;
          }
        }
      }

      if (m.lastPop >= 12 && sp.pop >= m.lastPop * 2 && y - m.peakSaid > 12) {
        m.peakSaid = y;
        this.log.say(this.stamp(y) + 'The ' + sp.plural() + ' have doubled. ' +
          sp.pop + ' of them now.', 'life', y);
        this.quiet = 0;
      }
      m.lastPop = sp.pop;
    }

    if (this.quiet > 26) { this.quiet = 0; this.idle(y); }
  };

  // After a cull: if the handful left standing all share something, say so.
  // This one line is the whole game.
  Narrator.prototype.survivorTraits = function (sp, y) {
    if (sp.pop === 0 || sp.pop > 40) return;
    let bestI = -1, bestShare = 0;
    for (let i = 0; i < T.ALL.length; i++) {
      const share = sp.traitCount[i] / sp.pop;
      if (share > bestShare) { bestShare = share; bestI = i; }
    }
    if (bestI >= 0 && bestShare >= 0.85) {
      const m = this.memo(sp);
      if (!m.fixed.has(T.ALL[bestI].id)) {
        m.fixed.add(T.ALL[bestI].id);
        this.log.say('They all carry ' + T.ALL[bestI].name + '.', 'life', y);
      }
    }
  };

  Narrator.prototype.extinct = function (sp) {
    const y = Math.floor(this.sim.year);
    this.log.say(this.stamp(y) + 'The last of the ' + sp.plural() + ' is gone. ' +
      (sp.children.length ? 'Their line continues elsewhere.' : 'Nothing carried them on.'),
      'death', y);
    this.quiet = 0;
  };

  function listOf(a) {
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }

  // A split is the loudest thing that can happen without a disaster.
  Narrator.prototype.split = function (child, parent, n) {
    const y = Math.floor(this.sim.year);
    const gained = T.listOf(child.coreMask & ~parent.coreMask).map(function (t) { return t.name; });
    const lost = T.listOf(parent.coreMask & ~child.coreMask).map(function (t) { return t.name; });
    let line = 'The ' + child.plural() + ' have split from the ' + parent.plural() + '.';
    if (gained.length) line += ' They carry ' + listOf(gained.slice(0, 3)) + '.';
    else if (lost.length) line += ' They have lost ' + listOf(lost.slice(0, 2)) + '.';
    this.log.say(this.stamp(y) + line, 'split', y);
    if (child.foundedBy) {
      this.log.say('It started with the ' + child.foundedBy.toLowerCase() + '.', 'plain', y);
    }
    this.memo(child).lastPop = child.pop;
    this.quiet = 0;
  };

  // A slow disaster letting go is worth a line of its own.
  Narrator.prototype.effectEnd = function (d, line) {
    const y = Math.floor(this.sim.year);
    this.log.say(this.stamp(y) + line, 'event', y);
    this.quiet = 0;
  };

  // Finding a strain should read like finding a secret.
  Narrator.prototype.strain = function (s, c) {
    const y = Math.floor(this.sim.year);
    this.log.say(this.stamp(y) + 'Something new among the ' + c.sp.plural() + ': ' + s.name + '.', 'split', y);
    this.log.say(s.desc, 'life', y);
    this.quiet = 0;
  };

  const IDLE = ['The world is quiet.',
                'Nothing much happens for a while.',
                'Grass returns to the burnt ground.',
                'A generation lives and dies without incident.',
                'The seasons turn.',
                'Nothing is written down this year.'];

  Narrator.prototype.idle = function (y) {
    const sim = this.sim;
    const living = sim.livingSpecies();
    if (!living.length) {
      this.log.say(this.stamp(y) + 'The world is empty.', 'death', y);
      return;
    }
    let biggest = living[0];
    for (const sp of living) if (sp.pop > biggest.pop) biggest = sp;
    if (sim.rng.next() < 0.45 && biggest.pop > 30) {
      this.log.say(this.stamp(y) + 'The ' + biggest.plural() + ' are everywhere. ' +
        biggest.pop + ' of them.', 'plain', y);
    } else {
      this.log.say(this.stamp(y) + sim.rng.pick(IDLE), 'plain', y);
    }
  };

  global.Log = Log;
  global.Narrator = Narrator;
  global.numWord = num;
})(window);
