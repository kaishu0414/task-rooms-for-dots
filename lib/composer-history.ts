/** Local draft history only. No server messages or browser-global editing state. */
export type DraftSnapshot = {text:string;keys:string[];start:number;end:number};
export type DraftEdit = {kind:'text'|'images';inputType?:string;time?:number;composition?:string|number};

const copy = (value:DraftSnapshot):DraftSnapshot => ({...value,keys:[...value.keys]});
const sameKeys = (a:string[],b:string[]) => a.length===b.length&&a.every((key,index)=>key===b[index]);
const sameContent = (a:DraftSnapshot,b:DraftSnapshot) => a.text===b.text&&sameKeys(a.keys,b.keys);

function contiguous(before:DraftSnapshot,after:DraftSnapshot,inputType:string|undefined){
 if(before.start!==before.end||after.start!==after.end)return false;
 if(inputType==='insertText'){
  const size=after.text.length-before.text.length;
  return size>0&&after.start===before.start+size&&after.text.slice(0,before.start)===before.text.slice(0,before.start)&&after.text.slice(after.start)===before.text.slice(before.end);
 }
 if(inputType==='deleteContentBackward'){
  const size=before.text.length-after.text.length;
  return size>0&&after.start===before.start-size&&after.text.slice(0,after.start)===before.text.slice(0,after.start)&&after.text.slice(after.start)===before.text.slice(before.end);
 }
 return false;
}

export function createComposerHistory(initial:DraftSnapshot,limit=100){
 const capacity=Math.max(2,Math.floor(limit)||100);
 let states:DraftSnapshot[]=[copy(initial)],index=0;
 let last:(DraftEdit&{time:number})|null=null;
 function current(){return copy(states[index]);}
 function select(start:number,end:number){
  const state=states[index];
  if(state.start!==start||state.end!==end){states[index]={...state,start,end};last=null;}
 }
 function record(next:DraftSnapshot,options:DraftEdit){
  const before=states[index],time=options.time??Date.now();
  if(sameContent(before,next)){select(next.start,next.end);return;}
  const composition=options.composition!==undefined&&last?.composition===options.composition;
  const typing=last!==null&&options.composition===undefined&&last.composition===undefined&&last.inputType===options.inputType&&time>=last.time&&time-last.time<=750&&contiguous(before,next,options.inputType);
  const merge=index===states.length-1&&index>0&&last?.kind==='text'&&options.kind==='text'&&sameKeys(before.keys,next.keys)&&(composition||typing);
  states=states.slice(0,index+1);
  if(merge)states[index]=copy(next);
  else{states.push(copy(next));index++;}
  // Keep the starting draft and the most recent edits, rather than retaining unbounded images.
  if(states.length>capacity){states.splice(1,states.length-capacity);index=states.length-1;}
  last={...options,time};
 }
 function undo(){last=null;if(index===0)return null;return copy(states[--index]);}
 function redo(){last=null;if(index===states.length-1)return null;return copy(states[++index]);}
 function reset(snapshot:DraftSnapshot){states=[copy(snapshot)];index=0;last=null;}
 function retainedKeys(){return [...new Set(states.flatMap(state=>state.keys))];}
 return{record,undo,redo,reset,select,current,retainedKeys,hasUndo:()=>index>0,hasRedo:()=>index<states.length-1};
}
