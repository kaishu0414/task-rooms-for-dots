import {api,attachmentStore} from '@/lib/task-api';
import {ApiError} from '@/lib/task-contract';
import {readImageBody} from '@/lib/image-upload';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return api(request,async(_store,userId)=>{let name:string;try{name=decodeURIComponent(request.headers.get('x-image-name')||'image');}catch{throw new ApiError(400,'Invalid filename');}return{attachment:await attachmentStore().stage((await context.params).id,userId,request.headers.get('x-upload-id')||'',name,request.headers.get('content-type')||'',await readImageBody(request))};});}
