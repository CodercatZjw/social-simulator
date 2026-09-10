// Rate-limit pointer moves without requiring a pointer-up event to query history.
// Committing the final value flushes immediately and never restarts an identical seek.
export function createSeekScheduler(send:(month:number|null)=>void,delay=180){
 let handler=send;
 let timer:ReturnType<typeof setTimeout>|null=null;
 let pending:number|null|undefined,last:number|null|undefined;
 const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const flush=()=>{clear();const month=pending;pending=undefined;if(month!==undefined&&month!==last){last=month;handler(month);}};
 return {
  setHandler(next:(month:number|null)=>void){handler=next;},
  schedule(month:number){pending=month;if(timer===null)timer=setTimeout(flush,delay);},
  commit(month:number|null){pending=month;flush();},
  invalidate(){last=undefined;},
  cancel(){clear();pending=undefined;}
 };
}
