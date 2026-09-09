import type {ExperimentRecord} from './types';
const DB='social-lab-v1';
async function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('experiments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function saveLocal(record:ExperimentRecord){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('experiments','readwrite');tx.objectStore('experiments').put(record,'latest');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function loadLocal(){const db=await open();try{return await new Promise<ExperimentRecord|undefined>((resolve,reject)=>{const tx=db.transaction('experiments','readonly');const r=tx.objectStore('experiments').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
