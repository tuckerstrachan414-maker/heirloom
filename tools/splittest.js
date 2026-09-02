// Why is nothing speciating? Reports, per census, the best divergent cluster
// inside each species: how far it is from the norm and how many carry it.
const fs=require('fs'),path=require('path'),vm=require('vm');
const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
const ctx=vm.createContext(win);
for(const f of ['rng','data-traits','data-strains','data-plagues','data-biomes','data-disasters','world','creature','species','sim','plague','log'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});

const T=win.Traits, TICK=1/24;
const seed=process.argv[2]||'test-1', YEARS=Number(process.argv[3]||300), EVERY=Number(process.argv[4]||40);
const log=new win.Log(null);
const sim=new win.Sim({seed:seed,log:log});
sim.computeCoast();
const narr=new win.Narrator(sim,log);
sim.onYear=narr.year.bind(narr); sim.onDisaster=narr.disaster.bind(narr);
sim.onExtinct=narr.extinct.bind(narr); sim.onSplit=narr.split.bind(narr);
sim.onStrain=narr.strain.bind(narr);
for(let k=0;k<2;k++)sim.seedSpecies(30,0,k*137.5);
sim.census();

function report(sp){
  const counts=new Map();
  let maxDist=0;
  for(const c of sim.creatures){
    if(!c.alive||c.sp!==sp)continue;
    const dist=T.popcount(c.mask^sp.coreMask);
    if(dist>maxDist)maxDist=dist;
    if(dist<win.SplitConfig.minDist)continue;
    counts.set(c.mask,(counts.get(c.mask)||0)+1);
  }
  let seedM=0,best=0;
  counts.forEach((n,m)=>{if(n>best){best=n;seedM=m;}});
  let group=0; counts.forEach((n,m)=>{if(T.popcount(m^seedM)<=1)group+=n;});
  return {core:T.idsOf(sp.coreMask).length, maxDist:maxDist, divergent:[...counts.values()].reduce((a,b)=>a+b,0),
          group:group, seed:seedM?T.idsOf(seedM).join('+'):'-'};
}

let next=EVERY;
console.log('cfg: minDist='+win.SplitConfig.minDist+' minGroup='+win.SplitConfig.minGroup+
            ' minParent='+win.SplitConfig.minParent+' years='+win.SplitConfig.years);
console.log('year  species        pop  coreN maxDist divergent bestCluster  clusterGenome');
while(sim.year<YEARS){
  sim.tick(TICK); sim.world.dirty.length=0;
  if(sim.year>=next){ next+=EVERY; sim.trigger('wildfire',{}); }
  if(Math.floor(sim.year)%25===0 && Math.abs(sim.year-Math.round(sim.year))<TICK){
    for(const sp of sim.livingSpecies()){
      const r=report(sp);
      console.log(String(Math.floor(sim.year)).padStart(4)+'  '+sp.name.padEnd(14)+
        String(sp.pop).padStart(4)+String(r.core).padStart(6)+String(r.maxDist).padStart(8)+
        String(r.divergent).padStart(10)+String(r.group).padStart(12)+'  '+r.seed);
    }
  }
}
console.log('splits: '+sim.species.filter(s=>s.parent).length+'   species ever: '+sim.species.length);
