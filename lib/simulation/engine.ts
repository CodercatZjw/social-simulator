import type { SimulationConfig, Person, Triple, WorldState, FamilyRecord, MarketMetric, MetricFrame, Ledger, Snapshot, ExperimentRecord } from './types.ts';

export const DEFAULT_CONFIG: SimulationConfig = {population:2000,years:300,seed:'20260909',wealthMode:'equal',heredity:.6,plasticity:1,capitalEfficiency:1,coordinationCost:.05,switchingCost:.15,searchSize:8,familySupport:1,inheritance:1};
const EPS=1e-9;
export const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
export function hash(text:string) {let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function random(state:{rng:number}) {state.rng=(state.rng+0x6d2b79f5)>>>0;let t=state.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
export function normal(state:{rng:number}) {return Math.sqrt(-2*Math.log(Math.max(1e-12,random(state))))*Math.cos(2*Math.PI*random(state));}
function shuffle<T>(xs:T[],w:{rng:number}) {for(let i=xs.length-1;i>0;i--){const j=Math.floor(random(w)*(i+1));[xs[i],xs[j]]=[xs[j],xs[i]];}return xs;}
export function validateConfig(input:SimulationConfig):SimulationConfig {
  const c={...DEFAULT_CONFIG,...input};
  const ranges:Record<string,[number,number]>={population:[80,5000],years:[1,500],heredity:[0,1],plasticity:[0,1],capitalEfficiency:[0,5],coordinationCost:[0,.5],switchingCost:[0,2],searchSize:[1,32],familySupport:[0,2],inheritance:[0,1]};
  for(const [k,[lo,hi]] of Object.entries(ranges)){const v=c[k as keyof SimulationConfig];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw new Error(`参数 ${k} 必须在 ${lo}—${hi} 之间`);}
  if(!Number.isInteger(c.population)||!Number.isInteger(c.years)||!Number.isInteger(c.searchSize))throw new Error('人口、年限和搜索范围必须为整数');
  if(typeof c.seed!=='string'||!c.seed.trim()||c.seed.length>100)throw new Error('随机种子需要 1—100 个字符');
  if(!['equal','unequal'].includes(c.wealthMode))throw new Error('未知的财富分布');
  return c;
}
function blankMarket():MarketMetric {return {price:1,supply:0,volume:0,revenue:0,demand:0,selfUse:0,sellers:0,topShare:0,hhi:0,leader:null,entrants:0,testedEntrants:0,survivedEntrants:0,leaderMonths:0};}
function makePerson(id:number,age:number,born:number,base:number[],parents:number[]=[]):Person {
  return {id,age,born,parents,children:[],base,traits:[...base],skills:[0,0,0],cash:0,capital:0,fatigue:0,satisfaction:1,sector:0,employer:null,price:1,offered:0,sold:0,income:0,labourIncome:0,ownerIncome:0,expense:0,familyGiven:0,familyReceived:0,inheritanceReceived:0,customers:[-1,-1,-1],expected:[1,1,1],rank50:null};
}
function familyRecord(p:Person,month:number):FamilyRecord {return {id:p.id,born:p.born,death:null,parents:[...p.parents],children:[...p.children],base:[...p.base],rank50:null,milestones:[{month,text:p.born<0?'初始世界中的个体':'出生'}]};}
export function createWorld(config:SimulationConfig=DEFAULT_CONFIG):WorldState {
  const c=validateConfig(config);
  const w:WorldState={version:1,config:c,month:0,rng:hash(c.seed),nextId:c.population+1,initialCash:c.population*100,people:[],family:{},history:[],markets:[blankMarket(),blankMarket(),blankMarket()],mobility:Array.from({length:5},()=>Array(5).fill(0)),entrantCohorts:[],previousUnits:[],tracked:[],trajectories:{},interventions:[]};
  const ages=shuffle(Array.from({length:c.population},(_,i)=>Math.floor(i*960/c.population)),w);
  for(let i=0;i<c.population;i++){
    const p=makePerson(i+1,ages[i],-ages[i]-1,Array.from({length:8},()=>clamp(50+15*normal(w),0,100)));
    p.skills=[0,1,2].map(()=>Math.min(20,p.age/12*1.12)) as Triple;
    p.cash=100;p.sector=[0,1,2].sort((a,b)=>ability(p,b)-ability(p,a))[0];w.people.push(p);
  }
  // Initial endowments use a separate random stream, preserving people and future shocks across modes.
  if(c.wealthMode==='unequal') {const r={rng:hash(c.seed+'-wealth')};const ws=w.people.map(()=>Math.exp(normal(r)*1.05));const scale=w.initialCash/sum(ws);w.people.forEach((p,i)=>p.cash=ws[i]*scale);}
  for(const p of w.people)if(p.age<216){const candidates=w.people.filter(x=>x.age-p.age>=240&&x.age-p.age<=480);shuffle(candidates,w);p.parents=candidates.slice(0,2).map(x=>x.id);for(const q of candidates.slice(0,2))q.children.push(p.id);}
  for(const p of w.people)w.family[p.id]=familyRecord(p,0);
  w.history.push(measure(w,emptyLedger(w),0));return w;
}
export function gini(values:number[]) {const a=[...values].sort((x,y)=>x-y);const total=sum(a);if(total<=EPS)return 0;let weighted=0;for(let i=0;i<a.length;i++)weighted+=(i+1)*a[i];return clamp(2*weighted/(a.length*total)-(a.length+1)/a.length);}
export function wealth(p:Person,w:Pick<WorldState,'markets'>) {return p.cash+p.capital*w.markets[2].price;}
function ability(p:Person,s:number) {const weights=[[.6,.25,.15],[.15,.6,.25],[.25,.15,.6]][s];return .5+sum(weights.map((x,i)=>x*p.traits[i]))/100;}
const isWorking=(p:Person)=>p.age>=216&&p.age<792;
function labour(p:Person) {if(!isWorking(p))return 0;const h=.35+.35*p.traits[3]/100;return h*(.6+.4*p.traits[4]/100)*(1-.5*p.fatigue)*(.55+.45*p.satisfaction)*(p.age>720?1-(p.age-720)/240:1);}
function baseOutput(p:Person,s:number) {return 8*labour(p)*ability(p,s)*(.5+p.skills[s]/100);}
function capitalMultiplier(k:number,c:SimulationConfig) {return 1+c.capitalEfficiency*k/(k+50);}
function emptyLedger(w:WorldState):Ledger {return {cashError:0,capitalError:0,capitalBefore:sum(w.people.map(p=>p.capital)),capitalCreated:0,depreciation:0,capitalAfter:0,traded:0,inheritanceTransferred:0,supportTransferred:0,maxOversell:0};}
export function inheritTraits(a:number[],b:number[],h:number,state:{rng:number}) {return a.map((x,i)=>clamp(50+h*((x+b[i])/2-50)+15*Math.sqrt(1-h*h/2)*normal(state),0,100));}
function demographics(w:WorldState,ledger:Ledger) {
  for(const p of w.people){p.age++;p.familyGiven=0;p.familyReceived=0;p.inheritanceReceived=0;}
  const dead=w.people.filter(p=>p.age>=960);if(!dead.length)return 0;
  const alive=w.people.filter(p=>p.age<960);const byId=new Map(alive.map(p=>[p.id,p]));let publicCash=0,publicCapital=0;
  for(const p of dead){w.family[p.id].death=w.month;w.family[p.id].milestones.push({month:w.month,text:'80 岁离世'});const heirs=p.children.map(id=>byId.get(id)).filter((x):x is Person=>!!x);const f=heirs.length?w.config.inheritance:0;
    publicCash+=p.cash*(1-f);publicCapital+=p.capital*(1-f);
    for(const q of heirs){const money=p.cash*f/heirs.length;const k=p.capital*f/heirs.length;q.cash+=money;q.capital+=k;q.inheritanceReceived+=money+k*w.markets[2].price;ledger.inheritanceTransferred+=money;w.family[q.id].milestones.push({month:w.month,text:`继承 #${p.id} 的资源 ${Math.round(money+k*w.markets[2].price)}`});}
  }
  const parents=alive.filter(p=>p.age>=300&&p.age<552);
  for(let i=0;i<dead.length;i++){
    const pool=parents.length>=2?parents:alive.filter(p=>p.age>=216);
    const a=pool.length?pool[Math.floor(random(w)*pool.length)]:undefined;
    const other=pool.filter(p=>p.id!==a?.id);const b=other.length?other[Math.floor(random(w)*other.length)]:undefined;
    const base=a&&b?inheritTraits(a.base,b.base,w.config.heredity,w):Array.from({length:8},()=>clamp(50+15*normal(w),0,100));
    const p=makePerson(w.nextId++,0,w.month,base,[a?.id,b?.id].filter((x):x is number=>x!==undefined));
    for(const parent of [a,b])if(parent){parent.children.push(p.id);w.family[parent.id].children.push(p.id);}
    alive.push(p);w.family[p.id]=familyRecord(p,w.month);
  }
  for(const p of alive){p.cash+=publicCash/alive.length;p.capital+=publicCapital/alive.length;if(p.employer!==null&&!byId.has(p.employer))p.employer=null;}
  w.people=alive;return dead.length;
}
function support(w:WorldState,ledger:Ledger) {
  const map=new Map(w.people.map(p=>[p.id,p]));
  for(const child of shuffle(w.people.filter(p=>p.age<216),w))for(const id of child.parents){const parent=map.get(id);if(!parent)continue;
    const need=Math.max(0,2*w.markets[0].price+.4*w.markets[1].price-child.cash);
    const cash=Math.min(need,Math.max(0,parent.cash-6*w.markets[0].price)*.04*w.config.familySupport);
    parent.cash-=cash;child.cash+=cash;parent.familyGiven+=cash;child.familyReceived+=cash;ledger.supportTransferred+=cash;
  }
}
interface Unit {owner:Person;members:Person[];bases:number[];sector:number;base:number;capacity:number;remaining:number;offered:number;revenue:number;sold:number;selfUse:number;}
function capacity(u:Unit,w:WorldState,extra=0,extraBase=0) {return (u.base+extraBase)*capitalMultiplier(u.owner.capital,w.config)/(1+w.config.coordinationCost*(u.members.length+extra-1)/(1+u.owner.traits[2]/25));}
function predicted(u:Unit,w:WorldState,extra=0,extraBase=0) {const m=w.markets[u.sector];const fill=m.supply>EPS?clamp(m.volume/m.supply,.05,1):.6;return capacity(u,w,extra,extraBase)*u.owner.price*fill*Math.min(1,(m.price/u.owner.price)**1.5);}
function organize(w:WorldState):Unit[] {
  const workers=shuffle(w.people.filter(isWorking),w);const units=new Map<number,Unit>();
  for(const p of workers){
    if(p.offered>EPS)p.price=clamp(p.price*(p.sold/p.offered>.9?1.03:p.sold/p.offered<.6?.97:1),1e-6,1e6);
    const scores=[0,1,2].map(s=>{const m=w.markets[s];const fill=m.supply>EPS?clamp(m.volume/m.supply,.05,1):.6;const prior=baseOutput(p,s)*capitalMultiplier(p.capital,w.config)*m.price*fill;p.expected[s]=.85*p.expected[s]+.15*prior;return p.expected[s]*(1+normal(w)*(.02+.2*(1-p.traits[0]/100)));});
    let sector=p.sector;
    if(random(w)<.05)sector=Math.floor(random(w)*3);else {const best=scores.indexOf(Math.max(...scores));if(scores[best]>scores[p.sector]*(1.1+.2*(1-p.traits[6]/100)))sector=best;}
    if(sector!==p.sector){p.price=w.markets[sector].price;p.offered=0;p.sold=0;}p.sector=sector;p.employer=null;
    const base=baseOutput(p,sector);units.set(p.id,{owner:p,members:[p],bases:[base],sector,base,capacity:0,remaining:0,offered:0,revenue:0,sold:0,selfUse:0});
  }
  const perSector=[0,1,2].map(s=>workers.filter(p=>p.sector===s));
  for(const p of workers){const own=units.get(p.id);if(!own||own.members.length!==1)continue;const pool=perSector[p.sector];let best:Unit|undefined;let bestPay=predicted(own,w)*1.04;
    for(let i=0;i<Math.min(8,pool.length);i++){const q=pool[Math.floor(random(w)*pool.length)];const u=units.get(q.id);if(!u||q.id===p.id)continue;const rev=predicted(u,w,1,own.base);const pay=.8*rev*own.base/(u.base+own.base);const oldOwner=predicted(u,w)*(.2+.8*u.bases[0]/u.base);const newOwner=rev*(.2+.8*u.bases[0]/(u.base+own.base));if(pay>bestPay&&newOwner>oldOwner*1.001){best=u;bestPay=pay;}}
    if(best){best.members.push(p);best.bases.push(own.base);best.base+=own.base;p.employer=best.owner.id;units.delete(p.id);}
  }
  for(const p of w.people)if(!isWorking(p)){p.employer=null;p.offered=0;p.sold=0;}
  return [...units.values()];
}
function growth(w:WorldState,consumption:Map<number,Triple>,ledger:Ledger) {
  for(const p of w.people){const got=consumption.get(p.id)!;p.satisfaction=clamp(got[0]);const was=p.capital;p.capital+=got[2];ledger.capitalCreated+=got[2];const decay=p.capital*.01;p.capital-=decay;ledger.depreciation+=decay;
    const study=p.age<216?.8:p.age>=792?.1:.05+.2*p.traits[7]/100;
    const plastic=.75+.5*p.traits[5]/100;const time=labour(p);
    for(let s=0;s<3;s++){const learn=(.25*study*(1+Math.min(2,got[1]*2))/3+(isWorking(p)&&s===p.sector?.12*time:0))*plastic*(1-p.skills[s]/100);const forget=(s!==p.sector||!isWorking(p))?.001*(1-p.traits[1]/100)*p.skills[s]:0;p.skills[s]=clamp(p.skills[s]+learn-forget,0,100);}
    const h=isWorking(p)?.35+.35*p.traits[3]/100:0;const rest=Math.max(0,1-h-study);p.fatigue=clamp(p.fatigue+Math.max(0,h-.5)*.15-rest*.12+(1-p.satisfaction)*.015);
    if(w.month%12===0){for(let t=0;t<5;t++){const adjustment=clamp((sum(p.skills)/300*.35-p.fatigue*.3)*plastic*w.config.plasticity,-.5,.5);p.traits[t]=clamp(p.traits[t]+adjustment,Math.max(0,p.base[t]-8),Math.min(100,p.base[t]+8));}}
    if(p.age===216)w.family[p.id].milestones.push({month:w.month,text:'18 岁，进入劳动市场'});
    if(p.age===792)w.family[p.id].milestones.push({month:w.month,text:'66 岁，结束劳动'});
    if(!Number.isFinite(was))throw new Error('资本数值异常');
  }
}
export function stepWorld(w:WorldState):MetricFrame {
  if(w.month>=w.config.years*12)return w.history[w.history.length-1];
  const ledger=emptyLedger(w);w.month++;const births=demographics(w,ledger);support(w,ledger);
  const units=organize(w);const memberUnit=new Map<number,Unit>();for(const u of units)for(const p of u.members)memberUnit.set(p.id,u);
  const desired=new Map<number,Triple>(), budgets=new Map<number,Triple>(), got=new Map<number,Triple>();
  const next=w.markets.map(m=>({...blankMarket(),price:m.price,testedEntrants:m.testedEntrants,survivedEntrants:m.survivedEntrants}));
  for(const p of w.people){p.income=0;p.labourIncome=0;p.ownerIncome=0;p.expense=0;
    const study=p.age<216?.8:p.age>=792?.1:.05+.2*p.traits[7]/100;let available=p.cash;
    const life=Math.min(available,w.markets[0].price*1.8);available-=life;
    const learning=Math.min(available,study*w.markets[1].price*1.4);available-=learning;
    const investment=isWorking(p)?Math.max(0,available-w.markets[0].price*3)*(.02+.06*p.traits[6]/100):0;
    const d:Triple=[1,study,investment/w.markets[2].price];desired.set(p.id,d);budgets.set(p.id,[life,learning,investment]);got.set(p.id,[0,0,0]);
    for(let s=0;s<3;s++)next[s].demand+=d[s];
  }
  for(const u of units){u.capacity=capacity(u,w);u.remaining=u.capacity;const s=u.sector;const total=sum(u.members.map(p=>desired.get(p.id)![s]));const self=Math.min(total,u.capacity);u.selfUse=self;
    for(const p of u.members){const x=total>EPS?self*desired.get(p.id)![s]/total:0;got.get(p.id)![s]+=x;desired.get(p.id)![s]-=x;}
    u.remaining-=self;u.offered=u.remaining;next[s].selfUse+=self;next[s].supply+=u.offered;
  }
  const sellers=[0,1,2].map(s=>units.filter(u=>u.sector===s&&u.offered>EPS));const ownerMap=new Map(units.map(u=>[u.owner.id,u]));
  // Settle spending from opening budgets; revenue becomes available only after all buying.
  for(const p of shuffle([...w.people],w))for(let s=0;s<3;s++){
    let need=desired.get(p.id)![s];let budget=Math.min(budgets.get(p.id)![s],p.cash);if(need<EPS||budget<EPS)continue;
    const pool=sellers[s];if(!pool.length)continue;const candidates:Unit[]=[];const seen=new Set<number>();const own=memberUnit.get(p.id)?.owner.id;
    const old=ownerMap.get(p.customers[s]);if(old&&old.sector===s&&old.owner.id!==own&&old.remaining>EPS){candidates.push(old);seen.add(old.owner.id);}
    const limit=Math.min(w.config.searchSize,pool.length);
    for(let k=0;k<limit*3&&candidates.length<limit;k++){const u=pool[Math.floor(random(w)*pool.length)];if(seen.has(u.owner.id)||u.owner.id===own||u.remaining<EPS)continue;seen.add(u.owner.id);candidates.push(u);}
    const score=(u:Unit)=>u.owner.price/ability(u.owner,s)*(u.owner.id===p.customers[s]?1:1+w.config.switchingCost*(.5+(old?.owner.traits[2]??50)/200));
    candidates.sort((a,b)=>score(a)-score(b));
    for(const u of candidates){const qty=Math.min(need,u.remaining,budget/u.owner.price,p.cash/u.owner.price);if(qty<EPS)continue;const paid=Math.min(p.cash,budget,qty*u.owner.price);p.cash-=paid;p.expense+=paid;budget-=paid;need-=qty;u.remaining-=qty;u.sold+=qty;u.revenue+=paid;got.get(p.id)![s]+=qty;p.customers[s]=u.owner.id;next[s].volume+=qty;next[s].revenue+=paid;ledger.traded+=paid;if(need<EPS||budget<EPS)break;}
  }
  for(const u of units){ledger.maxOversell=Math.max(ledger.maxOversell,u.sold-u.offered);u.owner.offered=u.offered;u.owner.sold=u.sold;
    for(let i=0;i<u.members.length;i++){const p=u.members[i];const labor=u.base>EPS?.8*u.revenue*u.bases[i]/u.base:0;const ownership=i===0?.2*u.revenue:0;p.labourIncome=labor;p.ownerIncome=ownership;p.income=labor+ownership;p.cash+=p.income;}
  }
  const oldUnits=new Set(w.previousUnits);const currentUnits=new Set(units.map(u=>`${u.owner.id}:${u.sector}`));
  for(const u of units){if(!oldUnits.has(`${u.owner.id}:${u.sector}`)){next[u.sector].entrants++;w.entrantCohorts.push({id:u.owner.id,sector:u.sector,month:w.month});}}
  w.previousUnits=[...currentUnits];
  w.entrantCohorts=w.entrantCohorts.filter(x=>{if(w.month-x.month<12)return true;next[x.sector].testedEntrants++;if(currentUnits.has(`${x.id}:${x.sector}`)&&(ownerMap.get(x.id)?.revenue??0)>EPS)next[x.sector].survivedEntrants++;return false;});
  for(let s=0;s<3;s++){const m=next[s];const active=sellers[s].filter(u=>u.revenue>EPS);m.sellers=active.length;if(m.volume>EPS)m.price=m.revenue/m.volume;let top=0;for(const u of active){const share=u.revenue/m.revenue;m.hhi+=share*share*10000;if(share>top){top=share;m.leader=u.owner.id;}}m.topShare=top;m.leaderMonths=top>=.5?(w.markets[s].leader===m.leader?w.markets[s].leaderMonths+1:1):0;}
  w.markets=next;growth(w,got,ledger);
  ledger.capitalAfter=sum(w.people.map(p=>p.capital));ledger.capitalError=ledger.capitalAfter-(ledger.capitalBefore+ledger.capitalCreated-ledger.depreciation);ledger.cashError=sum(w.people.map(p=>p.cash))-w.initialCash;
  recordRanks(w);
  const frame=measure(w,ledger,births);w.history.push(frame);
  for(const id of w.tracked){const p=w.people.find(x=>x.id===id);if(p)(w.trajectories[id]??=[]).push({month:w.month,cash:p.cash,capital:p.capital,income:p.income,skill:sum(p.skills)/3});}
  return frame;
}
function recordRanks(w:WorldState) {
  const at50=w.people.filter(p=>p.age===600);if(!at50.length)return;
  const peers=w.people.filter(p=>p.age>=540&&p.age<660).map(p=>wealth(p,w)).sort((a,b)=>a-b);
  for(const p of at50){const value=wealth(p,w);let less=0,equal=0;for(const x of peers){if(x<value)less++;else if(x===value)equal++;}p.rank50=(less+equal/2)/peers.length;w.family[p.id].rank50=p.rank50;
    if(p.born>=0){const parents=p.parents.map(id=>w.family[id]?.rank50).filter((x):x is number=>typeof x==='number');if(parents.length===2){const row=Math.min(4,Math.floor(sum(parents)/2*5));const col=Math.min(4,Math.floor(p.rank50*5));w.mobility[row][col]++;}}
  }
}
function measure(w:WorldState,ledger:Ledger,births:number):MetricFrame {
  const values=w.people.map(p=>wealth(p,w)).sort((a,b)=>a-b),total=sum(values),n=values.length;const samples=sum(w.mobility.flat());const bottom=sum(w.mobility[0]),top=sum(w.mobility[4]);
  return {month:w.month,gini:gini(values),cashGini:gini(w.people.map(p=>p.cash)),totalWealth:total,totalCash:sum(w.people.map(p=>p.cash)),medianWealth:values[Math.floor(n/2)]??0,top10:total>EPS?sum(values.slice(Math.floor(n*.9)))/total:0,satisfaction:sum(w.people.map(p=>p.satisfaction))/n,employment:w.people.filter(p=>p.employer!==null).length/Math.max(1,w.people.filter(isWorking).length),meanSkill:sum(w.people.map(p=>sum(p.skills)/3))/n,births,markets:structuredClone(w.markets),ledger:{...ledger},mobilitySamples:samples,upward:bottom>=20?w.mobility[0][4]/bottom:null,topRetention:top>=20?w.mobility[4][4]/top:null};
}
export function snapshot(w:WorldState):Snapshot {const stride=Math.max(1,Math.ceil(w.history.length/600));return {config:w.config,month:w.month,frame:w.history[w.history.length-1],history:w.history.filter((_,i)=>i%stride===0||i===w.history.length-1),people:w.people,mobility:w.mobility,tracked:w.tracked,interventions:w.interventions};}
export function branchWorld(w:WorldState,changes:Partial<SimulationConfig>):WorldState {
  for(const key of ['population','years','seed','wealthMode'])if(key in changes&&changes[key as keyof SimulationConfig]!==w.config[key as keyof SimulationConfig])throw new Error('人口、年限、种子和初始财富分布需要重新开局');
  const copy=structuredClone(w);copy.config=validateConfig({...w.config,...changes});copy.interventions.push({month:w.month,changes});return copy;
}
export function assertWorld(w:WorldState) {
  if(w.people.length!==w.config.population)throw new Error('人口数量不守恒');
  const byId=new Map(w.people.map(p=>[p.id,p]));if(byId.size!==w.people.length)throw new Error('个体编号重复');
  for(const p of w.people){if(!Number.isFinite(p.cash)||p.cash< -1e-7||!Number.isFinite(p.capital)||p.capital<0)throw new Error('账户数值越界');if(p.skills.some(x=>!Number.isFinite(x)||x<0||x>100))throw new Error('技能越界');if(p.traits.some((x,i)=>!Number.isFinite(x)||x<0||x>100||Math.abs(x-p.base[i])>8+EPS))throw new Error('天资越界');if(p.fatigue<0||p.fatigue>1||p.satisfaction<0||p.satisfaction>1)throw new Error('状态越界');if(p.employer!==null){const employer=byId.get(p.employer);if(!employer||employer.id===p.id||employer.employer!==null||!isWorking(employer)||!isWorking(p))throw new Error('雇佣关系无效');}}
  const frame=w.history[w.history.length-1];if(Math.abs(frame.ledger.cashError)>w.initialCash*1e-7||Math.abs(sum(w.people.map(p=>p.cash))-w.initialCash)>w.initialCash*1e-7)throw new Error('现金账目不平衡');if(Math.abs(frame.ledger.capitalError)>Math.max(1,frame.ledger.capitalAfter)*1e-7)throw new Error('资本账目不平衡');if(frame.ledger.maxOversell>EPS)throw new Error('产出超卖');
}
export function restoreRecord(record:ExperimentRecord):WorldState {
  if(record?.version!==1||record.world?.version!==1)throw new Error('不支持的存档版本');const w=structuredClone(record.world);w.config=validateConfig(w.config);
  if(!Number.isInteger(w.month)||w.month<0||w.month>w.config.years*12||!Number.isInteger(w.rng)||!Array.isArray(w.people)||!Array.isArray(w.history)||w.history.length!==w.month+1||!Array.isArray(w.mobility)||w.mobility.length!==5)throw new Error('存档结构不完整');
  if(w.initialCash!==w.config.population*100||!Number.isInteger(w.nextId)||w.nextId<=Math.max(...w.people.map(p=>p.id)))throw new Error('存档编号或现金基准无效');
  for(const p of w.people)if(!Number.isInteger(p.id)||!Number.isInteger(p.age)||p.age<0||p.age>=960||p.base.length!==8||p.traits.length!==8||p.skills.length!==3||!w.family[p.id])throw new Error('存档个体记录不完整');
  assertWorld(w);return w;
}
