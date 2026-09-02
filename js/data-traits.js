// HEIRLOOM - the trait registry.
//
// THE EXTENSION POINT: adding a trait to the game = appending one row to TRAITS.
// Nothing else in the codebase needs to know the trait exists. Sim, renderer,
// namer and strain-checker all read this table.
//
// Fields:
//   id       - stable key. Never rename; save codes reference it.
//   name     - display name.
//   cost     - upkeep in food/year. The whole balance of the game lives here.
//   tags     - used by strains, naming and flavour.
//   prefix   - species-name prefix this trait can donate ("Ash" -> Ashdelvers).
//   suffix   - species-name suffix this trait can donate.
//   desc     - what it does, player-facing.
//   snag     - the catch, player-facing. Every trait has one or it is not a trait.
//   mods     - multipliers/addends folded into a creature's derived stats at birth.
//   resist   - 0..1 damage reduction per damage kind (see data-disasters.js).
//   paint    - how the trait alters the creature sprite.
//
// Cost tiers. Base metabolism is 3.0/yr and a good tile yields ~7/yr, so a
// creature can afford roughly 4 points of traits before it starts losing weight.
// That ceiling is what forces specialisation.

(function (global) {
  'use strict';

  const LOW = 0.7, MED = 1.6, HIGH = 3.0;

  const TRAITS = [

    // ---- body & defence -------------------------------------------------
    {
      id: 'stonehide', name: 'Stonehide', cost: HIGH,
      tags: ['defence', 'heavy', 'invented'], prefix: 'Stone', suffix: 'hide',
      desc: 'Rock plating. Survives hail, meteors, impacts and most predators.',
      snag: 'Very heavy, very hungry, very slow.',
      mods: { speed: 0.55, armour: 0.7, forage: 0.9 },
      resist: { impact: 0.85, acid: 0.5, quake: 0.3, hail: 0.9, predation: 0.7 },
      paint: { plate: '#8d8272', bulk: 1.35 }
    },
    {
      id: 'glassbones', name: 'Glass Bones', cost: LOW,
      tags: ['speed', 'breeding', 'fragile', 'invented'], prefix: 'Glass', suffix: 'kin',
      desc: 'Almost weightless. Moves fast, breeds fast, matures in half the time.',
      snag: 'Any physical hit kills instantly.',
      mods: { speed: 1.75, maturity: 0.5, fertility: 1.5, frailty: 1, lifespan: 0.7 },
      resist: { impact: -1.2, hail: -1.2, quake: -0.8 },
      paint: { tint: '#e6eef2', alpha: 0.72, bulk: 0.8 }
    },
    {
      id: 'poisonskin', name: 'Poison Skin', cost: MED,
      tags: ['defence', 'chem'], prefix: 'Bane', suffix: 'skin',
      desc: 'Anything that eats you dies.',
      snag: 'Does not stop fire or ice. Nothing outside a mouth cares.',
      mods: { toxic: 1 },
      resist: { predation: 0.85, rot: 0.4 },
      paint: { tint: '#7d5fa8', speck: '#c9a6f0' }
    },
    {
      id: 'warningcolours', name: 'Warning Colours', cost: LOW,
      tags: ['defence', 'display'], prefix: 'Bright', suffix: 'flare',
      desc: 'Loud, unmistakable colouring. Predators leave you alone.',
      snag: 'Useless without actual poison - and disasters see you just fine.',
      mods: { conspicuous: 1 },
      resist: { predation: 0.45 },
      paint: { tint: '#e8a72b', stripe: '#2b1d12' }
    },

    // ---- climate --------------------------------------------------------
    {
      id: 'antifreeze', name: 'Antifreeze Blood', cost: MED,
      tags: ['cold'], prefix: 'Frost', suffix: 'blood',
      desc: 'The body does not freeze. The ice is home.',
      snag: 'Overheats badly in deserts.',
      mods: { coldTol: 0.55, heatTol: -0.25 },
      resist: { cold: 0.85, heat: -0.5 },
      paint: { tint: '#9fd0e8' }
    },
    {
      id: 'blubber', name: 'Blubber', cost: MED,
      tags: ['cold', 'reserve'], prefix: 'Deep', suffix: 'hulk',
      desc: 'Survives cold and rides out lean years on stored fat.',
      snag: 'Slow. Dies in heatwaves.',
      mods: { coldTol: 0.35, heatTol: -0.35, speed: 0.7, reserve: 22 },
      resist: { cold: 0.6, drought: 0.35, famine: 0.6, heat: -0.7 },
      paint: { bulk: 1.25, tint: '#c9a279' }
    },
    {
      id: 'heatfins', name: 'Heat Fins', cost: LOW,
      tags: ['fire', 'heat'], prefix: 'Ember', suffix: 'fin',
      desc: 'Dumps body heat. Survives heatwaves and the fringes of fire.',
      snag: 'Freezes fast.',
      mods: { heatTol: 0.5, coldTol: -0.35 },
      resist: { heat: 0.8, fire: 0.3, cold: -0.7 },
      paint: { fin: '#e0703f' }
    },
    {
      id: 'deepburrow', name: 'Deep Burrow', cost: MED,
      tags: ['shelter', 'dark'], prefix: 'Deep', suffix: 'delver',
      desc: 'Lives underground. Fire, storms, meteors and solar flares pass overhead.',
      snag: 'Slow on the surface. Earthquakes bury you.',
      mods: { speed: 0.65, sheltered: 1 },
      resist: { fire: 0.9, storm: 0.9, impact: 0.8, radiation: 0.85, hail: 0.95, dust: 0.8, quake: -1.5 },
      paint: { tint: '#a08668', dark: 1 }
    },
    {
      id: 'gritlids', name: 'Grit Lids', cost: LOW,
      tags: ['dust', 'ash'], prefix: 'Grit', suffix: 'eye',
      desc: 'A third eyelid. Dust storms and ashfall are only weather.',
      snag: 'Nothing much. A quietly excellent trait.',
      mods: {},
      resist: { dust: 0.9, ash: 0.5, silica: 0.95 },
      paint: { eye: '#efe2c0' }
    },

    // ---- dormancy -------------------------------------------------------
    {
      id: 'tardigrade', name: 'Tardigrade State', cost: HIGH,
      tags: ['dormancy', 'weird'], prefix: 'Husk', suffix: 'husk',
      desc: 'When conditions turn lethal, curls into a dry husk and survives almost anything.',
      snag: 'Cannot eat, move or breed while curled. Miss a good year and you starve.',
      mods: { dormancy: 'lethal' },
      resist: { fire: 0.7, cold: 0.9, heat: 0.85, drought: 0.95, radiation: 0.8, acid: 0.8, flood: 0.6, dark: 0.9 },
      paint: { tint: '#bda98a', bulk: 0.9 }
    },
    {
      id: 'hibernation', name: 'Hibernation', cost: LOW,
      tags: ['dormancy', 'cold'], prefix: 'Slumber', suffix: 'sleeper',
      desc: 'Sleeps through winter and famine.',
      snag: 'A year asleep is a year with no children.',
      mods: { dormancy: 'lean' },
      resist: { cold: 0.55, famine: 0.75, drought: 0.4 },
      paint: { tint: '#b5a488' }
    },
    {
      id: 'diapause', name: 'Diapause Eggs', cost: MED,
      tags: ['breeding', 'dormancy'], prefix: 'Seed', suffix: 'brood',
      desc: 'Eggs pause for years and hatch when the world improves.',
      snag: 'The pause is not free - the clutch is small.',
      mods: { eggBank: 1, litter: -0.3 },
      resist: {},
      paint: { egg: '#e3cf9a' }
    },

    // ---- feeding --------------------------------------------------------
    {
      id: 'photoskin', name: 'Photosynthetic Skin', cost: LOW,
      tags: ['food', 'light'], prefix: 'Sun', suffix: 'bloom',
      desc: 'Free food from sunlight.',
      snag: 'An ash winter or a long night starves you dead.',
      mods: { sunFood: 3.0 },
      resist: { famine: 0.5, dark: -1.4 },
      paint: { tint: '#7fae52' }
    },
    {
      id: 'radiotrophic', name: 'Radiotrophic Melanin', cost: MED,
      tags: ['food', 'radiation'], prefix: 'Cinder', suffix: 'melanin',
      desc: 'Radiation is food.',
      snag: 'Wasted in a clean world.',
      mods: { radFood: 6.5 },
      resist: { radiation: 0.95 },
      paint: { tint: '#3c3a44', speck: '#8ce07a' }
    },
    {
      id: 'gutsymbionts', name: 'Gut Symbionts', cost: MED,
      tags: ['food'], prefix: 'Rot', suffix: 'gut',
      desc: 'Digests anything - rot, bark, ash-choked scrub, poison.',
      snag: 'Feeding the passengers costs.',
      mods: { forage: 1.35, scavenge: 1 },
      resist: { famine: 0.55, rot: 0.7, disease: 0.25 },
      paint: { belly: '#a5714a' }
    },
    {
      id: 'irongut', name: 'Iron Gut', cost: MED,
      tags: ['food', 'metal', 'invented'], prefix: 'Iron', suffix: 'gut',
      desc: 'Eats metal and meteor fragments, laying them down as plating over time.',
      snag: 'Needs meteors to have fallen.',
      mods: { ironFood: 5.5, ironPlating: 1 },
      resist: { impact: 0.3, acid: 0.4 },
      paint: { plate: '#7a6a55', speck: '#cf9a4a' }
    },
    {
      id: 'ashlung', name: 'Ashlung', cost: LOW,
      tags: ['fire', 'ash', 'invented'], prefix: 'Ash', suffix: 'lung',
      desc: 'Breathes volcanic ash and smoke as though it were clean air.',
      snag: 'Nothing. It is simply situational.',
      mods: {},
      resist: { ash: 0.95, fire: 0.80, dust: 0.5, dark: 0.2 },
      paint: { tint: '#9a9086', speck: '#4a423c' }
    },

    // ---- water & movement ----------------------------------------------
    {
      id: 'saltglands', name: 'Salt Glands', cost: LOW,
      tags: ['water', 'coast'], prefix: 'Salt', suffix: 'drinker',
      desc: 'Drinks seawater. The coast becomes home ground.',
      snag: 'Nothing much. Genuinely good trait.',
      mods: { coastFood: 2.6 },
      resist: { drought: 0.55, flood: 0.3 },
      paint: { tint: '#cfd8c6', speck: '#ffffff' }
    },
    {
      id: 'buoyant', name: 'Buoyant Bladder', cost: LOW,
      tags: ['water', 'movement'], prefix: 'Drift', suffix: 'floater',
      desc: 'Floats. Survives floods and crosses open water.',
      snag: 'Slow and clumsy on land.',
      mods: { swim: 1, speed: 0.85 },
      resist: { flood: 0.95, drought: -0.4 },
      paint: { sac: '#8fc9c4' }
    },
    {
      id: 'echosense', name: 'Echo Sense', cost: LOW,
      tags: ['sense', 'dark'], prefix: 'Echo', suffix: 'caller',
      desc: 'Finds food in darkness, ash clouds and deep water.',
      snag: 'Nothing. Cheap and quietly reliable.',
      mods: { vision: 1.8 },
      resist: { dark: 0.8, dust: 0.4, ash: 0.3 },
      paint: { ear: '#e0cdb0' }
    },

    // ---- breeding -------------------------------------------------------
    {
      id: 'parthenogenesis', name: 'Parthenogenesis', cost: MED,
      tags: ['breeding', 'clone'], prefix: 'Lone', suffix: 'mother',
      desc: 'Breeds with no mate at all.',
      snag: 'Every child is a clone. One plague ends the whole line.',
      mods: { selfBreed: 1, clone: 1 },
      resist: { disease: -0.6 },
      paint: { tint: '#d3b7c8' }
    },
    {
      id: 'spawncloud', name: 'Spawn Cloud', cost: LOW,
      tags: ['breeding', 'swarm'], prefix: 'Swarm', suffix: 'spawn',
      desc: 'Enormous numbers of young. Nearly all of them die.',
      snag: 'Population graphs look like a heart attack. Mutations churn fastest.',
      mods: { litter: 3, fertility: 1.35, lifespan: 0.7, mutate: 1.6 },
      resist: {},
      paint: { bulk: 0.85 }
    },
    {
      id: 'pheromone', name: 'Pheromone Plume', cost: LOW,
      tags: ['breeding', 'sense'], prefix: 'Musk', suffix: 'caller',
      desc: 'Finds a mate from clear across the map.',
      snag: 'Predators smell it too.',
      mods: { mateRange: 4.5 },
      resist: { predation: -0.5 },
      paint: { plume: '#e8b6c6' }
    },
    {
      id: 'ashbloom', name: 'Ashbloom Seeds', cost: LOW,
      tags: ['breeding', 'fire', 'invented'], prefix: 'Ember', suffix: 'seed',
      desc: 'Children can only be born on burnt ground.',
      snag: 'A species that requires apocalypse in order to continue.',
      mods: { burnBirth: 1, litter: 1.5 },
      resist: { fire: 0.3 },
      paint: { tint: '#c96a3e', speck: '#f0d08a' }
    },
    {
      id: 'rootfoot', name: 'Rootfoot', cost: MED,
      tags: ['sessile', 'food', 'invented'], prefix: 'Root', suffix: 'anchor',
      desc: 'Plants itself permanently. Never starves.',
      snag: 'Cannot move. Ever. Whatever comes, it comes to you.',
      mods: { rooted: 1, speed: 0, forage: 1.6, lifespan: 1.6 },
      resist: { famine: 0.85, drought: 0.3, fire: -0.6, flood: -0.5 },
      paint: { root: '#6f5a3c' }
    },

    // ---- weird ----------------------------------------------------------
    {
      id: 'nightmind', name: 'Nightmind', cost: LOW,
      tags: ['dark', 'weird', 'invented'], prefix: 'Night', suffix: 'walker',
      desc: 'Active only at night. Sleeps straight through anything that happens by day.',
      snag: 'Half of every day is lost.',
      mods: { nocturnal: 1, forage: 1.35 },
      resist: { dark: 0.9, radiation: 0.4, heat: 0.4, predation: 0.3 },
      paint: { tint: '#5b5a78', eye: '#f3e07a' }
    }
  ];

  // ---- indexes ----------------------------------------------------------
  const TRAIT_BY_ID = Object.create(null);
  TRAITS.forEach(function (t, i) {
    t.index = i;
    t.bit = i;                       // 26 traits: comfortably inside a 32-bit mask
    t.mods = t.mods || {};
    t.resist = t.resist || {};
    t.paint = t.paint || {};
    TRAIT_BY_ID[t.id] = t;
  });

  function bit(id) { return 1 << TRAIT_BY_ID[id].index; }
  function maskOf(ids) { let m = 0; for (const id of ids) m |= bit(id); return m; }
  function has(mask, id) { return (mask & bit(id)) !== 0; }
  function idsOf(mask) {
    const out = [];
    for (let i = 0; i < TRAITS.length; i++) if (mask & (1 << i)) out.push(TRAITS[i].id);
    return out;
  }
  function listOf(mask) {
    const out = [];
    for (let i = 0; i < TRAITS.length; i++) if (mask & (1 << i)) out.push(TRAITS[i]);
    return out;
  }
  function popcount(m) {
    m = m - ((m >> 1) & 0x55555555);
    m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
    m = (m + (m >> 4)) & 0x0f0f0f0f;
    return (m * 0x01010101) >> 24;
  }

  // Checkpoint 1 runs a deliberately small pool so the wildfire test is legible:
  // does everything left alive after the burn happen to carry Ashlung?
  const STARTER_POOL = ['ashlung', 'deepburrow', 'heatfins', 'blubber',
                        'stonehide', 'glassbones', 'spawncloud', 'photoskin'];

  global.Traits = {
    ALL: TRAITS,
    BY_ID: TRAIT_BY_ID,
    STARTER_POOL: STARTER_POOL,
    COST: { LOW: LOW, MED: MED, HIGH: HIGH },
    bit: bit, maskOf: maskOf, has: has, idsOf: idsOf, listOf: listOf, popcount: popcount
  };
})(window);
