import { env } from 'cloudflare:workers';
import { api } from '@/lib/task-api';
import { pushConfig,MAX_PUSH_DEVICES } from '@/lib/push-store';
export const dynamic='force-dynamic';
export async function GET(request:Request){return api(request,async()=>{const config=pushConfig(env);return {configured:!!config,publicKey:config?.publicKey??null,maxDevices:MAX_PUSH_DEVICES};});}
