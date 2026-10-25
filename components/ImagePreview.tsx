"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Loader2,Maximize2,X,ZoomIn} from 'lucide-react';
import styles from './ImagePreview.module.css';

/** Only caller-owned local previews and this app's authenticated image route. */
export function previewSource(src:string,origin:string):string|null{
 if(!src||src.length>2048)return null;
 try{const url=new URL(src,origin);if(url.origin!==origin||url.username||url.password||url.search||url.hash)return null;
 if(url.protocol==='blob:')return src;
 if((url.protocol==='https:'||url.protocol==='http:')&&/^\/api\/attachments\/[A-Za-z0-9_-]+$/.test(url.pathname))return url.href;
 }catch{/* Invalid sources are never requested. */}return null;
}

type PreviewImage={src:string;name:string};
export default function ImagePreview({image,onClose}:{image:PreviewImage|null;onClose:()=>void}){
 const dialog=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null),viewport=useRef<HTMLDivElement>(null),close=useRef(onClose);
 close.current=onClose;
 const titleId=useId();
 const [zoomed,setZoomed]=useState(false),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[natural,setNatural]=useState({width:0,height:0});
 const source=image&&typeof window!=='undefined'?previewSource(image.src,window.location.origin):null;
 useEffect(()=>{
  if(!image)return;
  setZoomed(false);setLoading(true);setFailed(false);setNatural({width:0,height:0});
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const oldBodyOverflow=document.body.style.overflow,oldRootOverflow=document.documentElement.style.overflow;
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
  // Inert the application, including independently scrolling chat/list regions.
  const portal=dialog.current?.parentElement;
  const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==portal);
  const oldInert=siblings.map(node=>({node,inert:node.inert}));oldInert.forEach(({node})=>{node.inert=true;});
  closeButton.current?.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close.current();return;}
   if(event.key!=='Tab')return;
   const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')||[]);
   const first=elements[0],last=elements[elements.length-1];if(!first)return;
   if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=oldBodyOverflow;document.documentElement.style.overflow=oldRootOverflow;oldInert.forEach(({node,inert})=>{node.inert=inert;});if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[image?.src]);
 useEffect(()=>{if(!zoomed){viewport.current?.scrollTo({top:0,left:0});}},[zoomed]);
 if(!image||typeof document==='undefined')return null;
 return createPortal(<div className={styles.backdrop} onClick={event=>{if(event.target===event.currentTarget)close.current();}}>
  <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
   <header className={styles.header}><h2 id={titleId}>{image.name||'画像プレビュー'}</h2><div className={styles.controls}>
    <button type="button" aria-label={zoomed?'画像を全体表示':'画像を拡大'} title={zoomed?'全体表示':'拡大'} disabled={loading||failed||!source} onClick={()=>setZoomed(value=>!value)}>{zoomed?<Maximize2 size={21}/>:<ZoomIn size={21}/>}</button>
    <button ref={closeButton} type="button" aria-label="画像プレビューを閉じる" onClick={()=>close.current()}><X size={24}/></button>
   </div></header>
   <div ref={viewport} className={`${styles.viewport} ${zoomed?styles.zoomed:''}`} tabIndex={0} aria-label="画像表示領域" onClick={event=>{if(event.target===event.currentTarget)close.current();}}>
    {loading&&source&&!failed&&<div className={styles.status} role="status"><Loader2 size={25} className={styles.spinner}/><span>画像を読み込み中</span></div>}
    {(!source||failed)&&<p className={styles.status} role="alert">画像を表示できませんでした</p>}
    {source&&!failed&&<button type="button" className={styles.imageButton} aria-label={zoomed?'画像を全体表示':'画像を拡大'} onClick={()=>setZoomed(value=>!value)} style={zoomed?{width:Math.max(natural.width,600),height:'auto'}:undefined} disabled={loading}>
     <img key={source} src={source} alt={image.name||'添付画像'} draggable={false} className={styles.image} style={loading?{visibility:'hidden'}:undefined} onLoad={event=>{setNatural({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});setLoading(false);}} onError={()=>{setFailed(true);setLoading(false);}}/>
    </button>}
   </div>
  </div>
 </div>,document.body);
}
