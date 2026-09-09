import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import type {Snapshot,ExperimentRecord} from '../lib/simulation/types.ts';
type Response={type:string;data:Snapshot;baseline:Snapshot;record:ExperimentRecord;busy:boolean;message:string};
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
