import {createWorld,stepWorld,snapshot,assertWorld,branchWorld,restoreRecord} from './engine.ts';
import type {WorldState,WorkerRequest,ExperimentRecord,BatchRow,SimulationConfig} from './types.ts';
import {WorldTimeline} from './timeline.ts';

let world:WorldState|null=null,baseline:WorldState|null=null;
let timer:ReturnType<typeof setTimeout>|null=null,running=false,speed=1,remaining=0,selected:number|null=null;
let batchToken=0,batchRunning=false;
let timeline:WorldTimeline|null=null,baselineTimeline:WorldTimeline|null=null;
let viewed:WorldState|null=null,viewedBaseline:WorldState|null=null,seekToken=0,seeking=false;
const send=(message:unknown)=>postMessage(message);
function stop(){running=false;remaining=0;if(timer!==null)clearTimeout(timer);timer=null;}
function detail(){const w=viewed??world;if(w&&selected!==null)send({type:'detail',person:w.people.find(p=>p.id===selected)??null,family:w.family[selected]??null,relatives:[...(w.family[selected]?.parents??[]),...(w.family[selected]?.children??[])].map(id=>w.family[id]),trajectory:w.trajectories[selected]??[]});}
function publish(){if(world){const w=viewed??world,b=viewed?viewedBaseline:baseline;send({type:'snapshot',data:snapshot(w),baseline:b?snapshot(b):null,running,busy:remaining>0,timeline:{earliestMonth:Math.max(timeline?.earliestMonth??world.month,baseline?baselineTimeline?.earliestMonth??baseline.month:0),latestMonth:world.month,viewMonth:w.month,historical:!!viewed}});detail();}}
function clearView(){seekToken++;seeking=false;viewed=null;viewedBaseline=null;}
async function seek(month:number|null){
 if(!world||!timeline)return;
 stop();const token=++seekToken;
 if(month===null||month===world.month){seeking=false;viewed=null;viewedBaseline=null;publish();return;}
 const earliest=Math.max(timeline.earliestMonth,baseline?baselineTimeline?.earliestMonth??baseline.month:0);
 if(!Number.isInteger(month)||month<earliest||month>world.month)throw new Error('只能查看可回溯范围内、已经模拟过的月份');
 seeking=true;send({type:'seekProgress',target:month,completed:0,total:month-earliest});
 try{
  const past=await timeline.read(month,world,()=>token!==seekToken,m=>send({type:'seekProgress',target:month,completed:Math.max(0,m-earliest),total:month-earliest}));
  if(!past||token!==seekToken)return;
  const pastBase=baseline&&baselineTimeline?await baselineTimeline.read(month,baseline,()=>token!==seekToken):null;
  if(token!==seekToken)return;
  viewed=past;viewedBaseline=pastBase;seeking=false;publish();
 }catch(error){if(token===seekToken){seeking=false;send({type:'error',message:error instanceof Error?error.message:'无法还原历史月份'});publish();}}
}
function advance(){
  if(!world||batchRunning)return;
  try{const start=performance.now();let count=0;const cap=running?speed:Math.min(12,remaining);
    while(count<cap&&performance.now()-start<45&&world.month<world.config.years*12){stepWorld(world);timeline?.capture(world);if(baseline&&baseline.month<world.month){stepWorld(baseline);baselineTimeline?.capture(baseline);}count++;if(!running)remaining--;}
    assertWorld(world);if(world.month>=world.config.years*12)stop();publish();
    if(running||remaining>0)timer=setTimeout(advance,running&&speed===1?220:10);
  }catch(error){stop();send({type:'error',message:error instanceof Error?error.message:'模拟异常'});publish();}
}
const scenarios:{name:string;changes:Partial<SimulationConfig>}[]=[{name:'基准',changes:{}},{name:'关闭遗传',changes:{heredity:0}},{name:'关闭家庭培养',changes:{familySupport:0}},{name:'关闭继承',changes:{inheritance:0}},{name:'关闭资本优势',changes:{capitalEfficiency:0}},{name:'关闭转换成本',changes:{switchingCost:0}}];
async function batch(seeds:number,years:number,population:number){
  if(!world)return;stop();batchRunning=true;const token=++batchToken;const config={...world.config};const rows:BatchRow[]=[];const count=Math.max(20,Math.min(30,Math.floor(seeds)));const total=count*scenarios.length;
  send({type:'batchProgress',done:0,total,rows,year:0,years});
  for(let i=0;i<count;i++)for(const scenario of scenarios){if(token!==batchToken)return;
    const w=createWorld({...config,population,years,seed:`${config.seed}:replicate:${i+1}`,...scenario.changes});
    while(w.month<years*12){const start=performance.now();while(w.month<years*12&&performance.now()-start<40)stepWorld(w);await new Promise(resolve=>setTimeout(resolve,0));if(token!==batchToken)return;if(w.month%12<6)send({type:'batchProgress',done:rows.length,total,rows,year:Math.floor(w.month/12),years});}
    assertWorld(w);const f=w.history[w.history.length-1];rows.push({seed:w.config.seed,scenario:scenario.name,gini:f.gini,top10:f.top10,maxShare:Math.max(...f.markets.map(m=>m.topShare)),employment:f.employment,upward:f.upward,samples:f.mobilitySamples,cashError:f.ledger.cashError});send({type:'batchProgress',done:rows.length,total,rows,year:years,years});
  }
  batchRunning=false;send({type:'batchDone',rows});publish();
}
onmessage=(event:MessageEvent<WorkerRequest>)=>{const msg=event.data;
  try{
    if(batchRunning&&!['cancelBatch','inspect','export'].includes(msg.type)){send({type:'error',message:'请先停止批量实验'});return;}
    if((viewed||seeking)&&['run','step','track','branch','batch'].includes(msg.type))throw new Error('请先返回最新时刻，再继续演化或修改世界');
    if(msg.type==='init'){stop();clearView();world=createWorld(msg.config);timeline=new WorldTimeline(world);baseline=null;baselineTimeline=null;selected=null;publish();}
    else if(msg.type==='seek'){seek(msg.month).catch(error=>{seeking=false;send({type:'error',message:String(error)});publish();});}
    else if(msg.type==='pause'){stop();publish();}
    else if(msg.type==='run'){stop();running=true;speed=Math.max(1,Math.min(120,msg.speed));advance();}
    else if(msg.type==='step'){stop();remaining=Math.max(1,Math.min(1200,Math.floor(msg.months)));advance();}
    else if(msg.type==='inspect'){selected=msg.id;detail();}
    else if(msg.type==='track'&&world){if(world.tracked.includes(msg.id))world.tracked=world.tracked.filter(id=>id!==msg.id);else if(world.tracked.length<12){world.tracked.push(msg.id);world.trajectories[msg.id]??=[];}else throw new Error('最多同时关注 12 位个体');timeline?.record({type:'tracking',month:world.month,ids:world.tracked});publish();}
    else if(msg.type==='branch'&&world){stop();const next=branchWorld(world,msg.changes);baseline=world;baselineTimeline=timeline;timeline=timeline?.fork()??new WorldTimeline(world);timeline.record({type:'config',month:world.month,changes:msg.changes});world=next;publish();send({type:'notice',message:'已建立对照分支；继续运行时，两条世界线同步演化'});}
    else if(msg.type==='export'&&world){const record:ExperimentRecord={version:1,name:'群演实验',savedAt:new Date().toISOString(),world,timeline:timeline?.archive,...(baseline?{baseline,baselineTimeline:baselineTimeline?.archive}:{})};send({type:'export',purpose:msg.purpose,record});}
    else if(msg.type==='import'){const next=restoreRecord(msg.record);const base=msg.record.baseline?restoreRecord({...msg.record,world:msg.record.baseline}):null;if(base&&base.month!==next.month)throw new Error('分支存档时间不一致');const nextTimeline=WorldTimeline.restore(next,msg.record.timeline),baseTimeline=base?WorldTimeline.restore(base,msg.record.baselineTimeline):null;stop();clearView();world=next;timeline=nextTimeline;baseline=base;baselineTimeline=baseTimeline;selected=null;publish();send({type:'notice',message:nextTimeline.earliestMonth>0?'旧存档已恢复。缺少早期回溯记录，时间轴从存档月份开始。':'存档已恢复，可继续演化或回看历史月份'});}
    else if(msg.type==='batch'){batch(msg.seeds,msg.years,msg.population).catch(error=>{batchRunning=false;send({type:'error',message:String(error)});publish();});}
    else if(msg.type==='cancelBatch'){batchToken++;batchRunning=false;send({type:'batchCancelled'});publish();}
  }catch(error){send({type:'error',message:error instanceof Error?error.message:'操作失败'});}
};
