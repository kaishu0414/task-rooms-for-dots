/** Deterministic, local title for a newly created room only; no external AI. */
export function titleFromMessage(message:string):string{
 const line=message.split(/\r?\n/).map(text=>text.replace(/[\u0000-\u001f\u007f]/g,'').trim()).find(Boolean)||'';
 const plain=line.replace(/^\s*(?:#{1,6}|[-*>•]+|\d+[.)])\s*/,'').replace(/\s+/g,' ').trim();
 const chars=Array.from(plain);return chars.length?chars.slice(0,36).join('')+(chars.length>36?'…':''):'新しい作業部屋';
}
