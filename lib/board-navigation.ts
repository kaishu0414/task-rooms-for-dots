export function swipeStep(start:{x:number;y:number;time:number},end:{x:number;y:number;time:number}):number{
 const dx=end.x-start.x,dy=end.y-start.y;
 if(end.time-start.time>900||Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.5)return 0;
 return dx<0?1:-1;
}
export function adjacentFilter<T extends string>(filters:readonly T[],current:T,step:number):T{
 const index=Math.max(0,filters.indexOf(current));return filters[Math.max(0,Math.min(filters.length-1,index+step))];
}
