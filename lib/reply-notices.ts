export type UnreadTask = {id:string;unread:number;updatedAt:string;title:string};
export function newUnreadTasks<T extends UnreadTask>(previous:T[]|null,next:T[],selectedId:string|null):T[]{
 if(!previous)return [];
 const before=new Map(previous.map(t=>[t.id,t.unread]));
 return next.filter(t=>t.id!==selectedId&&t.unread>0&&t.unread>(before.get(t.id)??0));
}
export function newAssistantMessages<T extends{id:string;role:string}>(previous:T[]|undefined,next:T[],initial:boolean):T[]{
 if(initial||!previous)return [];
 const seen=new Set(previous.map(m=>m.id));
 return next.filter(m=>m.role==='assistant'&&!seen.has(m.id));
}
