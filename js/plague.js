// HEIRLOOM - living plagues.
//
// A plague is a second organism. It carries its own four numbers, it hands
// them to every strain it spawns, and those numbers drift a little each time
// it changes hands.
//
// Nothing in here selects for mildness. It falls out on its own: a strain
// lethal enough to kill its host before it finds another body dies inside that
// body, and what is left spreading is whatever kept finding new ones. Start a
// plague, run two hundred years and read the panel - the numbers will have
// moved, and no rule moved them.
//
// The hooks in sim.js are deliberately four lines: kill() clears an infection,
// updateCreature() calls stepInfection, census() calls plagueCensus, and the
// constructor makes the two lists. Everything else lives here.

(function (global) {
  'use strict';

  const PD = global.PlagueData;

  const MAX_LIVE = 14;         // lineages at once; past this, no new variants
  const REACH2 = 3.2 * 3.2;    // how far contagion carries, squared
  const ESTABLISHED = 12;      // infected before a new variant earns a log line
  const SEED_HOSTS = 9;        // how many the player's click infects
  const MEMORY_DECAY = 0.72;   // protection you keep, per mutation of distance

  const scratch = [];

  function clampTo(v, lim) { return Math.max(lim[0], Math.min(lim[1], v)); }

  // ---- one lineage ------------------------------------------------------
  function Plague(sim, seed, parent) {
    this.id = sim.nextPlagueId++;
    this.seed = seed;
    this.base = seed.base;
    this.kind = seed.kind;
    this.color = seed.color;
    this.desc = seed.desc;
    this.requires = seed.requires || null;
    this.seeks = seed.seeks || 0;
    this.burst = seed.burst || 0;

    this.parent = parent || null;
    this.gen = parent ? parent.gen + 1 : 1;
    this.root = parent ? parent.root : seed.name;
    if (!sim.plagueSeq) sim.plagueSeq = Object.create(null);
    const seq = parent ? (sim.plagueSeq[this.root] || 1) + 1 : 1;
    sim.plagueSeq[this.root] = seq;
    this.name = PD.variantName(this.root, seq);
    this.born = Math.floor(sim.year);
    this.ended = null;

    this.active = 0;
    this.everInfected = 0;
    this.killed = 0;
    this.recovered = 0;
    this.peak = 0;
    this.logged = false;

    const src = parent || seed;
    this.transmission = src.transmission;
    this.lethality = src.lethality;
    this.incubation = src.incubation;
    this.duration = src.duration;
  }

  // Symmetric multiplicative drift. It has no idea which direction is better.
  Plague.prototype.drift = function (rng) {
    for (const k in PD.LIMITS) {
      const step = PD.DRIFT[k];
      this[k] = clampTo(this[k] * (1 + rng.range(-step, step)), PD.LIMITS[k]);
    }
  };

  // How many new hosts one host is worth, if nobody nearby is immune. The
  // honest version: lethality shortens the time it has to spread, so a strain
  // that kills faster than it travels scores below 1 and dies in its own
  // bodies. Unless it bursts, in which case dying is how it travels.
  Plague.prototype.spreadRate = function () {
    const L = Math.max(0.001, this.lethality);
    const live = (Math.exp(-L * this.incubation) - Math.exp(-L * this.duration)) / L;
    const died = 1 - Math.exp(-L * this.duration);
    return this.transmission * Math.max(0, live) + this.burst * died;
  };

  // What surviving an earlier strain of the same lineage is worth against this
  // one. Exactly the strain you beat: nothing gets through. One mutation on:
  // less than half. This is why a plague that mutates keeps finding bodies.
  function immunityOf(c, p) {
    if (!c.imm) return 0;
    const g = c.imm[p.base];
    if (g === undefined) return 0;
    const drift = p.gen - g;
    if (drift <= 0) return 1;
    return Math.pow(MEMORY_DECAY, drift);
  }

  // ---- the sim side -----------------------------------------------------
  const Sim = global.Sim.prototype;

  // Start one where the player pointed. Returns a log line, or null if there
  // was nobody there to be the first case.
  Sim.startPlague = function (base, x, y) {
    let seed = null;
    for (const s of PD.SEEDS) if (s.base === base) seed = s;
    if (!seed) return null;

    // Nearest bodies first, so a click lands on the cluster you aimed at.
    const near = [];
    for (const c of this.creatures) {
      if (!c.alive || c.inf) continue;
      const dx = c.x - x, dy = c.y - y;
      near.push({ c: c, d: dx * dx + dy * dy });
    }
    if (!near.length) return null;
    near.sort(function (a, b) { return a.d - b.d; });

    const p = new Plague(this, seed, null);
    p.logged = true;                       // the disaster line announces it
    this.plagues.push(p);

    let took = 0;
    for (let k = 0; k < near.length && took < SEED_HOSTS; k++) {
      // The first cases ignore the plague's own host filter. It has to start
      // somewhere; whether it holds is the filter's business from here.
      if (this.infect(near[k].c, p, 0)) took++;
    }
    if (!took) { this.plagues.pop(); return null; }

    // For the almanac only. Read nowhere in the tick.
    if (this.seenPlagues && this.seenPlagues[base] === undefined) {
      this.seenPlagues[base] = Math.floor(this.year);
    }

    const where = this.regionName(near[0].c.x, near[0].c.y);
    return 'Something is wrong with ' + global.numWord(took) + ' of them in ' +
           where + '. ' + seed.desc;
  };

  Sim.infect = function (c, p, prot) {
    if (!c.alive || c.inf) return false;
    if (prot === undefined) prot = immunityOf(c, p);
    if (prot >= 1 || (prot > 0 && this.rng.next() < prot)) return false;
    c.inf = { p: p, t: 0, imm: prot };
    p.active++; p.everInfected++;
    if (p.active > p.peak) p.peak = p.active;
    if (!p.logged && p.parent && p.active >= ESTABLISHED) {
      p.logged = true;
      if (this.onPlague) this.onPlague(p);
    }
    return true;
  };

  // One infected creature, one tick. Returns true if it died of it.
  Sim.stepInfection = function (c, dt) {
    const inf = c.inf, p = inf.p;
    inf.t += dt;

    // Resistance is read off the damage kind, so Grit Lids shrugs off a silica
    // bloom and Parthenogenesis makes every disease worse, without either
    // trait being named here.
    const lethal = p.lethality * (1 - (c.d.resist[p.kind] || 0)) * (1 - inf.imm);
    if (lethal > 0 && this.rng.next() < lethal * dt * this.mercy(c)) {
      p.killed++;
      this.kill(c, 'plague');
      if (p.burst) this.burstFrom(c, p);
      return true;
    }

    if (inf.t >= p.duration) {
      c.inf = null;
      p.active--; p.recovered++;
      if (!c.imm) c.imm = Object.create(null);
      const g = c.imm[p.base];
      if (g === undefined || p.gen > g) c.imm[p.base] = p.gen;
      return false;
    }

    // Being sick costs, whether or not it kills. A creature running a fever
    // burns its reserve and cannot breed (see the gate in updateCreature),
    // so a wave takes a generation out of the population as well as bodies.
    c.energy -= c.d.upkeep * (0.3 + Math.min(1, p.lethality) * 0.5) * dt;

    if (inf.t < p.incubation) return false;
    if (p.seeks && this.rng.next() < 2.5 * dt) this.seekHost(c);
    if (this.rng.next() < p.transmission * dt) this.contagion(c, p);
    return false;
  };

  // Hand it on. This is also the only moment a plague can change.
  Sim.contagion = function (c, p) {
    const near = this.nearby(c, scratch);
    let pick = null, n = 0;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      if (o === c || !o.alive || o.inf) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > REACH2) continue;
      if (p.requires && !p.requires(o, this)) continue;
      // Reservoir sample, so it is not always the same neighbour.
      n++;
      if (n === 1 || this.rng.next() < 1 / n) pick = o;
    }
    if (!pick) return;
    this.passOn(pick, p, immunityOf(pick, p));
  };

  // Changing hands is the only moment a plague gets to change. Both routes
  // out of a host come through here, or a burster would never mutate at all.
  Sim.passOn = function (target, p, prot) {
    let strain = p;
    if (this.plagues.length < MAX_LIVE && this.rng.next() < PD.DRIFT.chance) {
      strain = new Plague(this, p.seed, p);
      strain.drift(this.rng);
      this.plagues.push(strain);
      prot = undefined;              // a new strain meets a different memory
    }
    return this.infect(target, strain, prot);
  };

  // A burster spends its host in order to spread. Everything else about it -
  // the seeking, the short incubation, the lethality - serves this moment.
  Sim.burstFrom = function (c, p) {
    const near = this.nearby(c, scratch);
    let left = p.burst;
    for (let k = 0; k < near.length && left > 0; k++) {
      const o = near[k];
      if (o === c || !o.alive || o.inf) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > REACH2 * 1.6) continue;
      if (this.passOn(o, p)) left--;
    }
  };

  // Cordyceps. The infected walk toward whoever is still healthy.
  Sim.seekHost = function (c) {
    const near = this.nearby(c, scratch);
    let best = null, bd = Infinity;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      if (o === c || !o.alive || o.inf) continue;
      const dx = o.x - c.x, dy = o.y - c.y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = o; }
    }
    if (!best || bd < 0.04) return;
    const m = Math.sqrt(bd);
    c.hx = (best.x - c.x) / m;
    c.hy = (best.y - c.y) / m;
    c.think = 0.35;
  };

  // Once a year: recount from the bodies, and retire whatever is gone.
  Sim.plagueCensus = function () {
    if (!this.plagues.length) return;
    for (const p of this.plagues) p.active = 0;
    for (const c of this.creatures) if (c.alive && c.inf) c.inf.p.active++;
    for (let i = this.plagues.length - 1; i >= 0; i--) {
      const p = this.plagues[i];
      if (p.active > 0) continue;
      p.ended = Math.floor(this.year);
      this.plagues.splice(i, 1);
      this.pastPlagues.push(p);
      if (this.pastPlagues.length > 40) this.pastPlagues.shift();
      if (this.onPlagueEnd && p.everInfected >= ESTABLISHED) this.onPlagueEnd(p);
    }
  };

  // Live lineages, worst first.
  Sim.livePlagues = function () {
    return this.plagues.slice().sort(function (a, b) {
      return b.active - a.active || a.id - b.id;
    });
  };

  global.Plagues = {
    Plague: Plague,
    immunityOf: immunityOf,
    MAX_LIVE: MAX_LIVE,
    ESTABLISHED: ESTABLISHED
  };
})(window);
