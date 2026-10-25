/** A hold opens controls only; it never selects or sends a reaction. */
export function longPress(open:()=>void,schedule=(fn:()=>void)=>setTimeout(fn,500),unschedule=(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)){
 let start:{x:number;y:number}|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 const cancel=()=>{if(timer!==null)unschedule(timer);timer=null;start=null;};
 return{start(x:number,y:number){cancel();start={x,y};timer=schedule(()=>{timer=null;start=null;open();});},move(x:number,y:number){if(start&&Math.hypot(x-start.x,y-start.y)>10)cancel();},cancel};
}
