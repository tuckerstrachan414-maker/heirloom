// HEIRLOOM - boot, the frame loop, and input.

(function (global) {
  'use strict';

  const TICK = 1 / 24;            // one sim step, in years
  const YEARS_PER_SEC = 0.5;      // at 1x
  const MAX_STEPS = 18;           // never let a slow frame spiral

  const Game = {
    speed: 1,
    acc: 0,
    last: 0,

    start: function () {
      this.canvas = document.getElementById('world');
      this.log = new global.Log(document.getElementById('log'));
      global.UI.init(this);
      this.bindInput();
      this.newWorld();
      this.last = performance.now();
      requestAnimationFrame(this.frame.bind(this));
    },

    newWorld: function (seed) {
      seed = seed || ('heirloom-' + Math.floor(Math.random() * 1e9));
      global.SpeciesLib.resetIds();
      global.Genome.clearCache();
      this.log.clear();

      const sim = new global.Sim({ seed: seed, log: this.log });
      sim.computeCoast();
      this.sim = sim;
      this.narrator = new global.Narrator(sim, this.log);

      sim.onYear = this.narrator.year.bind(this.narrator);
      sim.onDisaster = this.narrator.disaster.bind(this.narrator);
      sim.onExtinct = this.narrator.extinct.bind(this.narrator);

      this.log.say('A world is seeded.', 'event', 0);

      // Starter stock is plain: no traits at all. Everything they become,
      // they become on their own.
      // Space starter hues around the wheel so no two look alike.
      const hue0 = sim.rng.range(0, 360);
      for (let k = 0; k < 2; k++) {
        const sp = sim.seedSpecies(38, 0, hue0 + k * 137.5);
        let hx = 0, hy = 0, n = 0;
        for (const c of sim.creatures) if (c.sp === sp) { hx += c.x; hy += c.y; n++; }
        sp.homeX = hx / n; sp.homeY = hy / n;
        this.narrator.founded(sp, sp.homeX, sp.homeY);
      }
      sim.census();

      if (this.renderer) this.renderer.clearSprites();
      this.renderer = new global.Renderer(this.canvas, sim);
      this.renderer.resize();
      this.renderer.fit();
      this.renderer.paintAll();
      global.UI.clearSelection();
      global.UI.lastSpeciesSig = '';
      global.UI.refresh();
      this.setSpeed(1);
      this.seedText = seed;
    },

    setSpeed: function (s) { this.speed = s; global.UI.setSpeed(s); },

    fire: function (id, opts) {
      const line = this.sim.trigger(id, opts);
      if (!line) global.UI.toast('Nothing there will catch.');
      return line;
    },

    frame: function (now) {
      const realDt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;

      if (this.speed > 0) {
        this.acc += realDt * YEARS_PER_SEC * this.speed;
        let steps = 0;
        while (this.acc >= TICK && steps < MAX_STEPS) {
          this.sim.tick(TICK);
          this.acc -= TICK;
          steps++;
        }
        if (steps === MAX_STEPS) this.acc = 0;
      }
      this.sim.decayFx(realDt);
      this.renderer.draw();
      global.UI.refresh();
      requestAnimationFrame(this.frame.bind(this));
    },

    // ---- input ----------------------------------------------------------
    pickCreature: function (wx, wy) {
      const sim = this.sim;
      const r = Math.max(1.1, 14 / this.renderer.cam.z);
      let best = null, bestD = r * r;
      for (const c of sim.creatures) {
        if (!c.alive) continue;
        const dx = c.x - wx, dy = c.y - wy, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    },

    bindInput: function () {
      const cv = this.canvas, self = this;
      let down = false, moved = 0, lx = 0, ly = 0, pinch = 0;

      const pos = function (e) {
        const r = cv.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      };

      const startDrag = function (e) {
        down = true; moved = 0;
        const p = pos(e); lx = p.x; ly = p.y;
        cv.classList.add('dragging');
      };
      const doDrag = function (e) {
        if (!down) return;
        const p = pos(e);
        const dx = p.x - lx, dy = p.y - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        const d = self.renderer.dpr || 1;
        self.renderer.cam.x -= dx * d / self.renderer.cam.z;
        self.renderer.cam.y -= dy * d / self.renderer.cam.z;
        self.renderer.clamp();
        lx = p.x; ly = p.y;
      };
      const endDrag = function (e, p) {
        if (!down) return;
        down = false;
        cv.classList.remove('dragging');
        if (moved > 6 || !p) return;
        const w = self.renderer.screenToWorld(p.x, p.y);
        if (global.UI.armed) {
          const d = global.UI.armed;
          global.UI.disarm();
          self.fire(d.id, { x: Math.round(w.x), y: Math.round(w.y) });
          return;
        }
        const c = self.pickCreature(w.x, w.y);
        if (c) global.UI.selectCreature(c); else global.UI.clearSelection();
      };

      cv.addEventListener('mousedown', startDrag);
      window.addEventListener('mousemove', doDrag);
      window.addEventListener('mouseup', function (e) { endDrag(e, pos(e)); });

      cv.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
          pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
          down = false;
        } else { startDrag(e); }
        e.preventDefault();
      }, { passive: false });

      cv.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                               e.touches[0].clientY - e.touches[1].clientY);
          if (pinch > 0) {
            const r = cv.getBoundingClientRect();
            self.renderer.zoomAt((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
                                 (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
                                 d / pinch);
          }
          pinch = d;
        } else { doDrag(e); }
        e.preventDefault();
      }, { passive: false });

      cv.addEventListener('touchend', function (e) {
        pinch = 0;
        endDrag(e, down ? { x: lx, y: ly } : null);
      });

      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        const p = pos(e);
        self.renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.16 : 1 / 1.16);
      }, { passive: false });

      document.getElementById('speeds').addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (b) self.setSpeed(Number(b.dataset.speed));
      });
      document.getElementById('btnNew').onclick = function () { self.newWorld(); };

      window.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); self.setSpeed(self.speed ? 0 : 1); }
        else if (e.key === '1') self.setSpeed(1);
        else if (e.key === '2') self.setSpeed(4);
        else if (e.key === '3') self.setSpeed(16);
        else if (e.key === 'Escape') { global.UI.disarm(); global.UI.clearSelection(); }
      });

      window.addEventListener('resize', function () {
        if (!self.renderer) return;
        const z = self.renderer.cam.z;
        self.renderer.resize();
        self.renderer.cam.z = z;
        self.renderer.clamp();
      });
    }
  };

  global.Game = Game;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Game.start(); });
  } else { Game.start(); }
})(window);
