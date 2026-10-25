"use client";
import {useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Bell,ChevronRight,X} from "lucide-react";
import PushSettings from "./PushSettings";
import styles from "./NotificationCenter.module.css";

export type NotificationTask={id:string;title:string;unread:number;updatedAt:string};
export default function NotificationCenter({tasks,recent=[],onOpen,disabled=false}:{tasks:NotificationTask[];recent?:NotificationTask[];onOpen:(id:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:60,left:12});
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 const unread=tasks.filter(task=>task.unread>0).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const count=unread.reduce((n,task)=>n+task.unread,0);
 // Only actually observed assistant-reply notices may populate this optional list.
 const seen=new Set(unread.map(task=>task.id));
 const latest=recent.filter(task=>{if(seen.has(task.id))return false;seen.add(task.id);return true;}).slice(0,10);
 useEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=trigger.current?.getBoundingClientRect();if(rect)setPosition({top:Math.min(rect.bottom+8,window.innerHeight-180),left:Math.max(8,Math.min(rect.left,window.innerWidth-352))});};
  place();panel.current?.focus();
  const outside=(event:PointerEvent)=>{const target=event.target as Element;if(panel.current?.contains(target)||trigger.current?.contains(target)||target.closest('.push-settings-backdrop'))return;setOpen(false);};
  const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.querySelector('.push-settings-backdrop')){event.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard);window.addEventListener('resize',place);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);window.removeEventListener('resize',place);};
 },[open]);
 function choose(task:NotificationTask){if(disabled)return;setOpen(false);onOpen(task.id);}
 const row=(task:NotificationTask,isUnread:boolean)=><button type="button" className={styles.item} key={task.id} onClick={()=>choose(task)} disabled={disabled}><span className={`${styles.dot} ${isUnread?styles.unread:''}`} aria-hidden="true"/><span className={styles.copy}><strong>{task.title}</strong><span>{isUnread?`未読の返信 ${task.unread}件`:'新しい返信'}</span></span><ChevronRight size={17}/></button>;
 return <><button type="button" ref={trigger} className={styles.trigger} aria-label={count?`通知・未読${count}件`:'通知'} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="dialog" title="通知" onClick={()=>setOpen(value=>!value)}><Bell size={19}/>{count>0&&<span className={styles.badge}>{count>99?'99+':count}</span>}</button>{open&&createPortal(<div id={id} ref={panel} className={styles.panel} style={position} role="dialog" aria-label="通知一覧" tabIndex={-1}><div className={styles.heading}><h2>通知</h2><div className={styles.actions}><PushSettings unread={0} icon="settings"/><button type="button" className="icon-button" aria-label="通知一覧を閉じる" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={19}/></button></div></div><div className={styles.list}>{unread.map(task=>row(task,true))}{latest.length>0&&<><h3>最近の返信</h3>{latest.map(task=>row(task,false))}</>}{unread.length===0&&latest.length===0&&<p className={styles.empty}>未読の返信はありません</p>}</div></div>,document.body)}</>;
}
