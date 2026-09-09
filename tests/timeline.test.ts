import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,DEFAULT_CONFIG,stepWorld,branchWorld} from '../lib/simulation/engine.ts';
import {WorldTimeline} from '../lib/simulation/timeline.ts';
import type {WorldState} from '../lib/simulation/types.ts';

const make=()=>createWorld({...DEFAULT_CONFIG,population:80,years:100});
void test('arbitrary historical months reproduce whole worlds across births, deaths and sparse checkpoints',async()=>{
 const w=make(),timeline=new WorldTimeline(w);
 const months=[0,1,11,12,149,150,151,600,959,960,961,1199,1200];
 const expected=new Map<number,WorldState>([[0,structuredClone(w)]]);
 while(w.month<1200){stepWorld(w);timeline.capture(w);if(months.includes(w.month))expected.set(w.month,structuredClone(w));}
 const unchanged=structuredClone(w);
 for(const month of [...months].reverse())assert.deepEqual(await timeline.read(month,w),expected.get(month));
 assert.deepEqual(w,unchanged);
 await assert.rejects(timeline.read(-1,w));await assert.rejects(timeline.read(1201,w));await assert.rejects(timeline.read(2.5,w));
});
void test('replay preserves same-month tracking changes, branch rules, and the original comparison world',async()=>{
 let w=createWorld({...DEFAULT_CONFIG,population:80,years:20}),timeline=new WorldTimeline(w);
 const advance=(to:number)=>{while(w.month<to){stepWorld(w);timeline.capture(w);}};
 advance(30);const tracked=w.people[0].id;
 w.tracked=[tracked];w.trajectories[tracked]=[];timeline.record({type:'tracking',month:30,ids:[tracked]});
 const at30=structuredClone(w);advance(35);
 const baseline=w,baseTimeline=timeline;
 w=branchWorld(w,{inheritance:0,capitalEfficiency:2});timeline=timeline.fork();timeline.record({type:'config',month:35,changes:{inheritance:0,capitalEfficiency:2}});
 const at35=structuredClone(w);advance(45);
 w.tracked=[];timeline.record({type:'tracking',month:45,ids:[]});const at45=structuredClone(w);
 advance(75);while(baseline.month<75){stepWorld(baseline);baseTimeline.capture(baseline);}
 assert.deepEqual(await timeline.read(30,w),at30);
 assert.deepEqual(await timeline.read(35,w),at35);
 assert.deepEqual(await timeline.read(45,w),at45);
 assert.deepEqual(await baseTimeline.read(30,baseline),at30);
 assert.equal((await baseTimeline.read(45,baseline))!.config.inheritance,1);
 const archive=JSON.parse(JSON.stringify(timeline.archive));
 const restored=WorldTimeline.restore(w,archive);
 assert.deepEqual(await restored.read(45,w),at45);
 assert.deepEqual(await restored.read(75,w),w);
});
void test('legacy imports expose only known exact history and can acquire new queryable months',async()=>{
 const w=make();for(let i=0;i<36;i++)stepWorld(w);
 const timeline=WorldTimeline.restore(w),at36=structuredClone(w);
 assert.equal(timeline.earliestMonth,36);await assert.rejects(timeline.read(35,w));
 for(let i=0;i<12;i++)stepWorld(w);
 assert.deepEqual(await timeline.read(36,w),at36);assert.deepEqual(await timeline.read(48,w),w);
});
void test('cancelled or inconsistent history cannot modify the live world or supply invented results',async()=>{
 const w=make(),timeline=new WorldTimeline(w);for(let i=0;i<60;i++)stepWorld(w);
 const unchanged=structuredClone(w);let cancelled=false;
 assert.equal(await timeline.read(59,w,()=>cancelled,()=>{cancelled=true;}),null);
 assert.deepEqual(w,unchanged);
 const invalid=structuredClone(w);invalid.history[1].gini+=.01;
 await assert.rejects(timeline.read(10,invalid),/不一致/);
 const archive=structuredClone(timeline.archive);archive.events.push({month:61,type:'tracking',ids:[]});
 assert.throws(()=>WorldTimeline.restore(w,archive),/月份无效/);
});
