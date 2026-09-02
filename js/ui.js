// HEIRLOOM - panels, lists, inspector, disaster buttons.

(function (global) {
  'use strict';

  const T = global.Traits;
  const $ = function (id) { return document.getElementById(id); };

  const UI = {
    game: null,
    selSpecies: null,
    selCreature: null,
    armed: null,

    init: function (game) {
      this.game = game;
      this.el = {
        year: $('statYear'), pop: $('statPop'), species: $('statSpecies'), gen: $('statGen'),
        list: $('speciesList'), inspect: $('inspect'), inspTitle: $('inspTitle'),
        inspBody: $('inspBody'), disasters: $('disasters'), hint: $('hint'),
        toast: $('toast'), canvas: $('world')
      };
      $('inspClose').onclick = function () { UI.clearSelection(); };
      this.buildDisasters();
      this.lastSpeciesSig = '';
    },

    // ---- stats ----------------------------------------------------------
    refresh: function () {
      const sim = this.game.sim;
      this.el.year.textContent = Math.floor(sim.year);
      this.el.pop.textContent = sim.aliveCount;
      const living = sim.livingSpecies();
      this.el.species.textContent = living.length;
      let gens = 0;
      for (const s of sim.species) if (s.generations > gens) gens = s.generations;
      this.el.gen.textContent = gens;

      const sig = sim.species.map(function (s) { return s.id + ':' + s.pop; }).join(',');
      if (sig !== this.lastSpeciesSig) { this.lastSpeciesSig = sig; this.refreshSpecies(); }
      if (this.selCreature || this.selSpecies) this.refreshInspect();
    },

    refreshSpecies: function () {
      const sim = this.game.sim, list = this.el.list;
      const rows = sim.species.slice().sort(function (a, b) { return b.pop - a.pop || a.id - b.id; });
      list.innerHTML = '';
      for (const sp of rows) {
        const row = document.createElement('div');
        row.className = 'sp' + (sp.pop === 0 ? ' gone' : '') + (this.selSpecies === sp ? ' sel' : '');
        row.innerHTML = '<i class="dot" style="background:' + sp.color + '"></i>' +
                        '<span class="nm"></span><span class="pp"></span>';
        row.querySelector('.nm').textContent = sp.plural();
        row.querySelector('.pp').textContent = sp.pop === 0 ? '\u2014' : sp.pop;
        row.onclick = function () { UI.selectSpecies(sp); };
        list.appendChild(row);
      }
    },

    // ---- selection ------------------------------------------------------
    selectSpecies: function (sp) {
      this.selSpecies = sp; this.selCreature = null;
      this.lastSpeciesSig = '';
      this.el.inspect.classList.remove('hidden');
      this.refreshInspect();
    },
    selectCreature: function (c) {
      this.selCreature = c; this.selSpecies = c ? c.sp : null;
      this.lastSpeciesSig = '';
      this.el.inspect.classList.remove('hidden');
      this.refreshInspect();
    },
    clearSelection: function () {
      this.selCreature = null; this.selSpecies = null;
      this.lastSpeciesSig = '';
      this.el.inspect.classList.add('hidden');
    },

    refreshInspect: function () {
      const c = this.selCreature;
      if (c && !c.alive) { this.selCreature = null; }
      if (this.selCreature) this.drawCreature(this.selCreature);
      else if (this.selSpecies) this.drawSpecies(this.selSpecies);
    },

    drawCreature: function (c) {
      const sim = this.game.sim, d = c.d;
      this.el.inspTitle.textContent = c.sp.name + ' #' + c.id;
      let h = '';
      h += kv('Species', '<b style="color:' + c.sp.color + '">' + esc(c.sp.plural()) + '</b>');
      h += kv('Age', c.age.toFixed(1) + ' / ' + d.lifespan.toFixed(0) + ' yr');
      h += kv('Energy', Math.round(c.energy) + ' / ' + Math.round(d.reserve));
      h += kv('Upkeep', d.upkeep.toFixed(1) + ' food/yr');
      h += kv('Speed', d.speed.toFixed(1));
      h += kv('State', c.dormant ? 'dormant' : c.asleep ? 'asleep' : c.age < d.maturity ? 'juvenile' : 'active');
      h += '<div class="sub">Traits ' + d.traits.length + ' / ' + global.Genome.SLOTS + '</div>';
      h += traitBlocks(d.traits);
      if (!d.traits.length) h += '<div class="trait"><div class="td">Nothing yet. Plain stock.</div></div>';
      this.el.inspBody.innerHTML = h;
    },

    drawSpecies: function (sp) {
      const sim = this.game.sim;
      this.el.inspTitle.textContent = sp.plural();
      let h = '';
      h += kv('Population', sp.pop + (sp.extinct !== null ? ' (extinct yr ' + sp.extinct + ')' : ''));
      h += kv('Peak', sp.peakPop);
      h += kv('Founded', 'year ' + sp.founded);
      h += kv('Generations', sp.generations);
      h += kv('Born / died', sp.born + ' / ' + sp.died);
      if (sp.pop > 0) {
        h += '<div class="sub">Traits carried</div>';
        const rows = [];
        for (let i = 0; i < T.ALL.length; i++) {
          const share = sp.traitCount[i] / sp.pop;
          if (share > 0.02) rows.push({ t: T.ALL[i], share: share });
        }
        rows.sort(function (a, b) { return b.share - a.share; });
        if (!rows.length) h += '<div class="trait"><div class="td">Plain stock. Nothing has taken hold.</div></div>';
        for (const r of rows) {
          h += '<div class="trait"><div class="tn">' + esc(r.t.name) +
               '<em>' + Math.round(r.share * 100) + '%</em></div>' +
               '<div class="td">' + esc(r.t.desc) + '</div></div>';
        }
      }
      this.el.inspBody.innerHTML = h;
    },

    // ---- disasters ------------------------------------------------------
    buildDisasters: function () {
      const row = this.el.disasters;
      row.innerHTML = '';
      const list = global.Disasters.available(global.SimConfig.checkpoint);
      for (const d of list) {
        const b = document.createElement('button');
        b.textContent = d.name;
        b.title = d.desc;
        b.onclick = function () { UI.pick(d, b); };
        b.dataset.id = d.id;
        row.appendChild(b);
      }
      this.defaultHint = list.length
        ? 'Pick a disaster, then click the map. Drag to pan, scroll to zoom.'
        : 'Drag to pan, scroll to zoom.';
      this.hint(this.defaultHint);
    },

    pick: function (d, btn) {
      const armedNow = this.armed === d;
      this.el.disasters.querySelectorAll('button').forEach(function (b) { b.classList.remove('armed'); });
      if (armedNow) {
        this.armed = null;
        this.el.canvas.classList.remove('aiming');
        this.hint(this.defaultHint);
        return;
      }
      if (d.aim === 'point') {
        this.armed = d;
        btn.classList.add('armed');
        this.el.canvas.classList.add('aiming');
        this.hint('Click the map to place the ' + d.name.toLowerCase() + '.');
      } else {
        this.game.fire(d.id, {});
      }
    },

    disarm: function () {
      this.armed = null;
      this.el.canvas.classList.remove('aiming');
      this.el.disasters.querySelectorAll('button').forEach(function (b) { b.classList.remove('armed'); });
      this.hint(this.defaultHint);
    },

    hint: function (text) { this.el.hint.textContent = text; },

    toast: function (text) {
      const t = this.el.toast;
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(this._tt);
      this._tt = setTimeout(function () { t.classList.remove('show'); }, 2200);
    },

    setSpeed: function (s) {
      document.querySelectorAll('#speeds button').forEach(function (b) {
        b.classList.toggle('on', Number(b.dataset.speed) === s);
      });
    }
  };

  // ---- small helpers ----------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + '</span><b>' + v + '</b></div>'; }
  function traitBlocks(traits) {
    let h = '';
    for (const t of traits) {
      h += '<div class="trait"><div class="tn">' + esc(t.name) +
           '<em>' + t.cost.toFixed(1) + '</em></div>' +
           '<div class="td">' + esc(t.desc) + '</div>' +
           '<div class="tc">' + esc(t.snag) + '</div></div>';
    }
    return h;
  }

  global.UI = UI;
})(window);
