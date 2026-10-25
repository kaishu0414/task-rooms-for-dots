import { api,runtimeDisplayNames } from '@/lib/task-api';
export const dynamic='force-dynamic';
export async function GET(request:Request){return api(request,async store=>({tasks:await store.listTasks(),user:{name:runtimeDisplayNames().owner},assistant:{name:runtimeDisplayNames().assistant},connected:true,...await store.mode()}));}
