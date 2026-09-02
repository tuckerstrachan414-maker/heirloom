// HEIRLOOM - strains and flaws.
//
// THE EXTENSION POINT: one table holds both. A row fires when a creature
// carries every trait in `need` and none in `without`.
//
//   kind    - 'strain' (a named synergy) or 'flaw' (an anti-synergy)
//   need    - all of these traits must be present
//   without - none of these may be present (lets a row describe a trap:
//             Warning Colours with nothing behind it)
//   mods    - folded into derived stats after the traits themselves
//   resist  - stacks on trait resistances the same way
//   tint    - shifts the creature's colour so a strain is visible on the map
//
// Discovering one should feel like finding a secret, so every row carries the
// line the narrator reads out the first time it appears.

(function (global) {
  'use strict';

  const T = global.Traits;

  const STRAINS = [
    {
      id: 'thewaiting', kind: 'strain', name: 'The Waiting',
      need: ['tardigrade', 'diapause'], tint: '#cbb894',
      desc: 'The whole line can pause through an extinction. The world burns, the world heals, and they wake up and inherit it.',
      mods: { lifespan: 1.3 }, resist: { famine: 0.7, dark: 0.5, drought: 0.4 }
    },
    {
      id: 'cinderborn', kind: 'strain', name: 'Cinderborn',
      need: ['radiotrophic', 'ashlung'], tint: '#6b4a3f',
      desc: 'Eruptions and impacts became feeding grounds. They move toward the disaster.',
      mods: { radFood: 2.5 }, resist: { fire: 0.5, ash: 0.6 }
    },
    {
      id: 'untouchable', kind: 'strain', name: 'Untouchable',
      need: ['poisonskin', 'warningcolours'], tint: '#a86fd0',
      desc: 'Nothing on the map will ever eat them again.',
      mods: {}, resist: { predation: 0.9 }
    },
    {
      id: 'winterlord', kind: 'strain', name: 'Winterlord',
      need: ['antifreeze', 'blubber'], tint: '#8fc4e8',
      desc: 'They own the ice outright. Everything else up there is a guest.',
      mods: { coldTol: 0.25 }, resist: { cold: 0.7 }
    },
    {
      id: 'swarmflesh', kind: 'strain', name: 'Swarmflesh',
      need: ['glassbones', 'spawncloud'], tint: '#e6e2ea',
      desc: 'Dies constantly, breeds insanely, and mutates faster than anything else alive.',
      mods: { mutate: 1.8, fertility: 1.2 }, resist: {}
    },
    {
      id: 'sunspire', kind: 'strain', name: 'Sunspire',
      need: ['photoskin', 'rootfoot'], tint: '#5f9440',
      desc: 'It has stopped being an animal. It is a spreading forest now - needs nothing, and cannot flee.',
      mods: { sunFood: 2.0, lifespan: 1.5 }, resist: { famine: 0.6 }
    },
    {
      id: 'driftkin', kind: 'strain', name: 'Driftkin',
      need: ['saltglands', 'buoyant'], tint: '#79c2bd',
      desc: 'They ride out floods and reach islands nothing else can.',
      mods: { speed: 1.25, coastFood: 1.5 }, resist: { flood: 0.7, drought: 0.4 }
    },
    {
      id: 'quietones', kind: 'strain', name: 'The Quiet Ones',
      need: ['nightmind', 'echosense'], tint: '#6d6a90',
      desc: 'Fully at home in total darkness. The long night belongs to them.',
      mods: { forage: 1.3 }, resist: { dark: 0.8 }
    },
    {
      id: 'phoenixline', kind: 'strain', name: 'Phoenix Line',
      need: ['ashbloom', 'ashlung'], tint: '#d4713c',
      desc: 'It cannot breed without fire and cannot be harmed by it. Its population is a graph of wildfires.',
      mods: { litter: 1 }, resist: { fire: 0.7, ash: 0.5 }
    },
    {
      id: 'endlessline', kind: 'strain', name: 'Endless Line',
      need: ['parthenogenesis', 'pheromone'], tint: '#d9a6c4',
      desc: 'One survivor is enough to refill an empty world.',
      mods: { fertility: 1.4, mateRange: 1.5 }, resist: {}
    },
    {
      id: 'meteorborn', kind: 'strain', name: 'Meteorborn',
      need: ['irongut', 'stonehide'], tint: '#9a8258',
      desc: 'Meteor showers make them stronger. The plating thickens with every strike.',
      mods: { ironFood: 2.0, armour: 0.3 }, resist: { impact: 0.6, acid: 0.4 }
    },
    {
      id: 'deepkeep', kind: 'strain', name: 'Deepkeep',
      need: ['deepburrow', 'hibernation'], tint: '#93764f',
      desc: 'They sleep out every apocalypse underground. Almost nothing reaches them. Almost nothing they want is down there either.',
      mods: { lifespan: 1.2 }, resist: { fire: 0.5, cold: 0.6, storm: 0.5, famine: 0.5 }
    },

    // ---- flaws: evolution is allowed to make mistakes ---------------------
    {
      id: 'crossedmetabolism', kind: 'flaw', name: 'Crossed Metabolism',
      need: ['blubber', 'heatfins'],
      desc: 'Insulating and venting at the same time. Both systems run, neither wins.',
      mods: { upkeepAdd: 1.2 }, resist: {}
    },
    {
      id: 'deadweight', kind: 'flaw', name: 'Dead Weight',
      need: ['rootfoot', 'buoyant'],
      desc: 'A float bladder on something that will never move again.',
      mods: { upkeepAdd: 0.6 }, resist: {}
    },
    {
      id: 'darkleaf', kind: 'flaw', name: 'Dark Leaf',
      need: ['photoskin', 'nightmind'],
      desc: 'Photosynthetic skin on a creature that only wakes after dark.',
      mods: { sunFoodMul: 0.2 }, resist: {}
    },
    {
      id: 'rootedbloom', kind: 'flaw', name: 'Rooted Bloom',
      need: ['rootfoot', 'ashbloom'],
      desc: 'Its young can only be born on burnt ground, and it cannot walk to any.',
      mods: { fertility: 0.35 }, resist: {}
    },
    {
      id: 'hollowwarning', kind: 'flaw', name: 'Hollow Warning',
      need: ['warningcolours'], without: ['poisonskin'],
      desc: 'All that colour and nothing behind it. Every disaster sees it coming a mile off.',
      mods: { upkeepAdd: 0.25 }, resist: { predation: -0.4 }
    },
    {
      id: 'clonedimmunity', kind: 'flaw', name: 'Cloned Immunity',
      need: ['parthenogenesis'], without: ['spawncloud'],
      desc: 'Every child identical. Whatever kills one of them kills all of them.',
      mods: {}, resist: { disease: -0.5 }
    }
  ];

  const BY_ID = Object.create(null);
  for (const s of STRAINS) {
    s.needMask = T.maskOf(s.need);
    s.withoutMask = s.without ? T.maskOf(s.without) : 0;
    s.mods = s.mods || {};
    s.resist = s.resist || {};
    BY_ID[s.id] = s;
  }

  function matches(mask) {
    const out = [];
    for (const s of STRAINS) {
      if ((mask & s.needMask) === s.needMask && (mask & s.withoutMask) === 0) out.push(s);
    }
    return out;
  }

  global.Strains = { ALL: STRAINS, BY_ID: BY_ID, matches: matches };
})(window);
