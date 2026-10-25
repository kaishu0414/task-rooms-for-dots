"use client";
import {activityView,activityForStatus,type Activity} from '@/lib/activity-view';
export default function TaskActivity({activity:reported,now,status,updatedAt}:{activity?:Activity|null;now:number;status:string;updatedAt:string}){
 const activity=activityForStatus(reported,status,updatedAt);
 const view=activityView(activity,now);
 const text=!activity?view.label:activity.state==='queued'?(status==='backlog'?'後回し':'dotの対応待ち'):view.stale?`更新待ち: ${view.current}`:view.current||view.label;
 return <div className={`task-activity ${view.active?'activity-active':''} ${view.stale?'activity-stale':''}`} title={`最終更新時点で報告された状況: ${view.label} ${view.current}`}><div className="activity-line"><span className="activity-state">{text}</span>{activity&&<time dateTime={activity.updatedAt} title={new Date(activity.updatedAt).toLocaleString('ja-JP')}>· {new Date(activity.updatedAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</time>}</div></div>;
}
