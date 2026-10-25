import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
const activityCode=ts.transpileModule(readFileSync(new URL('../lib/activity-view.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const activityUrl='data:text/javascript;base64,'+Buffer.from(activityCode).toString('base64');
const code=ts.transpileModule(readFileSync(new URL('../lib/board-view.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const{frogMode,boardGroup,openingMessageId,messageStartScroll}=await import('data:text/javascript;base64,'+Buffer.from(code.replace('"./activity-view"',JSON.stringify(activityUrl))).toString('base64'));
test('recurring category stays independent for active tasks; done is archived',()=>{for(const status of['working','waiting','backlog','done']){const t={category:'定期',status};assert.equal(boardGroup(t),status==='done'?'done':'recurring');assert.equal(t.status,status);assert.equal(boardGroup({category:'その他',status}),status);}assert.equal(boardGroup({category:' 定期 ',status:'backlog'}),'recurring');});
test('all groups partition tasks exactly once; recurring never counts in backlog',()=>{const tasks=[{category:'定期',status:'backlog'},{category:'定期',status:'waiting'},{category:'作業',status:'backlog'}];assert.equal(tasks.filter(t=>boardGroup(t)==='backlog').length,1);assert.equal(tasks.filter(t=>boardGroup(t)==='recurring').length,2);assert.equal(['working','waiting','backlog','done','recurring'].reduce((n,key)=>n+tasks.filter(t=>boardGroup(t)===key).length,0),tasks.length);});
test('opening anchors newest assistant message, not a later user reply; fallback is last message or empty top',()=>{assert.equal(openingMessageId([{id:'a',role:'assistant'},{id:'b',role:'assistant'},{id:'c',role:'user'}]),'b');assert.equal(openingMessageId([{id:'x',role:'user'}]),'x');assert.equal(openingMessageId([]),null);});
test('message start is positioned 12px inside scroll container regardless of previous scroll; long reply end is irrelevant',()=>{assert.equal(messageStartScroll(100,900,400),1188);assert.equal(messageStartScroll(100,0,100),0);});
test('opening scroll is one-shot per explicit open; polling never resets it or scrolls to bottom',()=>{const source=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');assert(source.includes('openingScrollTask.current=task.id'));assert(source.includes('openingScrollTask.current!==selected.id'));assert(source.includes('openingScrollTask.current=null'));assert(!source.includes('scrollIntoView'));assert(!source.includes('bottomRef'));const load=source.slice(source.indexOf('const loadThread='),source.indexOf('async function refreshView'));assert(!load.includes('openingScrollTask.current='));assert(source.includes('data-message-id={m.id}'));});

test('dot assignment without active unfinished progress shows idle, not work animation',()=>{
 const task={category:'相談',status:'working'};
 assert.equal(frogMode(task),'idle');assert.equal(frogMode({...task,progress:null}),'idle');
 assert.equal(frogMode({...task,progress:{state:'blocked',completed:1,total:3}}),'idle');
 assert.equal(frogMode({...task,progress:{state:'active',completed:3,total:3}}),'idle');
 assert.equal(frogMode({...task,progress:{state:'active',completed:1,total:3}}),'idle');
 assert.equal(frogMode({...task,activity:{current:'review',state:'active',updatedAt:new Date().toISOString()}}),'working');
 assert.equal(frogMode({...task,category:'定期'}),'recurring');
});
