import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'thread-pages-'));
const names=['task-activity','task-progress','task-contract','image-upload','attachment-store','task-store','thread-page-view'];
for(const name of names){let source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');for(const dep of names)source=source.replaceAll("'./"+dep+"'","'./"+dep+".mjs'");writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
const {TaskStore,THREAD_PAGE_LIMIT,THREAD_MESSAGE_BYTE_BUDGET}=await import(join(dir,'task-store.mjs'));
const {threadPageView,canMarkThreadViewed,threadLastMessagePreview,captureThreadAcknowledgement,acknowledgeThreadSnapshot}=await import(join(dir,'thread-page-view.mjs'));
const timestamp='2026-01-01T00:00:00.000Z';
function setup(count=0,{text='Synthetic historical text',attachments='[]'}={}){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO tasks(id,client_id,title,updated_at) VALUES(?,?,?,?)').run('task','task','Synthetic task',timestamp);
 sql.prepare('INSERT INTO tasks(id,client_id,title,updated_at) VALUES(?,?,?,?)').run('other','other','Other synthetic task',timestamp);
 const put=sql.prepare("INSERT INTO messages(id,task_id,client_id,role,text,created_at,delivery,author_verified,historical_summary,attachment_json) VALUES(?,?,?,'system',?,?,'read',0,1,?)");
 function add(index,task='task',when=timestamp){put.run(`message-${index}`,task,`client-${index}`,text,when,attachments);}
 for(let i=0;i<count;i++)add(i);
 let writes=0;const queries=[];const db={prepare(query){let args=[];queries.push(query);return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){writes++;return sql.prepare(query).run(...args)}}},async batch(){throw Error('GET must not batch')}};
 return {sql,store:new TaskStore(db),add,queries,writes:()=>writes};
}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const parseCursor=value=>JSON.parse(Buffer.from(value,'base64url').toString());
const cursor=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('default thread page is latest100, chronological, explicit partial metadata, and no writes',async()=>{
 const s=setup(205),page=await s.store.thread('task');assert.equal(page.messages.length,100);assert.equal(page.messages[0].id,'message-105');assert.equal(page.messages.at(-1).id,'message-204');assert.equal(page.page.limit,THREAD_PAGE_LIMIT);assert.equal(page.page.hasMore,true);assert.equal(page.page.isLatest,true);assert.equal(page.page.messageBytes,bytes(page.messages));assert.match(page.page.note,/not the complete history/);assert(s.queries.some(q=>q.endsWith('DESC LIMIT ?')));assert.equal(s.writes(),0);
 for(const message of page.messages){assert.equal(message.historicalSummary,true);assert.equal(message.authorVerified,false);assert.match(message.contextNote,/not a current user request/);}
 const empty=setup();const noMessages=await empty.store.thread('task');assert.deepEqual(noMessages.messages,[]);assert.equal(noMessages.page.hasMore,false);assert.equal(noMessages.page.olderCursor,null);
});
test('older cursor traverses timestamp ties without duplicates or gaps even after new inserts',async()=>{
 const s=setup(205),first=await s.store.thread('task');s.add(205);s.add(206,'task','2026-01-02T00:00:00.000Z');
 const second=await s.store.thread('task',{before:first.page.olderCursor});assert.equal(second.page.isLatest,false);assert.equal(second.messages[0].id,'message-5');assert.equal(second.messages.at(-1).id,'message-104');
 const third=await s.store.thread('task',{before:second.page.olderCursor});assert.deepEqual(third.messages.map(m=>m.id),Array.from({length:5},(_,i)=>'message-'+i));assert.equal(third.page.hasMore,false);assert.equal(third.page.olderCursor,null);
 const visited=[...third.messages,...second.messages,...first.messages].map(m=>m.id);assert.equal(new Set(visited).size,205);assert.deepEqual(visited,Array.from({length:205},(_,i)=>'message-'+i));
 assert.equal((await s.store.thread('task')).messages.at(-1).id,'message-206');assert.equal(s.writes(),0);
});
test('large Unicode messages and attachment metadata honor byte budget without skipping history',async()=>{
 const attachments=JSON.stringify(Array.from({length:4},(_,i)=>({id:`fixture-image-${i}`,name:'架空画像'.repeat(40)+'.png',mimeType:'image/png',size:100,width:10,height:10,url:`/api/attachments/fixture-image-${i}`})));
 const s=setup(28,{text:'字'.repeat(12000),attachments});let page=await s.store.thread('task'),seen=[];assert(page.messages.length<100);assert(page.messages.length>0);
 for(;;){assert(bytes(page.messages)<=THREAD_MESSAGE_BYTE_BUDGET);assert.equal(bytes(page.messages),page.page.messageBytes);seen.unshift(...page.messages.map(m=>m.id));if(!page.page.hasMore)break;assert(page.page.olderCursor);page=await s.store.thread('task',{before:page.page.olderCursor});}
 assert.deepEqual(seen,Array.from({length:28},(_,i)=>'message-'+i));assert.equal(new Set(seen).size,28);
});
test('malformed, noncanonical, foreign-task, tampered, stale and out-of-range cursors fail closed',async()=>{
 const s=setup(102),page=await s.store.thread('task'),valid=page.page.olderCursor,data=parseCursor(valid);
 for(const before of ['',null,42,'!',valid+'=', 'x'.repeat(1601),cursor({...data,v:2}),cursor({...data,row:0}),cursor({...data,row:1.1}),cursor({...data,row:Number.MAX_SAFE_INTEGER+1}),cursor({...data,time:'bad'}),cursor({...data,extra:1}),cursor({...data,message:'missing'}),cursor({...data,row:data.row+1}),cursor({...data,time:'2026-01-03T00:00:00.000Z'})])await assert.rejects(()=>s.store.thread('task',{before}),e=>e.status===400);
 await assert.rejects(()=>s.store.thread('other',{before:valid}),e=>e.status===400);
 await assert.rejects(()=>s.store.thread('task',{before:valid,limit:10000}),/Unknown/);
 s.sql.prepare('DELETE FROM messages WHERE id=?').run(data.message);await assert.rejects(()=>s.store.thread('task',{before:valid}),/no longer valid/);
 await assert.rejects(()=>s.store.thread('missing'),e=>e.status===404);assert.equal(s.writes(),0);
});
test('paging never acknowledges pending messages or marks assistant messages viewed',async()=>{
 const s=setup(105);s.sql.prepare("UPDATE messages SET role='user',delivery='pending',historical_summary=0,author_verified=1 WHERE id='message-0'").run();s.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0 WHERE id='message-104'").run();const pendingBefore=await s.store.pending(),unread=(await s.store.getTask('task')).unread;const page=await s.store.thread('task');await s.store.thread('task',{before:page.page.olderCursor});assert.deepEqual(await s.store.pending(),pendingBefore);assert.equal((await s.store.getTask('task')).unread,unread);assert.equal(s.writes(),0);
});
test('navigation generations reject delayed responses across pages, rooms, close and reopening',()=>{
 const view=threadPageView(),latest=view.open('room-a');assert(view.accepts(latest));const older=view.older('cursor-one');assert.equal(older.cursor,'cursor-one');assert(!view.accepts(latest));assert(view.canGoNewer());const oldest=view.older('cursor-two');assert(!view.accepts(older));assert.equal(view.newer().cursor,'cursor-one');assert(!view.accepts(oldest));assert.equal(view.newer().cursor,null);assert.equal(view.canGoNewer(),false);const other=view.open('room-b');assert(!view.accepts(latest));const reopened=view.open('room-a');assert(!view.accepts(latest));assert(!view.accepts(other));assert(view.accepts(reopened));view.open(null);assert(!view.accepts(reopened));
});
test('explicit Latest invalidates in-flight older visits and clears page stack',()=>{
 const view=threadPageView();view.open('room');const older=view.older('cursor');const now=view.latest();assert.equal(now.cursor,null);assert.equal(view.canGoNewer(),false);assert(!view.accepts(older));assert(view.accepts(now));
});
test('UI bounds page windows, pauses older-page polling/receipts and exposes recovery controls',()=>{
 const source=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');assert(source.includes('if(!selected||threadVisit.cursor!==null)return;'));assert(source.includes('canMarkThreadViewed({cursor:visit.cursor,page:data.page,unread:data.task.unread,hidden:document.hidden})'));assert(source.includes('未読は自動では解除されません'));assert(source.includes('threadLastMessagePreview(data.messages.at(-1)?.text'));assert(source.includes('threadPages.current.accepts(visit)'));assert(source.includes('setMessages(data.messages)'));assert(source.includes('以前の会話'));assert(source.includes('新しいページ'));assert(source.includes('最新へ戻る'));assert(source.includes('自動更新を一時停止中'));assert(source.includes('setMessages([data.message])'));assert(source.includes('run(id,initial,threadPages.current.capture())'));assert(!source.includes('setMessages(old=>[...data.messages,...old])'));
 const route=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8');assert(route.includes('before=page.olderCursor'));assert(route.includes("only(a,['id','before'])"));assert(route.includes("a.before===undefined?{}:{before:a.before}"));
});
test('browser history endpoint forwards a single bounded cursor and rejects extra/repeated input',async()=>{
 const s=setup(105),first=await s.store.thread('task');const {ApiError}=await import(join(dir,'task-contract.mjs'));
 const source=readFileSync(new URL('../app/api/tasks/[id]/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const prefix=`const ApiError=globalThis.__pageEndpoint.ApiError;const body=r=>r.json();const api=async(request,run)=>{try{return Response.json(await run(globalThis.__pageEndpoint.store,'synthetic-owner'));}catch(e){return Response.json({error:e.message},{status:e.status??500});}};\n`;
 globalThis.__pageEndpoint={store:s.store,ApiError};
 try{const route=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(prefix+source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  const context={params:Promise.resolve({id:'task'})};const result=await route.GET(new Request('https://taskrooms.example/api/tasks/task?before='+first.page.olderCursor),context);assert.equal(result.status,200);const value=await result.json();assert.equal(value.messages.length,5);assert.equal(value.page.isLatest,false);
  for(const suffix of ['?limit=10000','?before=x','?before='+first.page.olderCursor+'&before='+first.page.olderCursor]){const invalid=await route.GET(new Request('https://taskrooms.example/api/tasks/task'+suffix),context);assert.equal(invalid.status,400);}
 }finally{delete globalThis.__pageEndpoint;}
});
test('real MCP handler returns paged history and preserves identity gate before any store access',async()=>{
 const s=setup(105);const {ApiError,verifyMcpHeaders,only,object,str}=await import(join(dir,'task-contract.mjs'));const owner={email:'owner@taskrooms.example',userId:'synthetic-site-owner'};
 const state={store:s.store,owner,ApiError,verifyMcpHeaders,only,object,str,accesses:0};globalThis.__pageMcp=state;
 const source=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const prefix=`const state=globalThis.__pageMcp;const {ApiError,verifyMcpHeaders,only,object,str}=state;const runtimeOwner=()=>state.owner;const MAX_ASSISTANT_IMAGE_BYTES=4*1024*1024;const activityInputSchema={},progressInputSchema={};const logMcpEventResult=()=>{};class McpEventError extends Error{};const response=(value,status=200)=>Response.json(value,{status});const body=r=>r.json();const validateOrigin=()=>{};const taskStore=()=>{state.accesses++;return state.store;};\n`;
 try{const route=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(prefix+source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  const call=(args,authenticated=true)=>route.POST(new Request('https://taskrooms.example/mcp',{method:'POST',headers:authenticated?{'oai-authenticated-user-email':owner.email,'oai-authenticated-user-id':owner.userId}:{},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_task_thread',arguments:args}})}));
  const denied=await call({id:'task'},false);assert.equal(denied.status,401);assert.equal(state.accesses,0);
  const first=await(await call({id:'task'})).json();assert.equal(first.result.isError,false);const page=JSON.parse(first.result.content[0].text);assert.equal(page.messages.length,100);assert(page.page.hasMore);
  const older=await(await call({id:'task',before:page.page.olderCursor})).json();assert.equal(older.result.isError,false);assert.equal(JSON.parse(older.result.content[0].text).messages.length,5);
  for(const args of [{id:'other',before:page.page.olderCursor},{id:'task',before:'invalid'},{id:'task',limit:5000}]){const invalid=await(await call(args)).json();assert.equal(invalid.result.isError,true);}
  assert.equal(s.writes(),0);
 }finally{delete globalThis.__pageMcp;}
});

test('receipt eligibility fails closed for every partial/older/missing page and hidden view',()=>{
 const input={cursor:null,page:{isLatest:true,hasMore:false},unread:1,hidden:false};assert.equal(canMarkThreadViewed(input),true);
 for(const changed of [{page:{isLatest:true,hasMore:true}},{cursor:'older',page:{isLatest:false,hasMore:false}},{cursor:'older',page:{isLatest:true,hasMore:false}},{page:{isLatest:false,hasMore:false}},{page:null},{page:undefined},{hidden:true},{unread:0},{unread:-1},{unread:NaN},{unread:1.5}])assert.equal(canMarkThreadViewed({...input,...changed}),false);
});
async function receivePage(s,page,cursor=null){if(canMarkThreadViewed({cursor,page:page.page,unread:page.task.unread,hidden:false}))await s.store.markViewed('task',{through:page.fetchedAt});}
test('latest count-bounded pages and every older page preserve unseen unread, including mixed roles and timestamp ties',async()=>{
 const s=setup(205);s.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0").run();s.sql.prepare("UPDATE messages SET role='user' WHERE rowid%3=0").run();const before=(await s.store.getTask('task')).unread;assert(before>100);
 let page=await s.store.thread('task'),beforeCursor=null;assert(page.page.hasMore);assert.equal(page.task.unread,before);
 for(;;){await receivePage(s,page,beforeCursor);assert.equal((await s.store.getTask('task')).unread,before);if(!page.page.hasMore)break;beforeCursor=page.page.olderCursor;page=await s.store.thread('task',{before:beforeCursor});}
 assert.equal(page.page.hasMore,false);assert.equal(page.page.isLatest,false);assert.equal(s.writes(),0);
});
test('byte-bounded latest pages do not clear unread outside the returned window',async()=>{
 const s=setup(28,{text:'字'.repeat(12000)});s.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0").run();const page=await s.store.thread('task');assert(page.messages.length<28);assert(page.page.hasMore);await receivePage(s,page);assert.equal((await s.store.getTask('task')).unread,28);assert.equal(s.writes(),0);
});
test('complete small latest pages keep existing receipt behavior, while already-read older history is conservatively retained',async()=>{
 const small=setup(5);small.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0").run();const full=await small.store.thread('task');assert.equal(full.page.hasMore,false);assert.equal(full.task.unread,5);await receivePage(small,full);assert.equal((await small.store.getTask('task')).unread,0);assert.equal(small.writes(),1);
 const long=setup(105);long.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0").run();long.sql.prepare("UPDATE tasks SET last_viewed_at=? WHERE id='task'").run(timestamp);long.sql.prepare("UPDATE messages SET created_at='2026-01-02T00:00:00.000Z' WHERE rowid>100").run();const partial=await long.store.thread('task');assert.equal(partial.task.unread,5);assert(partial.page.hasMore);assert(partial.messages.filter(m=>m.role==='assistant').length>=partial.task.unread);await receivePage(long,partial);assert.equal((await long.store.getTask('task')).unread,5);assert.equal(long.writes(),0);
});
test('thread-to-board previews match the 400 Unicode code-point bound without cutting surrogate pairs',()=>{
 const text='😀字'.repeat(6000),preview=threadLastMessagePreview(text);assert.equal(Array.from(preview.lastMessage).length,400);assert.equal(preview.lastMessage,'😀字'.repeat(200));assert.equal(preview.lastMessageIsPreview,true);assert.equal(preview.lastMessagePreviewLimit,400);assert.equal(threadLastMessagePreview('short').lastMessage,'short');assert.equal(threadLastMessagePreview('').lastMessage,'');
});


test('manual acknowledgement requires an exact latest partial snapshot and explicit confirmation',async()=>{
 const view=threadPageView(),visit=view.open('task');const input={visit,page:{isLatest:true,hasMore:true},unread:105,fetchedAt:timestamp};const captured=captureThreadAcknowledgement(input);assert.deepEqual(captured,{visit,through:timestamp});
 for(const changed of [{visit:{...visit,taskId:null}},{visit:{...visit,cursor:'old'}},{page:null},{page:{isLatest:false,hasMore:true}},{page:{isLatest:true,hasMore:false}},{unread:0},{unread:NaN},{fetchedAt:undefined},{fetchedAt:'not-a-date'}])assert.equal(captureThreadAcknowledgement({...input,...changed}),null);
 let writes=0,confirms=0;const write=async(id,through)=>{writes++;return {id,through};};
 assert.equal(await acknowledgeThreadSnapshot(captured,view.accepts,()=>{confirms++;return false;},write),null);assert.equal(writes,0);assert.equal(confirms,1);
 assert.deepEqual(await acknowledgeThreadSnapshot(captured,view.accepts,()=>true,write),{id:'task',through:timestamp});assert.equal(writes,1);
});
test('manual acknowledgement cannot apply an old confirmation to another room or page, even after reopening',async()=>{
 const view=threadPageView();let writes=0;const write=async()=>{writes++;};const capture=()=>captureThreadAcknowledgement({visit:view.capture(),page:{isLatest:true,hasMore:true},unread:1,fetchedAt:timestamp});
 view.open('task');let snapshot=capture();await acknowledgeThreadSnapshot(snapshot,view.accepts,()=>{view.open('other');return true;},write);assert.equal(writes,0);
 view.open('task');snapshot=capture();await acknowledgeThreadSnapshot(snapshot,view.accepts,()=>{view.older('cursor');return true;},write);assert.equal(writes,0);
 view.open('task');snapshot=capture();view.open(null);view.open('task');await acknowledgeThreadSnapshot(snapshot,view.accepts,()=>{throw Error('stale snapshot must not prompt');},write);assert.equal(writes,0);
});
test('explicit snapshot acknowledgement includes hidden old replies but leaves later replies and pending user delivery untouched; retry is idempotent',async()=>{
 const s=setup(205);s.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0").run();s.sql.prepare("UPDATE messages SET role='user',delivery='pending' WHERE rowid=1").run();
 const page=await s.store.thread('task');assert.equal(page.page.hasMore,true);const view=threadPageView();view.open('task');const snapshot=captureThreadAcknowledgement({visit:view.capture(),page:page.page,unread:page.task.unread,fetchedAt:page.fetchedAt});
 const later=new Date(Date.parse(page.fetchedAt)+1000).toISOString();s.add(205,'task',later);s.sql.prepare("UPDATE messages SET role='assistant',historical_summary=0 WHERE id='message-205'").run();
 const write=(id,through)=>s.store.markViewed(id,{through});await acknowledgeThreadSnapshot(snapshot,view.accepts,()=>true,write);assert.equal((await s.store.getTask('task')).unread,1);assert.equal(s.sql.prepare("SELECT delivery FROM messages WHERE id='message-0'").get().delivery,'pending');assert.equal(s.sql.prepare("SELECT last_viewed_at FROM tasks WHERE id='task'").get().last_viewed_at,page.fetchedAt);
 await acknowledgeThreadSnapshot(snapshot,view.accepts,()=>true,write);assert.equal((await s.store.getTask('task')).unread,1);assert.equal((await s.store.pending()).length,1);
});
test('manual acknowledgement UI discloses hidden replies and uses captured timestamp, never click time',()=>{
 const source=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');assert(source.includes('未表示の過去の返信も含め'));assert(source.includes('あなたの確認操作'));assert(source.includes('acknowledgementLock.current=true'));assert(source.includes('acknowledgeThreadSnapshot(snapshot'));assert(source.includes('JSON.stringify({through})'));assert(source.includes('if(threadPages.current.accepts(snapshot.visit)&&selectedId.current===snapshot.visit.taskId)'));assert(source.includes('disabled={acknowledging||threadLoading||sending||saving||!acknowledgement.current}'));
});
