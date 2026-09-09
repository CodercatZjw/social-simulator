import {parentPort,workerData} from 'node:worker_threads';
globalThis.postMessage=data=>parentPort.postMessage(data);
globalThis.onmessage=null;
await import(workerData?.module??'../lib/simulation/worker.ts');
parentPort.on('message',data=>globalThis.onmessage({data}));
