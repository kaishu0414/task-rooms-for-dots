export type Activity={current:string;state:'active'|'waiting'|'queued'|'done';updatedAt:string};
export const ACTIVE_FRESH_MS=5*60*1000;
export function activityView(activity:Activity|null|undefined,now=Date.now()){
 if(!activity)return{label:'状況未更新',current:'',active:false,stale:false};
 const age=now-Date.parse(activity.updatedAt),fresh=Number.isFinite(age)&&age>=0&&age<ACTIVE_FRESH_MS;
 const stale=activity.state==='active'&&!fresh;
 return{label:stale?'更新待ち':({active:'作業中',waiting:'確認待ち',queued:'対応待ち',done:'完了'}[activity.state]),current:activity.current,active:activity.state==='active'&&fresh,stale};
}
/** Old rows can predate atomic status/activity updates. Status wins over contradictory labels. */
export function activityForStatus(activity:Activity|null|undefined,status:string,updatedAt:string):Activity|null|undefined{
 const fallback=(state:Activity['state'],current:string):Activity=>({state,current,updatedAt});
 if(status==='waiting'&&activity?.state!=='waiting')return fallback('waiting','あなたの確認待ち');
 if(status==='done'&&activity?.state!=='done')return fallback('done','完了');
 if(status==='backlog'&&activity&&activity.state!=='queued')return fallback('queued','後回し');
 if(status==='working'&&activity?.state==='done')return fallback('queued','dotの対応待ち');
 return activity;
}
