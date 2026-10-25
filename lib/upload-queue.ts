/** At most two image requests in flight. Failure drains active work before rejecting. */
export async function runUploadQueue<T,R>(items:readonly T[],upload:(item:T,index:number)=>Promise<R>,concurrency=2):Promise<R[]> {
 const results=new Array<R>(items.length),errors:{index:number;error:unknown}[]=[];
 let cursor=0,failed=false;
 const worker=async()=>{while(!failed&&cursor<items.length){const index=cursor++;try{results[index]=await upload(items[index],index);}catch(error){failed=true;errors.push({index,error});}}};
 await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,Math.min(2,Math.floor(concurrency)||1)))},worker));
 if(errors.length)throw errors.sort((a,b)=>a.index-b.index)[0].error;
 return results;
}
