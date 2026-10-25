import { env,waitUntil } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ApiError, validateOrigin, verifyOwner, ownerConfig, displayNames } from './task-contract';
import { AttachmentStore } from './attachment-store';
import { TaskStore } from './task-store';
import { PushStore,pushConfig } from './push-store';
import { McpEventStore,mcpEventsConfig } from './mcp-events';
export function runtimeDisplayNames(){return displayNames(env);}
export function runtimeOwner(){return ownerConfig(env);}
export function eventStore(){if(!env.DB)throw new ApiError(503,'Storage is not available');return new McpEventStore(env.DB,mcpEventsConfig(env));}
export function attachmentStore(){if(!env.DB||!env.BUCKET)throw new ApiError(503,'Image storage is not available');return new AttachmentStore(env.DB,env.BUCKET);}
export function pushStore(){if(!env.DB)throw new ApiError(503,'Storage is not available');return new PushStore(env.DB,pushConfig(env));}
export function taskStore(){if(!env.DB)throw new ApiError(503,'Storage is not available');return new TaskStore(env.DB,message=>pushStore().deliver(message),async message=>{waitUntil(eventStore().deliver(message).catch(()=>{}));});}
export async function body(request:Request,maxBytes=200000){if(Number(request.headers.get('content-length')||0)>maxBytes)throw new ApiError(413,'Request too large');const reader=request.body?.getReader();let total=0;const chunks:Uint8Array[]=[];if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new ApiError(413,'Request too large');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ApiError(400,'Invalid JSON');}}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function api(request:Request,run:(store:TaskStore,userId:string)=>Promise<unknown>){try{const user=verifyOwner(await getChatGPTUser(),runtimeOwner());if(request.method!=='GET')validateOrigin(request);return response(await run(taskStore(),user.userId));}catch(error){const status=error instanceof ApiError?error.status:500;return response({error:status===500?'Unexpected server error':(error as Error).message,...(status===401?{signInUrl:'/signin-with-chatgpt?return_to=%2F'}:{})},status);}}
