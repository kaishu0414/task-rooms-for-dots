import {activityView,type Activity} from "./activity-view";
export type BoardGroup = 'working' | 'waiting' | 'backlog' | 'done' | 'recurring';
/** Recurrence is a category, not a workflow mutation. Keep persisted status intact. */
export function boardGroup(task: {category: string;status: Exclude<BoardGroup,'recurring'>}): BoardGroup {
  return task.status === 'done' ? 'done' : task.category.trim() === '定期' ? 'recurring' : task.status;
}
export function openingMessageId(messages: {id:string;role:string}[]): string | null {
  for(let i=messages.length-1;i>=0;i--) if(messages[i].role==='assistant') return messages[i].id;
  return messages.at(-1)?.id ?? null;
}
export function messageStartScroll(containerTop:number,scrollTop:number,messageTop:number):number {
  return Math.max(0,scrollTop+messageTop-containerTop-12);
}

/** Assignment alone is not evidence that execution has started. */
export function frogMode(task: {category:string;status:Exclude<BoardGroup,'recurring'>;progress?:{state:string;completed:number;total:number}|null;activity?:Activity|null},now=Date.now()): BoardGroup|'idle' {
 const group=boardGroup(task);
 return group==='working' && !activityView(task.activity,now).active ? 'idle' : group;
}
