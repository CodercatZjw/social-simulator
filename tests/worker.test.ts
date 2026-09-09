import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import type {Snapshot,ExperimentRecord,TimelineStatus,Person,FamilyRecord} from '../lib/simulation/types.ts';
type Response={type:string;data:Snapshot;baseline:Snapshot;record:ExperimentRecord;busy:boolean;message:string;timeline:TimelineStatus;person:Person|null;family:FamilyRecord|null;running:boolean};
import {DEFAULT_CONFIG} from '../lib/simulation/engine.ts';
void test('worker initializes, steps, forks, exports, restores, and cancels batch without changing the world',async()=>{
 const w=new Worker(new URL('./worker-adapter.mjs',import.meta.url));
 const wait=(predicate:(m:Response)=>boolean,timeout=10000)=>new Promise<Response>((resolve,reject)=>{const timer=setTimeout(()=>{w.off('message',listener);reject(new Error('worker response timeout'));},timeout);function listener(m:Response){if(m.type==='error'){clearTimeout(timer);w.off('message',listener);reject(new Error(m.message));}else if(predicate(m)){clearTimeout(timer);w.off('message',listener);resolve(m);}}w.on('message',listener);});
 try{
  let result=wait(m=>m.type==='snapshot');w.postMessage({type:'init',config:{...DEFAULT_CONFIG,population:80}});assert.equal((await result).data.month,0);
  result=wait(m=>m.type==='snapshot'&&m.data.month===12&&!m.busy);w.postMessage({type:'step',months:12});await result;
  result=wait(m=>m.type==='snapshot'&&!!m.baseline);w.postMessage({type:'branch',changes:{}});await result;
  result=wait(m=>m.type==='snapshot'&&m.data.month===24&&!m.busy);w.postMessage({type:'step',months:12});const branched=await result;assert.deepEqual(branched.data.people,branched.baseline.people);
  result=wait(m=>m.type==='export');w.postMessage({type:'export',purpose:'download'});const record=(await result).record;
  result=wait(m=>m.type==='snapshot'&&m.data.month===24);w.postMessage({type:'import',record});await result;
  result=wait(m=>m.type==='batchProgress');w.postMessage({type:'batch',seeds:20,years:100,population:80});await result;
  result=wait(m=>m.type==='snapshot');w.postMessage({type:'cancelBatch'});const after=await result;assert.equal(after.data.month,24);assert.deepEqual(after.data.people,branched.data.people);
 }finally{await w.terminate();}
});
void test('worker history switches the whole view, cancels stale seeks, restores archives and resumes the exact latest world',async()=>{
 const w=new Worker(new URL('./worker-adapter.mjs',import.meta.url));
 const wait=(predicate:(m:Response)=>boolean)=>new Promise<Response>((resolve,reject)=>{const timer=setTimeout(()=>{w.off('message',listener);reject(new Error('worker history timeout'));},10000);function listener(m:Response){if(predicate(m)){clearTimeout(timer);w.off('message',listener);resolve(m);}else if(m.type==='error'){clearTimeout(timer);w.off('message',listener);reject(new Error(m.message));}}w.on('message',listener);});
 const request=(message:unknown,predicate:(m:Response)=>boolean)=>{const pending=wait(predicate);w.postMessage(message);return pending;};
 try{
  await request({type:'init',config:{...DEFAULT_CONFIG,population:80,years:20}},m=>m.type==='snapshot');
  const at12=await request({type:'step',months:12},m=>m.type==='snapshot'&&m.data.month===12&&!m.busy);
  await request({type:'branch',changes:{capitalEfficiency:2}},m=>m.type==='snapshot'&&!!m.baseline);
  const latest=await request({type:'step',months:120},m=>m.type==='snapshot'&&m.data.month===132&&!m.busy);
  const before=(await request({type:'export',purpose:'download'},m=>m.type==='export')).record;
  const past=await request({type:'seek',month:12},m=>m.type==='snapshot'&&m.timeline.historical);
  assert.deepEqual(past.data.people,at12.data.people);assert.deepEqual(past.baseline.people,at12.data.people);
  assert.equal(past.timeline.latestMonth,132);assert.equal(past.timeline.viewMonth,12);assert.equal(past.running,false);
  const id=past.data.people[0].id;
  const detail=await request({type:'inspect',id},m=>m.type==='detail');assert.deepEqual(detail.person,past.data.people[0]);assert.ok(detail.family!.milestones.every(m=>m.month<=12));
  const error=await request({type:'step',months:1},m=>m.type==='error');assert.match(error.message,/最新时刻/);
  const after=(await request({type:'export',purpose:'download'},m=>m.type==='export')).record;assert.deepEqual(after.world,before.world);
  await request({type:'seek',month:80},m=>m.type==='seekProgress');
  const initial=await request({type:'seek',month:0},m=>m.type==='snapshot'&&m.data.month===0);assert.equal(initial.timeline.latestMonth,132);
  const live=await request({type:'seek',month:null},m=>m.type==='snapshot'&&!m.timeline.historical);assert.deepEqual(live.data,latest.data);
  await request({type:'import',record:JSON.parse(JSON.stringify(before))},m=>m.type==='snapshot');
  const restored=await request({type:'seek',month:12},m=>m.type==='snapshot'&&m.timeline.historical);assert.deepEqual(restored.data,past.data);
  await request({type:'seek',month:null},m=>m.type==='snapshot'&&!m.timeline.historical);
  const continued=await request({type:'step',months:1},m=>m.type==='snapshot'&&m.data.month===133&&!m.busy);assert.equal(continued.timeline.latestMonth,133);
  await request({type:'seek',month:134},m=>m.type==='error');
  const final=(await request({type:'export',purpose:'download'},m=>m.type==='export')).record;assert.equal(final.world.month,133);
 }finally{await w.terminate();}
});
