import {assertWorld,restoreRecord,stepWorld,validateConfig} from './engine.ts';
import type {TimelineArchive,TimelineEvent,WorldState} from './types.ts';

interface Checkpoint {world:WorldState;eventIndex:number;}
// Frames and trajectory points are immutable. Share those values between the
// sparse in-memory checkpoints, while copying all mutable simulation state.
function copyWorld(world:WorldState):WorldState {
 const copy:WorldState=structuredClone({...world,history:[],trajectories:{}});
 copy.history=[...world.history];
 copy.trajectories=Object.fromEntries(Object.entries(world.trajectories).map(([id,points])=>[id,[...points]]));
 return copy;
}
function applyEvent(world:WorldState,event:TimelineEvent){
 if(event.type==='config'){
  world.config=validateConfig({...world.config,...event.changes});
  world.interventions.push({month:event.month,changes:{...event.changes}});
 }else{
  world.tracked=[...event.ids];
  for(const id of event.ids)world.trajectories[id]??=[];
 }
}
export class WorldTimeline {
 readonly archive:TimelineArchive;
 private checkpoints:Checkpoint[]=[];
 private interval:number;
 constructor(origin:WorldState,archive?:TimelineArchive){
  this.archive=archive??{version:1,origin:copyWorld(origin),events:[]};
  this.interval=Math.max(12,Math.ceil((origin.config.years*12-this.archive.origin.month)/8));
 }
 get earliestMonth(){return this.archive.origin.month;}
 record(event:TimelineEvent){this.archive.events.push(structuredClone(event));}
 fork(){
  const copy=new WorldTimeline(this.archive.origin,{...this.archive,events:[...this.archive.events]});
  copy.checkpoints=[...this.checkpoints];return copy;
 }
 capture(world:WorldState){
  this.cache(world,this.archive.events.length);
 }
 private cache(world:WorldState,eventIndex:number){
  if(world.month<=this.earliestMonth||(world.month-this.earliestMonth)%this.interval!==0)return;
  if(this.checkpoints.some(c=>c.world.month===world.month))return;
  this.checkpoints.push({world:copyWorld(world),eventIndex});
  this.checkpoints.sort((a,b)=>a.world.month-b.world.month);
  // This cache is disposable; the saved origin and event log remain sufficient.
  if(this.checkpoints.length>8)this.checkpoints.shift();
 }
 async read(month:number,latest:WorldState,cancelled:()=>boolean=()=>false,progress:(month:number)=>void=()=>{}):Promise<WorldState|null>{
  if(!Number.isInteger(month)||month<this.earliestMonth||month>latest.month)throw new Error('只能查看可回溯范围内、已经模拟过的月份');
  const checkpoint=this.checkpoints.filter(c=>c.world.month<=month).at(-1);
  const result=copyWorld(checkpoint?.world??this.archive.origin);
  let eventIndex=checkpoint?.eventIndex??0;
  const apply=()=>{while(eventIndex<this.archive.events.length&&this.archive.events[eventIndex].month<=result.month)applyEvent(result,this.archive.events[eventIndex++]);};
  apply();progress(result.month);
  while(result.month<month){
   if(cancelled())return null;
   const start=performance.now();
   do{
    stepWorld(result);apply();
    // Never substitute a plausible replay for the actual recorded history.
    if(JSON.stringify(result.history.at(-1))!==JSON.stringify(latest.history[result.month]))throw new Error('历史还原与已记录数据不一致，请返回最新时刻；该存档可能来自不同模型版本');
    this.cache(result,eventIndex);
   }while(result.month<month&&performance.now()-start<40);
   progress(result.month);await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(cancelled())return null;
  assertWorld(result);return result;
 }
 static restore(latest:WorldState,input?:TimelineArchive){
  // Old records contain no pre-intervention configuration or observation log.
  // Start at their known exact state instead of inventing missing history.
  if(!input)return new WorldTimeline(latest);
  if(input.version!==1||!Array.isArray(input.events))throw new Error('时间轴存档格式不完整');
  const origin=restoreRecord({version:1,name:'回溯起点',savedAt:'',world:input.origin});
  if(origin.month>latest.month||['population','years','seed','wealthMode'].some(k=>origin.config[k as keyof typeof origin.config]!==latest.config[k as keyof typeof latest.config]))throw new Error('时间轴起点与当前世界不一致');
  if(JSON.stringify(origin.history)!==JSON.stringify(latest.history.slice(0,origin.month+1)))throw new Error('时间轴起点的历史与当前世界不一致');
  let previous=origin.month,config={...origin.config};
  for(const event of input.events){
   if(!Number.isInteger(event.month)||event.month<previous||event.month>latest.month)throw new Error('时间轴操作月份无效');
   previous=event.month;
   if(event.type==='config'){
    if(!event.changes||typeof event.changes!=='object'||['population','years','seed','wealthMode'].some(k=>k in event.changes))throw new Error('时间轴包含无效的初始条件变更');
    config=validateConfig({...config,...event.changes});
   }else if(event.type==='tracking'){
    if(!Array.isArray(event.ids)||event.ids.length>12||new Set(event.ids).size!==event.ids.length||event.ids.some(id=>!Number.isInteger(id)||id<1||id>=latest.nextId))throw new Error('时间轴关注记录无效');
   }else throw new Error('时间轴操作类型无效');
  }
  if(JSON.stringify(config)!==JSON.stringify(latest.config))throw new Error('时间轴规则记录与当前世界不一致');
  return new WorldTimeline(latest,{version:1,origin,events:structuredClone(input.events)});
 }
}
