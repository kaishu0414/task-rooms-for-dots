"use client";
export type Progress={completed:number;total:number;percent:number;current:string;remaining:string[];state:'active'|'blocked';updatedAt:string};
export default function TaskProgress({progress,compact=false}:{progress:Progress|null;compact?:boolean}){
 if(!progress)return <span className="progress-unknown" aria-label="進捗 未算定">{compact?"未算定":"進捗 未算定"}</span>;
 const p=progress;
 return <div className={`task-progress ${compact?'compact':''} ${p.state==='blocked'?'is-blocked':''}`}>
 <div className="progress-heading"><span title={p.current}>{p.state==='blocked'&&<b aria-label="中断中">Ⅱ </b>}{p.current}</span><strong>{p.percent}%</strong></div>
 <div className="progress-track" role="progressbar" aria-label="完了工程の割合" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${p.percent}%`}}/></div>
 {!compact&&<details className="progress-more"><summary>詳細</summary><p>{p.current}</p><div className="progress-meta"><span>{p.completed} / {p.total} 工程</span><time dateTime={p.updatedAt}>更新 {new Date(p.updatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>{p.remaining.length>0&&<details className="progress-remaining"><summary>残りの工程</summary><ul>{p.remaining.map((step,i)=><li key={i}>{step}</li>)}</ul></details>}</details>}
 </div>;
}
