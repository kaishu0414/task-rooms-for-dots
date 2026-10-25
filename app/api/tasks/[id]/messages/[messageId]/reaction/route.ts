import { api,body } from '@/lib/task-api';
export async function POST(request:Request,context:{params:Promise<{id:string;messageId:string}>}){return api(request,async(store,userId)=>{const {id,messageId}=await context.params;return store.setReaction(id,messageId,await body(request),userId);});}
