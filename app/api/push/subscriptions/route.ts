import { api,body,pushStore } from '@/lib/task-api';
export async function POST(request:Request){return api(request,async(_store,userId)=>pushStore().subscribe(userId,await body(request)));}
export async function DELETE(request:Request){return api(request,async(_store,userId)=>pushStore().unsubscribe(userId,await body(request)));}
