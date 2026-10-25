/** Shared board/thread snapshots. Never let a delayed response undo newer task state. */
export function taskSnapshots<T extends {id:string;updatedAt:string;unread:number}>(){
 const values=new Map<string,{task:T;order:number}>();let order=0;
 return {begin:()=>++order,accept(incoming:T,readOrder:number):T{
  const prior=values.get(incoming.id);if(!prior){values.set(incoming.id,{task:incoming,order:readOrder});return incoming;}
  const before=Date.parse(prior.task.updatedAt),after=Date.parse(incoming.updatedAt);
  const newer=Number.isFinite(after)&&(!Number.isFinite(before)||after>before),same=after===before;
  const acceptState=newer||(same&&readOrder>=prior.order);
  const task=acceptState?{...prior.task,...incoming}:prior.task;
  // Read receipts do not bump updatedAt. Request ordering independently protects unread.
  const merged=readOrder>=prior.order?{...task,unread:incoming.unread}:{...task,unread:prior.task.unread};
  values.set(incoming.id,{task:merged,order:Math.max(prior.order,readOrder)});return merged;
 },get:(id:string)=>values.get(id)?.task};
}
