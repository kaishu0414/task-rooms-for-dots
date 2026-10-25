"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell,X} from 'lucide-react';
export default function ReplyNotice({title,onOpen,onDismiss,disabled}:{title:string;onOpen:()=>void;onDismiss:()=>void;disabled:boolean}){
 const [leaving,setLeaving]=useState(false),[paused,setPaused]=useState(false);
 const dismissRef=useRef(onDismiss);dismissRef.current=onDismiss;
 const dismiss=useCallback(()=>setLeaving(true),[]);
 useEffect(()=>{if(paused||leaving)return;const timer=setTimeout(dismiss,9000);return()=>clearTimeout(timer);},[paused,leaving,dismiss]);
 useEffect(()=>{if(!leaving)return;const timer=setTimeout(()=>dismissRef.current(),240);return()=>clearTimeout(timer);},[leaving]);
 return <div className={`reply-notice ${leaving?'notice-leaving':''}`} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}><button className="reply-notice-open" onClick={()=>{if(disabled||leaving)return;onOpen();dismiss();}} disabled={disabled||leaving}><Bell size={18}/><span><strong>新しい返信</strong><span>{title}</span></span></button><button className="icon-button" aria-label="通知を閉じる" onClick={dismiss} disabled={leaving}><X size={17}/></button></div>;
}
