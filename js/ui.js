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
        plagues: $('plagues'), plagueList: $('plagueList'),
        sheet: $('sheet'), sheetTitle: $('sheetTitle'), sheetBody: $('sheetBody'),
        cats: $('toolcats'),
        toast: $('toast'), canvas: $('world')
      };
      $('inspClose').onclick = function () { UI.clearSelection(); };
      $('sheetClose').onclick = function () { UI.closeSheet(); };
      this.el.sheet.onclick = function (e) { if (e.target === UI.el.sheet) UI.closeSheet(); };
      $('btnTree').onclick = function () { UI.showTree(); };
      $('btnSave').onclick = function () { UI.showSave(); };
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
      this.refreshPlagues();
    },

    // The panel is where the disease stops being scenery: the four numbers
    // move on their own, and a strain that got milder says so in the row.
    MAXROWS: 6,

    refreshPlagues: function () {
      const live = this.game.sim.livePlagues();
      const sig = live.length + '|' + live.slice(0, this.MAXROWS).map(function (p) {
        return p.id + ':' + p.active;
      }).join(',');
      if (sig === this.lastPlagueSig) return;
      this.lastPlagueSig = sig;
      this.el.plagues.classList.toggle('hidden', live.length === 0);
      if (!live.length) { this.el.plagueList.innerHTML = ''; return; }

      let h = '';
      for (const p of live.slice(0, this.MAXROWS)) {
        h += '<div class="pl' + (p.active < 3 ? ' fading' : '') + '">' +
             '<div class="pn"><i class="dot" style="background:' + p.color + '"></i>' +
             '<span>' + esc(p.name) + '</span><b>' + p.active + '</b></div>' +
             '<div class="pv">spreads ' + p.transmission.toFixed(1) +
             ' &middot; kills ' + p.lethality.toFixed(2) +
             ' &middot; ' + p.duration.toFixed(1) + 'y' +
             ' &middot; R' + p.spreadRate().toFixed(1) + '</div></div>';
      }
      const rest = live.length - this.MAXROWS;
      if (rest > 0) h += '<div class="pmore">and ' + rest + ' more strain' + (rest > 1 ? 's' : '') + '</div>';
      this.el.plagueList.innerHTML = h;
    },

    refreshSpecies: function () {
      const sim = this.game.sim, list = this.el.list;
      const rows = sim.species.slice().sort(function (a, b) { return b.pop - a.pop || a.id - b.id; });
      list.innerHTML = '';
      for (const sp of rows) {
        const row = document.createElement('div');
        row.className = 'sp' + (sp.pop === 0 ? ' gone' : '') + (this.selSpecies === sp ? ' sel' : '');
        const mark = (sp.strains && sp.strains.length) ? '<i class="star">*</i>' : '';
        row.innerHTML = '<i class="dot" style="background:' + sp.color + '"></i>' +
                        '<span class="nm"></span>' + mark + '<span class="pp"></span>';
        row.title = sp.strains && sp.strains.length
          ? sp.strains.map(function (id) { return global.Strains.BY_ID[id].name; }).join(', ')
          : sp.plural();
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
      if (c.inf) {
        const p = c.inf.p, r = d.resist[p.kind] || 0;
        h += kv('Sick with', '<b style="color:' + p.color + '">' + esc(p.name) + '</b>');
        h += kv('For', c.inf.t.toFixed(1) + ' of ' + p.duration.toFixed(1) + ' yr');
        if (r || c.inf.imm) {
          h += kv('Shrugging off', Math.round((1 - (1 - r) * (1 - c.inf.imm)) * 100) + '%');
        }
      } else if (c.imm) {
        const had = Object.keys(c.imm);
        if (had.length) h += kv('Survived', had.length + ' plague' + (had.length > 1 ? 's' : ''));
      }
      h += strainBlocks(d.strains, d.flaws);
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
      if (sp.parent) {
        h += '<div class="lineage">Split from the <b>' + esc(sp.parent.plural()) + '</b> in year ' +
             sp.founded + (sp.foundedBy ? ', after the ' + esc(sp.foundedBy.toLowerCase()) : '') + '.</div>';
      }
      if (sp.children && sp.children.length) {
        h += '<div class="lineage">Gave rise to ' +
             sp.children.map(function (k) { return '<b>' + esc(k.plural()) + '</b>'; }).join(', ') + '.</div>';
      }
      h += kv('Generations', sp.generations);
      h += kv('Born / died', sp.born + ' / ' + sp.died);
      if (sp.pop > 0 && sp.strains && sp.strains.length) {
        h += '<div class="sub">Strains</div>';
        h += strainBlocks(sp.strains.map(function (id) { return global.Strains.BY_ID[id]; }), []);
      }
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

    // ---- the full-screen sheet ------------------------------------------
    openSheet: function (title, html, wide) {
      this.el.sheetTitle.textContent = title;
      this.el.sheetBody.innerHTML = html;
      this.el.sheet.classList.toggle('wide', !!wide);
      this.el.sheet.classList.remove('hidden');
    },

    closeSheet: function () { this.el.sheet.classList.add('hidden'); },

    sheetOpen: function () { return !this.el.sheet.classList.contains('hidden'); },

    showTree: function () {
      const t = global.Tree.build(this.game.sim, this.game.seedText);
      this.openSheet('The family tree',
        '<div class="treehead">' + t.head + '</div><div class="treeplot">' + t.svg + '</div>', true);
    },

    showSave: function () {
      const code = global.SaveCode.encode(this.game);
      this.openSheet('Save code',
        '<p class="sheetnote">This is the whole world: the seed and everything you did to it. ' +
        'Copy it somewhere. Paste one back in and press Load to get that world again.</p>' +
        '<textarea id="savebox" spellcheck="false"></textarea>' +
        '<div class="sheetrow"><button id="saveCopy">Copy</button>' +
        '<button id="saveLoad">Load this code</button>' +
        '<span id="saveMsg"></span></div>');
      const box = document.getElementById('savebox');
      box.value = code;
      box.focus(); box.select();
      const msg = document.getElementById('saveMsg');
      document.getElementById('saveCopy').onclick = function () {
        box.focus(); box.select();
        // execCommand is deprecated but it is the one that works from
        // file://, where the async clipboard API is refused outright.
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        msg.textContent = ok ? 'Copied.' : 'Press Ctrl+C - it is selected.';
      };
      document.getElementById('saveLoad').onclick = function () { UI.loadCode(box.value, msg); };
    },

    loadCode: function (text, msg) {
      const save = global.SaveCode.decode(text);
      if (typeof save === 'string') { msg.textContent = save; return; }
      this.closeSheet();
      this.clearSelection();
      const years = Math.round(save.ticks / 24);
      this.hint('Restoring ' + years + ' years...');
      global.SaveCode.restore(this.game, save,
        function (p) { UI.hint('Restoring ' + years + ' years... ' + Math.round(p * 100) + '%'); },
        function () {
          UI.hint(UI.defaultHint);
          UI.toast('Restored to year ' + Math.floor(UI.game.sim.year) + '.');
        });
    },

    // ---- disasters ------------------------------------------------------
    // Twenty-odd buttons in one bar is unusable, so they sit behind four tabs.
    CATS: [{ id: 'sudden', label: 'Sudden' }, { id: 'slow', label: 'Slow' },
           { id: 'plague', label: 'Plagues' },
           { id: 'good', label: 'Fortune' }, { id: 'player', label: 'Yours' }],

    buildDisasters: function () {
      const list = global.Disasters.available(global.SimConfig.checkpoint);
      this.cats = this.CATS.filter(function (c) {
        return list.some(function (d) { return d.kind === c.id; });
      });
      const bar = this.el.cats;
      bar.innerHTML = '';
      for (const c of this.cats) {
        const b = document.createElement('button');
        b.textContent = c.label;
        b.className = 'cat';
        b.onclick = function () { UI.showCat(c.id); };
        bar.appendChild(b);
        c.btn = b;
      }
      this.defaultHint = 'Pick something, then click the map. Drag to pan, scroll to zoom.';
      if (this.cats.length) this.showCat(this.cats[0].id);
      this.hint(this.defaultHint);
    },

    showCat: function (id) {
      this.cat = id;
      for (const c of this.cats) c.btn.classList.toggle('on', c.id === id);
      const row = this.el.disasters;
      row.innerHTML = '';
      for (const d of global.Disasters.available(global.SimConfig.checkpoint)) {
        if (d.kind !== id) continue;
        const b = document.createElement('button');
        b.textContent = d.name;
        b.title = d.desc;
        b.className = 'dis ' + d.kind;
        b.onclick = function () { UI.pick(d, b); };
        b.dataset.id = d.id;
        if (this.armed === d) b.classList.add('armed');
        row.appendChild(b);
      }
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
  function strainBlocks(strains, flaws) {
    let h = '';
    for (const s of strains || []) {
      if (!s) continue;
      h += '<div class="strain"><div class="tn">' + esc(s.name) + '<em>strain</em></div>' +
           '<div class="td">' + esc(s.desc) + '</div></div>';
    }
    for (const s of flaws || []) {
      if (!s) continue;
      h += '<div class="flaw"><div class="tn">' + esc(s.name) + '<em>flaw</em></div>' +
           '<div class="td">' + esc(s.desc) + '</div></div>';
    }
    return h;
  }

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
