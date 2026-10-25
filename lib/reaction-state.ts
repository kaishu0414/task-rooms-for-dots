export type Emoji='👍'|'❤️'|null;
export type ReactionView={emoji:Emoji;pending:boolean;error:boolean};
/** Optimistic UI only. Requests remain serialized, explicit desired-state writes. */
export function reactionState(initial:Emoji,save:(emoji:Emoji)=>Promise<Emoji>,render:(view:ReactionView)=>void,now=()=>Date.now()){
 let confirmed=initial,desired=initial,running=false,failed=false,retryValue:Emoji=null,version=0,barrier=0,alive=true;
 const emit=()=>{if(alive)render({emoji:desired,pending:running,error:failed});};
 const drain=async()=>{if(running)return;running=true;emit();while(alive){const sent=desired,sentVersion=version;try{confirmed=await save(sent);barrier=now();if(version===sentVersion||desired===confirmed){desired=confirmed;running=false;emit();return;}}catch{retryValue=desired;desired=confirmed;failed=true;running=false;barrier=now();emit();return;}}running=false;};
 return {choose(emoji:Emoji){desired=emoji;version++;failed=false;emit();void drain();},retry(){if(failed)this.choose(retryValue);},poll(emoji:Emoji,startedAt:number){if(running||startedAt<=barrier)return;confirmed=emoji;desired=emoji;emit();},dispose(){alive=false;}};
}
