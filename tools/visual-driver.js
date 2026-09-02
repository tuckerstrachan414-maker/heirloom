// Throwaway: drives the real game so a screenshot shows a lived-in world.
// Not part of the game. Loaded only by _visual.html.
(function () {
  function run() {
    var G = window.Game, S = G && G.sim;
    if (!S) { setTimeout(run, 300); return; }
    var years = Number((location.hash.match(/y=(\d+)/) || [])[1] || 90);
    var every = Number((location.hash.match(/every=([0-9]+)/) || [])[1] || 0);
    for (var i = 0; i < 24 * years; i++) {
      S.tick(1 / 24);
      if (every && i % (24 * every) === 0 && i) G.fire('wildfire', {});
    }
    S.census();
    if (/fire/.test(location.hash)) {
      var sp = S.livingSpecies().sort(function (a, b) { return b.pop - a.pop; })[0];
      G.fire('wildfire', sp ? { x: Math.round(sp.cx), y: Math.round(sp.cy) } : {});
      var after = Number((location.hash.match(/burn=(\d+)/) || [])[1] || 1);
      for (var j = 0; j < 24 * after; j++) S.tick(1 / 24);
    }
    if (/zoom/.test(location.hash)) {
      var s2 = S.livingSpecies().sort(function (a, b) { return b.pop - a.pop; })[0];
      if (s2) { G.renderer.cam.x = s2.cx; G.renderer.cam.y = s2.cy; G.renderer.cam.z = 26; G.renderer.clamp(); }
    }
    var fireAt = (location.hash.match(/cast=([a-z-]+)/) || [])[1];
    if (fireAt) {
      var sp2 = S.livingSpecies().sort(function (a, b) { return b.pop - a.pop; })[0];
      G.fire(fireAt, sp2 ? { x: Math.round(sp2.cx), y: Math.round(sp2.cy) } : {});
      var after2 = Number((location.hash.match(/then=([0-9]+)/) || [])[1] || 0);
      for (var q = 0; q < 24 * after2; q++) S.tick(1 / 24);
    }
    if (/inspect/.test(location.hash)) {
      var pick = S.livingSpecies().sort(function (a, b) { return b.pop - a.pop; });
      var withStrain = pick.filter(function (s) { return s.strains && s.strains.length; });
      window.UI.selectSpecies(withStrain[0] || pick[0]);
    }
    G.setSpeed(/pause/.test(location.hash) ? 0 : 1);
    window.__ready = true;
  }
  if (document.readyState === 'complete') setTimeout(run, 400);
  else window.addEventListener('load', function () { setTimeout(run, 400); });
})();
