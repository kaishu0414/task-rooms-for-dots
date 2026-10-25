import { ApiError, object, only, str } from './task-contract';

/** Explicit reported milestones only. Never inferred from elapsed time or task status. */
export type TaskProgress = {
 completed:number; total:number; current:string; remaining:string[];
 state:'active'|'blocked'; updatedAt:string; percent:number;
};
export function validateProgress(value:unknown,updatedAt=new Date().toISOString()):TaskProgress|null {
 if(value===null)return null;
 const p=object(value);only(p,['completed','total','current','remaining','state']);
 if(!Number.isInteger(p.total)||Number(p.total)<1||Number(p.total)>100)throw new ApiError(400,'progress.total must be an integer from 1 to 100');
 if(!Number.isInteger(p.completed)||Number(p.completed)<0||Number(p.completed)>Number(p.total))throw new ApiError(400,'progress.completed must be an integer from 0 to total');
 if(p.state!=='active'&&p.state!=='blocked')throw new ApiError(400,'progress.state must be active or blocked');
 if(!Array.isArray(p.remaining)||p.remaining.length>20)throw new ApiError(400,'progress.remaining must contain at most 20 steps');
 const remaining=p.remaining.map(step=>str(step,'remaining step',160));
 const completed=Number(p.completed),total=Number(p.total);
 if(completed<total&&!remaining.length)throw new ApiError(400,'Incomplete progress requires remaining steps');
 if(completed===total&&remaining.length)throw new ApiError(400,'Completed progress cannot contain remaining steps');
 return {completed,total,current:str(p.current,'progress.current',160),remaining,state:p.state,updatedAt,percent:Math.floor(completed*100/total)};
}
/** Missing/malformed old values stay unknown rather than fabricating a percentage. */
export function readProgress(value:unknown):TaskProgress|null {
 if(typeof value!=='string'||!value)return null;
 try{const raw=object(JSON.parse(value));const {updatedAt,percent:_ignored,...input}=raw;if(typeof updatedAt!=='string'||!Number.isFinite(Date.parse(updatedAt)))return null;return validateProgress(input,updatedAt);}catch{return null;}
}
export const progressInputSchema = {
 anyOf:[{type:'null'},{type:'object',properties:{
  completed:{type:'integer',minimum:0,maximum:100},total:{type:'integer',minimum:1,maximum:100},
  current:{type:'string',minLength:1,maxLength:160},remaining:{type:'array',maxItems:20,items:{type:'string',minLength:1,maxLength:160}},
  state:{enum:['active','blocked']},
 },required:['completed','total','current','remaining','state'],additionalProperties:false}],
 description:'Reported milestone progress, not live model telemetry. completed/total must reflect actual completed steps. List remaining work and the current step (or blocker). Percent is derived by the server; timestamps are server-owned. Use null if progress is unknown. 100% does not mark the task done or imply user approval.',
};
