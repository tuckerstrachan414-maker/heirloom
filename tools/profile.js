const fs=require('fs'),path=require('path'),vm=require('vm');
const win={};win.window=win;
win.document={createElement:function(){return {getContext:function(){return{};}};}};
win.performance={now:function(){return Date.now();}};
const ctx=vm.createContext(win);
for(const f of ['rng','data-traits','data-strains','data-biomes','data-disasters','world','creature','species','sim','log'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f+'.js'});

const t={};
function wrap(obj,name,label){const o=obj[name];obj[name]=function(){const s=process.hrtime.bigint();const r=o.apply(this,arguments);t[label]=(t[label]||0n)+(process.hrtime.bigint()-s);return r;};}
wrap(win.World.prototype,'tick','world.tick');
wrap(win.World.prototype,'stepFire','  world.stepFire');
wrap(win.Sim.prototype,'buildGrid','sim.buildGrid');
wrap(win.Sim.prototype,'updateCreature','sim.updateCreature');
wrap(win.Sim.prototype,'wander','  sim.wander');
wrap(win.Sim.prototype,'hazards','  sim.hazards');
wrap(win.Sim.prototype,'nearby','  sim.nearby');
wrap(win.Sim.prototype,'census','sim.census');
wrap(win.Sim.prototype,'flushBirths','sim.flushBirths');

const log=new win.Log(null);
const sim=new win.Sim({seed:process.argv[2]||'test-1',log:log});
sim.computeCoast();
const narr=new win.Narrator(sim,log);
sim.onYear=narr.year.bind(narr);sim.onDisaster=narr.disaster.bind(narr);sim.onExtinct=narr.extinct.bind(narr);
for(let k=0;k<2;k++)sim.seedSpecies(38,0);
sim.census();
const YEARS=Number(process.argv[3]||120),TICK=1/24;
const T0=process.hrtime.bigint();let ticks=0;
while(sim.year<YEARS){sim.tick(TICK);ticks++;sim.world.dirty.length=0;}
const total=Number(process.hrtime.bigint()-T0)/1e6;
console.log('total '+total.toFixed(0)+'ms over '+ticks+' ticks, final pop '+sim.aliveCount+
            '  ('+(ticks/(total/1000)).toFixed(0)+' ticks/s)');
const rows=Object.entries(t).map(([k,v])=>[k,Number(v)/1e6]).sort((a,b)=>b[1]-a[1]);
for(const [k,ms] of rows) console.log('  '+k.padEnd(22)+ms.toFixed(0).padStart(7)+'ms  '+(ms/total*100).toFixed(1)+'%');
