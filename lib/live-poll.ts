type RecentMessage={role:string;createdAt:string;delivery?:string};
/** A bounded conversation burst while a recent user request is still pending. */
export function threadPollDelay(messages:RecentMessage[],now=Date.now()){
 const last=messages.findLast(message=>message.role==='user');
 const age=last?now-Date.parse(last.createdAt):Infinity;
 return last?.role==='user'&&last.delivery!=='read'&&age>=0&&age<300_000?1000:5000;
}
/** Shared by automatic, manual and focus refreshes. */
export function singleFlight<A extends unknown[],R>(key:(...args:A)=>string,run:(...args:A)=>Promise<R>){
 const flights=new Map<string,Promise<R>>();
 return (...args:A):Promise<R>=>{const id=key(...args),existing=flights.get(id);if(existing)return existing;
 const promise=Promise.resolve().then(()=>run(...args)).finally(()=>{if(flights.get(id)===promise)flights.delete(id);});flights.set(id,promise);return promise;};
}
/** Completion-driven timer: no overlapping requests, no hidden-tab polling. */
export function visiblePoll(run:()=>Promise<boolean>,delay:()=>number,visibility:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>=document){
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,running=false,failures=0;
 const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
 const tick=async()=>{clear();if(stopped||visibility.hidden||running)return;running=true;
 try{failures=await run()?0:Math.min(failures+1,4);}catch{failures=Math.min(failures+1,4);}finally{running=false;if(!stopped&&!visibility.hidden)timer=setTimeout(tick,failures?Math.min(30000,5000*2**(failures-1)):delay());}};
 const changed=()=>{clear();if(!visibility.hidden)void tick();};
 visibility.addEventListener('visibilitychange',changed);void tick();
 return()=>{stopped=true;clear();visibility.removeEventListener('visibilitychange',changed);};
}

export function replyWaiting(messages:RecentMessage[],now=Date.now()) {
 const last=messages.at(-1);
 if(last?.role!=="user")return null;
 const age=now-Date.parse(last.createdAt);
 return {animate:Number.isFinite(age)&&age>=0&&age<120_000};
}
