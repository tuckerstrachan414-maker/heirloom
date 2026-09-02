// Does a wildfire actually select for Ashlung? Measures trait prevalence in a
// species immediately before a fire and three years after it.
const fs=require('fs'),path=require('path'),vm=require('vm');
const win={};win.window=win;
win.document={createElement:function(){return {getContext:function(){return{};}};}};
win.performance={now:function(){return Date.now();}};
const ctx=vm.createContext(win);
for(const f of ['rng','data-traits','data-biomes','data-disasters','world','creature','species','sim','log'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f+'.js'});

const seed=process.argv[2]||'test-1', EVERY=Number(process.argv[3]||25), YEARS=Number(process.argv[4]||260);
const AIM=process.argv[5]==='aimed';   // always burn the biggest species' home
const T=win.Traits, TICK=1/24;
const log=new win.Log(null);
const sim=new win.Sim({seed:seed,log:log});
sim.computeCoast();
const narr=new win.Narrator(sim,log);
sim.onYear=narr.year.bind(narr);sim.onDisaster=narr.disaster.bind(narr);sim.onExtinct=narr.extinct.bind(narr);
for(let k=0;k<2;k++)sim.seedSpecies(30,0);
sim.census();

function prev(sp,id){return sp.pop?sp.traitCount[T.BY_ID[id].index]/sp.pop:0;}
function biggest(){let b=null;for(const s of sim.livingSpecies())if(!b||s.pop>b.pop)b=s;return b;}
const WATCH=['ashlung','deepburrow','heatfins','photoskin','glassbones','spawncloud','stonehide','blubber'];
let next=EVERY, pending=null, misfires=0;
const rows=[];
while(sim.year<YEARS){
  sim.tick(TICK); sim.world.dirty.length=0;
  if(sim.year>=next){
    next+=EVERY;
    const sp=biggest(); if(!sp) continue;
    const before={}; for(const id of WATCH) before[id]=prev(sp,id);
    const opts = AIM ? {x:Math.round(sp.cx),y:Math.round(sp.cy)} : {};
    if(sim.trigger('wildfire',opts)) pending={sp:sp,before:before,pop:sp.pop,at:sim.year}; else misfires++;
  }
  if(pending&&sim.year>pending.at+3){
    const sp=pending.sp; sim.census();
    const after={}; for(const id of WATCH) after[id]=prev(sp,id);
    rows.push({y:Math.floor(pending.at),name:sp.name,pop:pending.pop,now:sp.pop,before:pending.before,after:after});
    pending=null;
  }
}
console.log('=== fire selection test: seed '+seed+', every '+EVERY+'y, '+(AIM?'AIMED at the herd':'random creature')+' ===');
console.log('year  species        pop        '+WATCH.map(w=>T.BY_ID[w].name.split(' ')[0].slice(0,7).padStart(7)).join(''));
for(const r of rows){
  const d=WATCH.map(w=>{
    const b=Math.round(r.before[w]*100),a=Math.round(r.after[w]*100);
    return (b||a)?((b+'>'+a).padStart(7)):('      .');
  }).join('');
  console.log(String(r.y).padStart(4)+'  '+r.name.padEnd(14)+String(r.pop).padStart(4)+'>'+String(r.now).padStart(4)+'  '+d);
}
console.log('misfires (nothing would catch): '+misfires);
const sp=biggest();
if(sp) console.log('\nfinal: '+sp.plural()+' pop '+sp.pop+'  '+WATCH.map(w=>T.BY_ID[w].name+' '+Math.round(prev(sp,w)*100)+'%').filter(s=>!/ 0%$/.test(s)).join(', '));
