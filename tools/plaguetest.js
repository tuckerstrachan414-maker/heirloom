// Grow a world, drop a plague on it, and watch the disease itself evolve.
// node tools/plaguetest.js [base] [growYears] [watchYears]
const fs=require('fs'),path=require('path'),vm=require('vm');
const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
const ctx=vm.createContext(win);
for(const f of ['rng','data-traits','data-strains','data-plagues','data-biomes','data-disasters','world','creature','species','sim','plague','log'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});
const T=win.Traits,TICK=1/24;
const base=process.argv[2]||'whisper', GROW=Number(process.argv[3]||120), WATCH=Number(process.argv[4]||120);
const log=new win.Log(null);
const sim=new win.Sim({seed:'plague-'+base,log:log});
sim.computeCoast();
const narr=new win.Narrator(sim,log);
sim.onYear=narr.year.bind(narr);sim.onDisaster=narr.disaster.bind(narr);
sim.onExtinct=narr.extinct.bind(narr);sim.onSplit=narr.split.bind(narr);
sim.onStrain=narr.strain.bind(narr);sim.onEffectEnd=narr.effectEnd.bind(narr);
sim.onPlague=p=>log.say('A new strain: '+p.name+'.','event');
sim.onPlagueEnd=p=>log.say(p.name+' burned itself out. It took '+p.killed+'.','death');
for(let k=0;k<2;k++)sim.seedSpecies(30,0,k*137.5);
sim.census();
while(sim.year<GROW){sim.tick(TICK);sim.world.dirty.length=0;}
const before=sim.aliveCount;
console.log('grown '+GROW+'y: pop '+before+', species '+sim.livingSpecies().length);

const line=sim.trigger('plague-'+base,{});
console.log('fired: '+(line||'(NULL - nothing happened)'));
if(!line)process.exit(1);

let trough=before, peakInf=0, yr=0, next=0;
const rows=[];
while(yr<WATCH){
  sim.tick(TICK);sim.world.dirty.length=0;yr+=TICK;
  if(sim.aliveCount<trough)trough=sim.aliveCount;
  let inf=0;for(const c of sim.creatures)if(c.alive&&c.inf)inf++;
  if(inf>peakInf)peakInf=inf;
  if(yr>=next){
    next+=WATCH/8;
    const ps=sim.livePlagues();
    const tot=ps.reduce((a,p)=>a+p.active,0);
    const w=ps.length?ps[0]:null;
    rows.push('  y+'+String(Math.round(yr)).padStart(3)+'  pop '+String(sim.aliveCount).padStart(3)+
      '  sick '+String(tot).padStart(3)+'  lineages '+ps.length+
      (w?('   top '+w.name+'  spread '+w.transmission.toFixed(2)+'  kills '+w.lethality.toFixed(2)+
          '  lasts '+w.duration.toFixed(1)+'y  R'+w.spreadRate().toFixed(1)):''));
  }
}
console.log(rows.join('\n'));
console.log('trough '+trough+' of '+before+'  ('+Math.round((1-trough/before)*100)+'% culled), now '+sim.aliveCount);
console.log('peak infected '+peakInf+', plague deaths '+sim.stats.plague+' of '+sim.stats.total+' total');
const all=sim.plagues.concat(sim.pastPlagues).sort((a,b)=>b.everInfected-a.everInfected);
console.log('lineages: '+all.length+' (live '+sim.plagues.length+')');
for(const p of all.slice(0,8))
  console.log('  '+p.name.padEnd(22)+' gen'+p.gen+'  infected '+String(p.everInfected).padStart(4)+
    '  killed '+String(p.killed).padStart(4)+'  spread '+p.transmission.toFixed(2)+
    '  kills '+p.lethality.toFixed(2)+'  inc '+p.incubation.toFixed(2)+'  lasts '+p.duration.toFixed(1));
const im=[];for(const c of sim.creatures)if(c.alive&&c.imm&&c.imm[base]!==undefined)im.push(c.imm[base]);
console.log('immune survivors: '+im.length+' of '+sim.aliveCount);
console.log(log.lines.slice(-10).map(l=>'  '+l.text).join('\n'));
