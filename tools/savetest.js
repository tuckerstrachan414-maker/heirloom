// A save code is only worth anything if the world it restores is the same
// world. Play one, encode it, replay from the code, compare everything.
const fs=require('fs'),path=require('path'),vm=require('vm');
function build(){
  const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
  const ctx=vm.createContext(win);
  for(const f of ['rng','data-traits','data-strains','data-plagues','data-biomes','data-disasters',
                  'world','creature','species','sim','plague','log','tree','save'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});
  return win;
}
const TICK=1/24;
function fresh(win,seed){
  win.SpeciesLib.resetIds(); win.Genome.clearCache();
  const log=new win.Log(null);
  const sim=new win.Sim({seed:seed,log:log});
  sim.computeCoast(); sim.timeline=[];
  const narr=new win.Narrator(sim,log);
  sim.onYear=narr.year.bind(narr);sim.onDisaster=narr.disaster.bind(narr);
  sim.onExtinct=narr.extinct.bind(narr);sim.onSplit=narr.split.bind(narr);
  sim.onStrain=narr.strain.bind(narr);sim.onEffectEnd=narr.effectEnd.bind(narr);
  sim.onPlague=narr.plague.bind(narr);sim.onPlagueEnd=narr.plagueEnd.bind(narr);
  const hue0=sim.rng.range(0,360);
  for(let k=0;k<2;k++){
    const sp=sim.seedSpecies(38,0,hue0+k*137.5);
    let hx=0,hy=0,n=0;
    for(const c of sim.creatures)if(c.sp===sp){hx+=c.x;hy+=c.y;n++;}
    sp.homeX=hx/n;sp.homeY=hy/n; narr.founded(sp,sp.homeX,sp.homeY);
  }
  sim.census();
  return {sim:sim,log:log,seedText:seed};
}
// Exactly what Game.fire does.
function fire(game,id,opts){
  const sim=game.sim, at=Math.round(sim.year*24);
  const line=sim.trigger(id,opts||{});
  if(!line)return null;
  const rec={t:at,id:id,name:win.Disasters.BY_ID[id].name};
  if(opts&&opts.x!==undefined){rec.x=Math.round(opts.x);rec.y=Math.round(opts.y);}
  sim.timeline.push(rec);
  return line;
}
function fingerprint(sim){
  let ash=0,rad=0,food=0,burn=0;
  for(let i=0;i<sim.world.n;i++){ash+=sim.world.ash[i];rad+=sim.world.rad[i];food+=sim.world.food[i];burn+=sim.world.biome[i];}
  const g=sim.creatures.filter(c=>c.alive).map(c=>c.mask+'@'+c.x.toFixed(4)+','+c.y.toFixed(4)+'/'+c.age.toFixed(4)).sort().join('|');
  return {
    year:sim.year.toFixed(6), pop:sim.aliveCount, born:sim.stats.born, total:sim.stats.total,
    species:sim.species.map(s=>s.name+':'+s.pop+':'+s.founded+':'+s.peakPop).join(','),
    plagues:sim.plagues.concat(sim.pastPlagues).map(p=>p.name+':'+p.everInfected+':'+p.lethality.toFixed(5)).join(','),
    world:[ash,rad,food,burn].map(v=>v.toFixed(4)).join('/'),
    creatures:g.length+':'+g.slice(0,60)
  };
}

const win=build();
const SEED='savetest-alpha', YEARS=Number(process.argv[2]||240);
// ---- play a world -------------------------------------------------------
const a=fresh(win,SEED);
const PLAN=[[25,'wildfire'],[60,'eruption'],[95,'plague-whisper'],[130,'meteor'],
            [150,'greenreturn'],[175,'plague-glass'],[205,'ironrain'],[220,'invasive']];
let pi=0;
for(let i=0;i<24*YEARS;i++){
  while(pi<PLAN.length && PLAN[pi][0]*24===i){
    const sp=a.sim.livingSpecies().sort((x,y)=>y.pop-x.pop)[0];
    fire(a,PLAN[pi][1], sp?{x:Math.round(sp.cx),y:Math.round(sp.cy)}:{});
    pi++;
  }
  a.sim.tick(TICK); a.sim.world.dirty.length=0;
}
const code=win.SaveCode.encode(a);
console.log('code ('+code.length+' chars):');
console.log('  '+code);
console.log('  recorded '+a.sim.timeline.length+' of '+PLAN.length+' planned events'+
            (a.sim.timeline.length<PLAN.length?'  (the rest found nothing to hit)':''));

// ---- restore it ---------------------------------------------------------
const save=win.SaveCode.decode(code);
if(typeof save==='string'){console.error('DECODE FAILED: '+save);process.exit(1);}
const b=fresh(win,save.seed);
let ni=0;
for(let i=0;i<save.ticks;i++){
  while(ni<save.events.length && save.events[ni].t===i){
    const e=save.events[ni++];
    b.sim.trigger(e.id, e.x===undefined?{}:{x:e.x,y:e.y});
  }
  b.sim.tick(TICK); b.sim.world.dirty.length=0;
}
while(ni<save.events.length){const e=save.events[ni++];b.sim.trigger(e.id,e.x===undefined?{}:{x:e.x,y:e.y});}
b.sim.census();

const fa=fingerprint(a.sim), fb=fingerprint(b.sim);
let bad=0;
for(const k of Object.keys(fa)){
  const same=String(fa[k])===String(fb[k]);
  if(!same)bad++;
  console.log((same?'  same  ':'  DIFF  ')+k.padEnd(10)+String(fa[k]).slice(0,96));
  if(!same)console.log('         restored  '+String(fb[k]).slice(0,96));
}
console.log('log lines '+a.log.lines.length+' vs restored '+b.log.lines.length+
            (a.log.lines.length===b.log.lines.length?'  (same)':'  DIFF'));

// ---- the tree renders off the restored world ---------------------------
const t=win.Tree.build(b.sim,save.seed);
console.log('tree: '+t.head.replace(/&middot;/g,'-'));
console.log('tree svg '+t.svg.length+' chars, '+(t.svg.match(/<rect/g)||[]).length+' bars, '+
            (t.svg.match(/<path/g)||[]).length+' split lines');

// ---- damaged codes must be refused, not thrown at ----------------------
const junk=['','hello','H1','H1|seed','H2|seed|100|','H1|bad seed|abc|','H1|s|100|9:nosuchdisaster,x'];
for(const j of junk){
  const r=win.SaveCode.decode(j);
  console.log('  junk '+JSON.stringify(j).padEnd(34)+' -> '+(typeof r==='string'?r:'accepted ('+r.events.length+' events)'));
}
console.log(bad?'ROUND TRIP FAILED ('+bad+' fields differ)':'ROUND TRIP EXACT over '+YEARS+' years');
