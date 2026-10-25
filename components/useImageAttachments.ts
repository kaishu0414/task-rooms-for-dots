"use client";
import {useEffect,useRef,useState} from 'react';
import {prepareImage} from '@/lib/prepare-image';
import {runUploadQueue} from '@/lib/upload-queue';
export type ImageAttachment={id:string;name:string;mimeType:string;size:number;width:number;height:number;url:string};
export type DraftImage={key:string;name:string;previewUrl?:string;blob?:Blob;attachment?:ImageAttachment;status:'preparing'|'ready'|'uploading'|'error';error?:string};
export function useImageAttachments(taskId:string|null){
 const inFlight=useRef(new Map<string,Promise<string[]>>());
 const pool=useRef<Record<string,Map<string,DraftImage>>>({});
 const drafts=useRef<Record<string,DraftImage[]>>({}),[,render]=useState(0),[error,setError]=useState('');const update=()=>render(n=>n+1);
 useEffect(()=>()=>{for(const list of Object.values(pool.current))for(const item of list.values())if(item.previewUrl)URL.revokeObjectURL(item.previewUrl);},[]);
 function keys(id=taskId){return id?(drafts.current[id]||[]).map(item=>item.key):[];}
 function selectFiles(files:FileList|File[]|null){if(!files||!taskId)return false;setError('');const id=taskId,current=drafts.current[id]||[];if(current.length+files.length>4){setError('画像は1回に4枚まで添付できます。');return false;}if(!files.length)return false;const selected=Array.from(files).map(file=>({file,item:{key:crypto.randomUUID(),name:file.name,status:'preparing'} as DraftImage}));const retained=pool.current[id]??=new Map();for(const {item}of selected)retained.set(item.key,item);drafts.current[id]=[...current,...selected.map(x=>x.item)];update();void(async()=>{for(const{file,item}of selected){try{const prepared=await prepareImage(file);if(pool.current[id]?.get(item.key)!==item){URL.revokeObjectURL(prepared.previewUrl);continue;}Object.assign(item,prepared,{status:'ready'});}catch(e){if(pool.current[id]?.get(item.key)!==item)continue;item.status='error';item.error=(e as Error).message;if(drafts.current[id]?.includes(item))setError(item.error);}update();}})();return true;}
 function restore(nextKeys:string[]){if(!taskId)return;const retained=pool.current[taskId];drafts.current[taskId]=nextKeys.flatMap(key=>retained?.get(key)?[retained.get(key)!]:[]);setError('');update();}
 function remove(key:string){restore(keys().filter(value=>value!==key));}
 function prune(keepKeys:string[],id=taskId){if(!id)return;const keep=new Set([...keepKeys,...keys(id)]);for(const[key,item]of pool.current[id]||[]){if(keep.has(key))continue;if(item.previewUrl)URL.revokeObjectURL(item.previewUrl);pool.current[id].delete(key);}}
 function uploadAll(id:string,draftMode=false):Promise<string[]>{
  const flightKey=`${draftMode?'drafts':'tasks'}:${id}`,existing=inFlight.current.get(flightKey);if(existing)return existing;
  const list=[...(drafts.current[id]||[])];
  const promise=(async()=>{
   for(const item of list)if(!item.attachment&&!item.blob)throw new Error(item.error||'画像の準備が終わるまでお待ちください。');
   await runUploadQueue(list.filter(item=>!item.attachment),async item=>{
    item.status='uploading';item.error=undefined;update();
    try{const response=await fetch(`/api/${draftMode?"drafts":"tasks"}/${encodeURIComponent(id)}/attachments`,{method:'POST',headers:{'Content-Type':item.blob!.type,'X-Upload-Id':item.key,'X-Image-Name':encodeURIComponent(item.name)},body:item.blob});const data=await response.json() as {attachment?:ImageAttachment;error?:string};if(!response.ok||!data.attachment)throw new Error(data.error||'画像のアップロードに失敗しました。再送信できます。');item.attachment=data.attachment;item.status='ready';}
    catch(e){item.status='error';item.error=(e as Error).message;throw e;}finally{update();}
   });
   return list.map(item=>item.attachment!.id);
  })().finally(()=>{inFlight.current.delete(flightKey);});
  inFlight.current.set(flightKey,promise);return promise;
 }
 function clear(id:string){for(const item of pool.current[id]?.values()||[])if(item.previewUrl)URL.revokeObjectURL(item.previewUrl);delete pool.current[id];drafts.current[id]=[];setError('');update();}
 return{items:taskId?drafts.current[taskId]||[]:[],error,selectFiles,remove,uploadAll,clear,keys,restore,prune};
}
