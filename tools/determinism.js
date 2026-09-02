// Save codes are a replay log, which only works if the sim is bit-identical
// from the same seed and the same schedule. This proves it, or kills the idea.
const fs=require('fs'),path=require('path'),vm=require('vm');
function build(){
  const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
  const ctx=vm.createContext(win);
  for(const f of ['rng','data-traits','data-strains','data-plagues','data-biomes','data-disasters','world','creature','species','sim','plague','log'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});
  return win;
}
const TICK=1/24;
// tick index -> [disasterId, x, y]
const SCHEDULE=[[24*30,'wildfire',null],[24*70,'eruption',null],[24*110,'plague-whisper',null],
                [24*150,'meteor',null],[24*185,'greenreturn',null],[24*210,'plague-glass',null]];
function run(seed,years){
  const win=build();
  const log=new win.Log(null);
  const sim=new win.Sim({seed:seed,log:log});
  sim.computeCoast();
  for(let k=0;k<2;k++)sim.seedSpecies(30,0,k*137.5);
  sim.census();
  const fired=new Set();
  for(let i=0;i<24*years;i++){
    for(const s of SCHEDULE) if(s[0]===i && !fired.has(s)){fired.add(s);
      const sp=sim.livingSpecies().sort((a,b)=>b.pop-a.pop)[0];
      sim.trigger(s[1], sp?{x:Math.round(sp.cx),y:Math.round(sp.cy)}:{});}
    sim.tick(TICK); sim.world.dirty.length=0;
  }
  const genomes=sim.creatures.filter(c=>c.alive).map(c=>c.mask+'@'+c.x.toFixed(4)+','+c.y.toFixed(4)).sort().join('|');
  let ash=0,rad=0,food=0;
  for(let i=0;i<sim.world.n;i++){ash+=sim.world.ash[i];rad+=sim.world.rad[i];food+=sim.world.food[i];}
  return {
    pop:sim.aliveCount, born:sim.stats.born, total:sim.stats.total,
    species:sim.species.map(s=>s.name+':'+s.pop+':'+s.founded).join(','),
    plagues:sim.plagues.concat(sim.pastPlagues).map(p=>p.name+':'+p.everInfected).join(','),
    world:ash.toFixed(4)+'/'+rad.toFixed(4)+'/'+food.toFixed(4),
    hash:genomes.length+':'+genomes.slice(0,80),
    log:log.lines.length
  };
}
const YEARS=Number(process.argv[2]||320);
const a=run('determinism-check',YEARS), b=run('determinism-check',YEARS);
let bad=0;
for(const k of Object.keys(a)){
  const same=String(a[k])===String(b[k]);
  if(!same)bad++;
  console.log((same?'  same  ':'  DIFF  ')+k.padEnd(8)+' '+String(a[k]).slice(0,110));
  if(!same)console.log('         run2  '+String(b[k]).slice(0,110));
}
const c=run('a-different-seed',YEARS);
console.log(bad?'NOT DETERMINISTIC ('+bad+' fields differ)':'DETERMINISTIC over '+YEARS+' years and 8 disasters');
console.log('sanity: a different seed gives pop '+c.pop+' vs '+a.pop+', species ['+c.species.slice(0,60)+']');
