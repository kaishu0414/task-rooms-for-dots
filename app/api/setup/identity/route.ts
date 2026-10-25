import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {verifySetupOwner,ApiError} from '@/lib/task-contract';
export const dynamic='force-dynamic';
/** No storage access. Only the configured, signed-in owner can bootstrap their ID. */
export async function GET(){
 try{const owner=verifySetupOwner(await getChatGPTUser(),env);return Response.json({siteUserId:owner.userId},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 catch(error){return Response.json({error:error instanceof ApiError?error.message:'Identity unavailable'},{status:error instanceof ApiError?error.status:500,headers:{'Cache-Control':'private, no-store'}});}
}
