/** Local navigation only. A generation binds responses to the exact room/page visit. */
export type ThreadVisit={taskId:string|null;cursor:string|null;generation:number};
/** A conversation-wide receipt is safe only when the complete history was loaded.
 * Unread counts and page rows are separate reads, so a count comparison is not
 * evidence that all unread messages were included in a partial page.
 */
export function canMarkThreadViewed({cursor,page,unread,hidden}:{cursor:string|null;page?:{isLatest:boolean;hasMore:boolean}|null;unread:number;hidden:boolean}){
 return cursor===null&&page?.isLatest===true&&page.hasMore===false&&!hidden&&Number.isSafeInteger(unread)&&unread>0;
}
/** Match the board's SQL substr(text,1,400) Unicode code-point preview. */
export function threadLastMessagePreview(text:string){
 let lastMessage='',count=0;for(const point of text){if(count++===400)break;lastMessage+=point;}
 return {lastMessage,lastMessageIsPreview:true,lastMessagePreviewLimit:400};
}
export function threadPageView(){
 let taskId:string|null=null,cursor:string|null=null,generation=0;
 const newer:(string|null)[]=[];
 const capture=():ThreadVisit=>({taskId,cursor,generation});
 return {
  capture,
  accepts:(visit:ThreadVisit)=>visit.taskId===taskId&&visit.cursor===cursor&&visit.generation===generation,
  canGoNewer:()=>newer.length>0,
  open(id:string|null){taskId=id;cursor=null;newer.length=0;generation++;return capture();},
  older(next:string){if(!taskId||!next||next===cursor)return capture();newer.push(cursor);cursor=next;generation++;return capture();},
  newer(){if(newer.length){cursor=newer.pop()!;generation++;}return capture();},
  latest(){cursor=null;newer.length=0;generation++;return capture();},
 };
}

export type ThreadAcknowledgement={visit:ThreadVisit;through:string};
/** Explicit owner acknowledgement, not evidence that omitted messages were viewed. */
export function captureThreadAcknowledgement(input:{visit:ThreadVisit;page?:{isLatest:boolean;hasMore:boolean}|null;unread:number;fetchedAt?:string}):ThreadAcknowledgement|null{
 const {visit,page,unread,fetchedAt}=input;
 if(!visit.taskId||visit.cursor!==null||page?.isLatest!==true||page.hasMore!==true||!Number.isSafeInteger(unread)||unread<=0||!fetchedAt||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fetchedAt)||!Number.isFinite(Date.parse(fetchedAt)))return null;
 return {visit:{...visit},through:fetchedAt};
}
/** Recheck the same room/page after the confirmation; never substitute a newer time. */
export async function acknowledgeThreadSnapshot<T>(snapshot:ThreadAcknowledgement|null,accepts:(visit:ThreadVisit)=>boolean,confirm:()=>boolean,write:(taskId:string,through:string)=>Promise<T>):Promise<T|null>{
 if(!snapshot||!snapshot.visit.taskId||!accepts(snapshot.visit)||!confirm()||!accepts(snapshot.visit))return null;
 return write(snapshot.visit.taskId,snapshot.through);
}
