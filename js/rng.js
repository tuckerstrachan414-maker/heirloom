// HEIRLOOM - seeded RNG.
// Deterministic so a save code can reproduce a world exactly.
// Every random call in the sim MUST go through Rng - never Math.random.

(function (global) {
  'use strict';

  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32 - small, fast, good enough for a game.
  function Rng(seed) {
    this.seed = (typeof seed === 'string') ? hashSeed(seed) : (seed >>> 0);
    this.s = this.seed || 1;
  }

  Rng.prototype.next = function () {
    let t = (this.s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // float in [a,b)
  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  // integer in [0,n)
  Rng.prototype.int = function (n) { return (this.next() * n) | 0; };
  // integer in [a,b] inclusive
  Rng.prototype.between = function (a, b) { return a + ((this.next() * (b - a + 1)) | 0); };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[(this.next() * arr.length) | 0]; };
  Rng.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (this.next() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  // gaussian-ish, mean 0 sd ~1, cheap
  Rng.prototype.gauss = function () {
    return (this.next() + this.next() + this.next() - 1.5) * 1.5;
  };
  Rng.prototype.save = function () { return this.s >>> 0; };
  Rng.prototype.load = function (s) { this.s = s >>> 0; };

  global.Rng = Rng;
  global.hashSeed = hashSeed;
})(window);
