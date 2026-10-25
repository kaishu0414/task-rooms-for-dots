import { api,body } from '@/lib/task-api';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return api(request,async(store,userId)=>({message:await store.post((await context.params).id,await body(request),userId)}));}
