import {ApiError} from '@/lib/task-contract';
import { api,body } from '@/lib/task-api';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return api(request,async store=>{const params=new URL(request.url).searchParams;if(params.getAll('before').length>1)throw new ApiError(400,'Repeated thread cursor');return store.thread((await context.params).id,Object.fromEntries(params));});}
export async function PATCH(request:Request,context:Context){return api(request,async store=>({task:await store.update((await context.params).id,await body(request),true)}));}
