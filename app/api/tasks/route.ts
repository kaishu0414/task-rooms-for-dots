import { api,body } from '@/lib/task-api';
export async function POST(request:Request){return api(request,async(store,userId)=>({task:await store.create(await body(request),userId)}));}
