export type BadgeNavigator={setAppBadge?:(count:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
/** True unread assistant-message count; no permission prompt or fabricated dot. */
export async function syncAppBadge(count:number,target:BadgeNavigator){
 if(!Number.isSafeInteger(count)||count<0)return;
 try{if(count===0&&target.clearAppBadge)await target.clearAppBadge();else if(target.setAppBadge)await target.setAppBadge(count);}catch{/* Optional OS capability must not disrupt private chat. */}
}
export function unreadCount(tasks:{unread:number}[]){return tasks.reduce((sum,task)=>sum+(Number.isSafeInteger(task.unread)&&task.unread>0?task.unread:0),0);}
