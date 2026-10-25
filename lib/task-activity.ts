import {ApiError,object,only,str} from './task-contract';
export type TaskActivity={current:string;state:'active'|'waiting'|'queued'|'done';updatedAt:string};
/** Reported activity, never inferred execution telemetry or automatic approval. */
export function validateActivity(value:unknown,updatedAt=new Date().toISOString()):TaskActivity|null{
 if(value===null)return null;const a=object(value);only(a,['current','state']);
 if(!['active','waiting','queued','done'].includes(String(a.state)))throw new ApiError(400,'activity.state must be active, waiting, queued or done');
 return{current:str(a.current,'activity.current',160),state:a.state as TaskActivity['state'],updatedAt};
}
export function readActivity(value:unknown):TaskActivity|null{if(typeof value!=='string'||!value)return null;try{const {updatedAt,...input}=object(JSON.parse(value));if(typeof updatedAt!=='string'||!Number.isFinite(Date.parse(updatedAt)))return null;return validateActivity(input,updatedAt);}catch{return null;}}
export function queuedActivity(updatedAt:string){return JSON.stringify({current:'返信待ち',state:'queued',updatedAt});}
export const activityInputSchema={anyOf:[{type:'null'},{type:'object',properties:{current:{type:'string',minLength:1,maxLength:160},state:{enum:['active','waiting','queued','done']}},required:['current','state'],additionalProperties:false}],description:'Explicitly reported current activity independent of milestone percentages. active only when actually working now, waiting for input or dependency, queued before work begins, done after this activity ends. Server assigns updatedAt; stale active reports are not live telemetry. Does not mark the task done, approve actions or change authorization. Use null if unknown.'};
