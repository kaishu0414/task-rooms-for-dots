import { api,body,pushStore } from '@/lib/task-api';
export async function POST(request:Request){return api(request,async(_store,userId)=>pushStore().status(userId,await body(request)));}
