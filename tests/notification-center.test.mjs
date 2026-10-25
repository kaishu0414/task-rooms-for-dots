import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../components/NotificationCenter.tsx',import.meta.url),'utf8');
test('bell displays real unread replies and optional observed recent replies; never assumes last user message is assistant',()=>{
 assert(source.includes('tasks.filter(task=>task.unread>0)'));
 assert(source.includes('recent=[]'));
 assert(!source.includes('lastMessage'));
 assert(source.includes('onOpen(task.id)'));
 assert(source.includes('未読の返信はありません'));
 assert(!source.includes('fetch('));
 assert(!source.includes('markViewed'));
});
test('push preferences are behind gear; list supports outside click, Escape and disabled task opening',()=>{
 assert(source.includes('icon="settings"'));
 assert(source.includes("event.key==='Escape'"));
 assert(source.includes("document.addEventListener('pointerdown',outside)"));
 assert(source.includes('if(disabled)return'));
 assert(source.includes('aria-expanded={open}'));
 const push=readFileSync(new URL('../components/PushSettings.tsx',import.meta.url),'utf8');
 assert(push.includes('icon==="settings"?<Settings size={18}/>'));
 assert(push.includes('onClick={enable}'));
});
