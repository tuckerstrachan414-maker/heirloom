// Fire every disaster in turn against a fresh, populated world and report what
// it actually did. Catches rows that throw, do nothing, or wipe the map.
const fs=require('fs'),path=require('path'),vm=require('vm');
function load(){
  const win={};win.window=win;win.document={createElement:()=>({getContext:()=>({})})};
  const ctx=vm.createContext(win);
  for(const f of ['rng','data-traits','data-strains','data-biomes','data-disasters',
                  'world','creature','species','sim','log'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f+'.js'),'utf8'),ctx,{filename:f});
  return win;
}
const TICK=1/24;
function snapshot(w){
  const b={},c={};let ash=0,rad=0,iron=0,fire=0,food=0;
  for(let i=0;i<w.n;i++){
    b[w.biome[i]]=(b[w.biome[i]]||0)+1;
    ash+=w.ash[i];rad+=w.rad[i];iron+=w.iron[i];food+=w.food[i];
    if(w.burn[i]>0)fire++;
  }
  return {b:b,ash:ash,rad:rad,iron:iron,fire:fire,food:food};
}
function biomeDiff(a,b,win){
  const names=win.Biomes.ALL.map(x=>x.id),out=[];
  for(let i=0;i<names.length;i++){
    const d=(b.b[i]||0)-(a.b[i]||0);
    if(Math.abs(d)>3) out.push((d>0?'+':'')+d+' '+names[i]);
  }
  return out.join(' ');
}

const win0=load();
const rows=win0.Disasters.ALL.filter(d=>d.kind!=='hidden');
console.log('disaster            line returned                                 pop -> trough    biome change / notes');
let bad=0;
for(const proto of rows){
  const win=load();
  const log=new win.Log(null);
  const sim=new win.Sim({seed:'dtest',log:log});
  sim.computeCoast();
  for(let k=0;k<2;k++)sim.seedSpecies(30,0,k*137.5);
  sim.census();
  for(let i=0;i<24*45;i++){sim.tick(TICK);sim.world.dirty.length=0;}
  const before=snapshot(sim.world), popBefore=sim.aliveCount;
  const sp=sim.livingSpecies().sort((a,b)=>b.pop-a.pop)[0];
  let line=null, err=null;
  try{
    line=sim.trigger(proto.id, sp?{x:Math.round(sp.cx),y:Math.round(sp.cy)}:{});
  }catch(e){err=e.message;bad++;}
  // Slow disasters peak halfway through, so run them out properly.
  const watch = proto.duration ? Math.round(proto.duration * 0.75) : 14;
  let trough=popBefore;
  if(!err){
    try{ for(let i=0;i<24*watch;i++){sim.tick(TICK);sim.world.dirty.length=0;
           if(sim.aliveCount<trough)trough=sim.aliveCount;} }
    catch(e){err='during run: '+e.message;bad++;}
  }
  const after=snapshot(sim.world);
  const notes=[];
  const bd=biomeDiff(before,after,win); if(bd)notes.push(bd);
  if(after.ash-before.ash>20)notes.push('ash+'+Math.round(after.ash-before.ash));
  if(after.rad-before.rad>20)notes.push('rad+'+Math.round(after.rad-before.rad));
  if(after.iron-before.iron>20)notes.push('iron+'+Math.round(after.iron-before.iron));
  if(after.food-before.food>150)notes.push('food+'+Math.round(after.food-before.food));
  if(sim.effects.length)notes.push(sim.effects.length+' effect running');
  if(err){ bad++; }
  console.log(proto.name.padEnd(19)+
    (err?('THREW: '+err):(line===null?'*** returned null ***':line.slice(0,44))).padEnd(46)+
    (popBefore+'->'+trough+' ('+Math.round((1-trough/Math.max(1,popBefore))*100)+'%)').padEnd(16)+notes.join(', '));
}
console.log(bad?('\n'+bad+' PROBLEM(S)'):'\nall '+rows.length+' disasters fired without error');
