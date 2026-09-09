import {writeFileSync} from 'node:fs';
import {createWorld,stepWorld,assertWorld,DEFAULT_CONFIG} from '../lib/simulation/engine.ts';
import type {SimulationConfig,BatchRow} from '../lib/simulation/types.ts';
const scenarios:{name:string;changes:Partial<SimulationConfig>}[]=[{name:'基准',changes:{}},{name:'关闭遗传',changes:{heredity:0}},{name:'关闭家庭培养',changes:{familySupport:0}},{name:'关闭继承',changes:{inheritance:0}},{name:'关闭资本优势',changes:{capitalEfficiency:0}},{name:'关闭转换成本',changes:{switchingCost:0}}];
const results:BatchRow[]=[];const start=performance.now();
for(let seed=1;seed<=20;seed++){
  for(const s of scenarios){const w=createWorld({...DEFAULT_CONFIG,population:160,seed:`validation-${seed}`,...s.changes});for(let t=0;t<3600;t++){stepWorld(w);if(t%12===0)assertWorld(w);}assertWorld(w);const f=w.history.at(-1)!;results.push({seed:w.config.seed,scenario:s.name,gini:f.gini,top10:f.top10,maxShare:Math.max(...f.markets.map(m=>m.topShare)),employment:f.employment,upward:f.upward,samples:f.mobilitySamples,cashError:f.ledger.cashError});}
  console.log(JSON.stringify({completedSeeds:seed,totalSeeds:20,seconds:Math.round((performance.now()-start)/1000)}));
}
const summary=scenarios.map(s=>{const rows=results.filter(x=>x.scenario===s.name);const values=rows.map(x=>x.gini).sort((a,b)=>a-b);return {scenario:s.name,runs:rows.length,giniMean:rows.reduce((a,b)=>a+b.gini,0)/rows.length,giniMin:values[0],giniMax:values.at(-1),meanMaxMarketShare:rows.reduce((a,b)=>a+b.maxShare,0)/rows.length,maxCashError:Math.max(...rows.map(r=>Math.abs(r.cashError)))};});
writeFileSync(process.argv[2]??'tests/experiment-results.json',JSON.stringify({population:160,years:300,seeds:20,scenarios:6,summary,results},null,2));console.log(JSON.stringify(summary));
