// HEIRLOOM - save codes.
//
// The code is not a snapshot of the world. It is the seed plus the list of
// things you did to it, and loading replays them. That works because the sim
// is deterministic from its seed (proved by tools/determinism.js: same seed
// and same schedule gives identical genomes, positions and plague lineages
// after 260 years), and it keeps a five-hundred-year world down to a line of
// text you can paste into a chat window on a school computer.
//
//   H1|<seed>|<ticks>|<tick>:<disaster>[:<x>:<y>],...
//
// Restoring is a fast-forward, so it costs a couple of seconds of simulation
// rather than a couple of kilobytes of tile arrays.

(function (global) {
  'use strict';

  const TAG = 'H1';
  const TICK = 1 / 24;
  const CHUNK = 1200;          // ticks per frame while restoring

  function clean(s) { return String(s).replace(/[^A-Za-z0-9._-]/g, ''); }

  function encode(game) {
    const sim = game.sim;
    const events = (sim.timeline || []).map(function (e) {
      let s = e.t + ':' + e.id;
      if (e.x !== undefined) s += ':' + e.x + ':' + e.y;
      return s;
    });
    return [TAG, clean(game.seedText), Math.round(sim.year * 24), events.join(',')].join('|');
  }

  // Returns { seed, ticks, events } or a string explaining what is wrong with
  // it. Anything a person can paste has to be assumed to be mangled.
  function decode(text) {
    const raw = String(text || '').trim().replace(/\s+/g, '');
    if (!raw) return 'Nothing to load.';
    const parts = raw.split('|');
    if (parts[0] !== TAG) return 'That does not look like a HEIRLOOM code.';
    if (parts.length < 3) return 'That code is cut short.';
    const seed = clean(parts[1]);
    const ticks = parseInt(parts[2], 10);
    if (!seed || !isFinite(ticks) || ticks < 0) return 'That code is damaged.';

    const events = [];
    if (parts[3]) {
      for (const chunk of parts[3].split(',')) {
        if (!chunk) continue;
        const f = chunk.split(':');
        const d = global.Disasters.BY_ID[f[1]];
        // An old code naming something that no longer exists is skipped, not
        // refused - the rest of the history is still worth replaying.
        if (!d) continue;
        const e = { t: parseInt(f[0], 10) || 0, id: f[1] };
        if (f.length >= 4) { e.x = Number(f[2]); e.y = Number(f[3]); }
        events.push(e);
      }
      events.sort(function (a, b) { return a.t - b.t; });
    }
    return { seed: seed, ticks: Math.min(ticks, 24 * 5000), events: events };
  }

  // Replay in slices so the page keeps painting and can say how far it got.
  function restore(game, save, onProgress, onDone) {
    game.newWorld(save.seed);
    game.setSpeed(0);
    game.acc = 0;   // leftover frame time would jump the restored world forward
    const sim = game.sim;
    let i = 0, next = 0;

    function slice() {
      const stop = Math.min(save.ticks, i + CHUNK);
      while (i < stop) {
        while (next < save.events.length && save.events[next].t === i) {
          const e = save.events[next++];
          sim.trigger(e.id, e.x === undefined ? {} : { x: e.x, y: e.y });
        }
        sim.tick(TICK);
        sim.world.dirty.length = 0;
        i++;
      }
      // Anything scheduled for the very last tick still has to happen.
      if (i >= save.ticks) {
        while (next < save.events.length) {
          const e = save.events[next++];
          sim.trigger(e.id, e.x === undefined ? {} : { x: e.x, y: e.y });
        }
        sim.census();
        game.renderer.paintAll();
        global.UI.lastSpeciesSig = '';
        global.UI.lastPlagueSig = '';
        global.UI.refresh();
        game.setSpeed(1);
        if (onDone) onDone();
        return;
      }
      if (onProgress) onProgress(i / save.ticks);
      requestAnimationFrame(slice);
    }
    slice();
  }

  global.SaveCode = { encode: encode, decode: decode, restore: restore, TAG: TAG };
})(window);
