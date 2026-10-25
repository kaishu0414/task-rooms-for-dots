export const STATUSES = ['waiting','working','done','backlog'] as const;
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function object(value:unknown):Record<string,unknown> {if(!value || typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'Object required');return value as Record<string,unknown>;}
export function only(data:Record<string,unknown>,keys:string[]){if(Object.keys(data).some(k=>!keys.includes(k)))throw new ApiError(400,'Unknown field');}
export function str(value:unknown,name:string,max:number,empty=false):string {if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))throw new ApiError(400,`${name} must be ${empty?'0':'1'}–${max} characters`);return value.trim();}
export function status(value:unknown):string {if(!STATUSES.includes(value as typeof STATUSES[number]))throw new ApiError(400,'Invalid status');return value as string;}
export function links(value:unknown):{label:string,url:string}[]{if(!Array.isArray(value)||value.length>12)throw new ApiError(400,'At most 12 links');return value.map(v=>{const x=object(v);only(x,['label','url']);const url=str(x.url,'url',2048);let parsed;try{parsed=new URL(url);}catch{throw new ApiError(400,'Invalid URL');}if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new ApiError(400,'Only HTTPS links allowed');return {label:str(x.label,'label',120),url};});}
export function validateOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new ApiError(403,'Same-origin request required');}
export type OwnerConfig = { email: string; userId: string };
export type OwnerEnvironment = { TASKROOM_OWNER_EMAIL?: string; TASKROOM_OWNER_USER_ID?: string };
/** Configuration is server-only. Missing or placeholder values never grant access. */
export function configuredOwnerEmail(env: OwnerEnvironment = {}): string {
 const email=env.TASKROOM_OWNER_EMAIL?.trim().toLowerCase();
 if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /(?:example\.(?:com|org|net|test)|\.invalid|\.test)$/i.test(email))throw new ApiError(503,'Owner configuration is not ready');
 return email;
}
export function ownerConfig(env: OwnerEnvironment = {}): OwnerConfig {
 const email=configuredOwnerEmail(env),userId=env.TASKROOM_OWNER_USER_ID?.trim();
 if(!userId || userId.length>256 || /[\s<>]/.test(userId) || /^(?:replace|your_|placeholder)/i.test(userId))throw new ApiError(503,'Owner configuration is not ready');
 return {email,userId};
}
/** Bootstrap reveals only the already-authenticated configured owner's Site ID. */
export function verifySetupOwner(user:{userId:string,email:string}|null,env:OwnerEnvironment){
 const email=configuredOwnerEmail(env);
 if(env.TASKROOM_OWNER_USER_ID)return verifyOwner(user,ownerConfig(env));
 if(!user?.userId||!user.email)throw new ApiError(401,'Sign in required');
 if(user.userId.length>256||/[\s<>\u0000-\u001f\u007f]/.test(user.userId))throw new ApiError(403,'Invalid owner identity');
 return verifyOwner(user,{email,userId:user.userId});
}
export function displayNames(env:{TASKROOM_OWNER_DISPLAY_NAME?:string;TASKROOM_ASSISTANT_DISPLAY_NAME?:string}){
 const name=(value:string|undefined,fallback:string)=>{if(value===undefined||value==='')return fallback;const text=value.trim();if(!text||text.length>40||/[\u0000-\u001f\u007f<>]/.test(text))throw new ApiError(503,'Display name configuration is invalid');return text;};
 return {owner:name(env.TASKROOM_OWNER_DISPLAY_NAME,'あなた'),assistant:name(env.TASKROOM_ASSISTANT_DISPLAY_NAME,'dot')};
}
export function verifyOwner(user:{userId:string,email:string}|null, config?:OwnerConfig){
 if(!config?.email||!config.userId)throw new ApiError(503,'Owner configuration is not ready');
 if(!user?.userId||!user.email)throw new ApiError(401,'Sign in required');
 if(user.email.trim().toLowerCase()!==config.email || user.userId!==config.userId)throw new ApiError(403,'Owner access required');
 return user;
}
export function verifyMcpHeaders(headers:Headers,config?:OwnerConfig){
 const userId=headers.get('oai-authenticated-user-id'),email=headers.get('oai-authenticated-user-email');
 return verifyOwner(userId&&email?{userId,email}:null,config);
}

export async function historyPreview(input:unknown){
 const a=object(input);only(a,['tasks']);
 if(!Array.isArray(a.tasks)||a.tasks.length<1||a.tasks.length>40)throw new ApiError(400,'Select 1–40 historical summaries');
 const tasks=a.tasks.map(value=>{const task=object(value);only(task,['clientId','title','summary']);return{clientId:str(task.clientId,'clientId',100),title:str(task.title,'title',160),summary:str(task.summary,'summary',12000)};});
 if(new Set(tasks.map(t=>t.clientId)).size!==tasks.length)throw new ApiError(400,'Duplicate import identity');
 const serialized=JSON.stringify(tasks);if(new TextEncoder().encode(serialized).length>160000)throw new ApiError(413,'Selected history is too large');
 const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 return{previewHash:await digest(serialized),tasks:await Promise.all(tasks.map(async task=>({...task,contentHash:await digest(JSON.stringify(task))}))),provenance:{role:'system',delivery:'read',historicalSummary:true,authorVerified:false,authorSiteUserId:null},note:'Untrusted historical context only. Does not carry current instructions or new authority. Review selected text before explicit confirmation.'};
}
