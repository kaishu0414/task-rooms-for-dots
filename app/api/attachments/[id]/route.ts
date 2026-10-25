import {attachmentStore,api,response,runtimeOwner} from '@/lib/task-api';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {verifyOwner,ApiError} from '@/lib/task-contract';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const user=verifyOwner(await getChatGPTUser(),runtimeOwner()),{metadata,object}=await attachmentStore().read((await context.params).id,user.userId);return new Response(object.body,{headers:{'Content-Type':metadata.mimeType,'Content-Length':String(metadata.size),'Content-Disposition':`inline; filename="image"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(e){return response({error:e instanceof ApiError?e.message:'Image unavailable'},e instanceof ApiError?e.status:500);}}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){return api(request,async(_store,userId)=>attachmentStore().remove((await context.params).id,userId));}
