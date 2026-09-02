// Some disasters only bite a world that has already evolved. Grow one for
// 200 years first, then fire the named disaster and watch it.
const fs=require('fs'),path=require('path'),vm=require('vm');
const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
const ctx=vm.createContext(win);
for(const f of ['rng','data-traits','data-strains','data-biomes','data-disasters','world','creature','species','sim','log'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});
const T=win.Traits,TICK=1/24;
const id=process.argv[2]||'ashwinter', GROW=Number(process.argv[3]||200);
const log=new win.Log(null);
const sim=new win.Sim({seed:'mature',log:log});
sim.computeCoast();
const narr=new win.Narrator(sim,log);
sim.onYear=narr.year.bind(narr);sim.onDisaster=narr.disaster.bind(narr);
sim.onExtinct=narr.extinct.bind(narr);sim.onSplit=narr.split.bind(narr);
sim.onStrain=narr.strain.bind(narr);sim.onEffectEnd=narr.effectEnd.bind(narr);
for(let k=0;k<2;k++)sim.seedSpecies(30,0,k*137.5);
sim.census();
let nextFire=30;
while(sim.year<GROW){
  sim.tick(TICK);sim.world.dirty.length=0;
  if(sim.year>=nextFire){nextFire+=30;sim.trigger('wildfire',{});}
}
function share(tid){let n=0,t=0;for(const c of sim.creatures){if(!c.alive)continue;t++;if(T.has(c.mask,tid))n++;}return t?Math.round(n/t*100):0;}
console.log('after '+GROW+'y: pop '+sim.aliveCount+', photoskin '+share('photoskin')+'%, ashlung '+share('ashlung')+
            '%, species '+sim.livingSpecies().length);
const d=win.Disasters.BY_ID[id];
const before=sim.aliveCount;
console.log('firing: '+(sim.trigger(id,{})||'(null)'));
let trough=before, yr=0;
const dur=d.duration?Math.round(d.duration*1.15):25;
while(yr<dur){ sim.tick(TICK);sim.world.dirty.length=0;yr+=TICK; if(sim.aliveCount<trough)trough=sim.aliveCount; }
console.log('trough '+trough+' of '+before+'  ('+Math.round((1-trough/before)*100)+'% culled), now '+sim.aliveCount);
console.log('photoskin now '+share('photoskin')+'%, ashlung '+share('ashlung')+'%');
console.log(log.lines.slice(-8).map(l=>'  '+l.text).join('\n'));
