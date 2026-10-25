import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'taskboard-tests-'));
for(const name of ['task-activity','task-progress','attachment-store','image-upload','task-contract','task-store']){let source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8').replaceAll("'./task-activity'","'./task-activity.mjs'").replaceAll("'./task-progress'","'./task-progress.mjs'").replaceAll("'./task-contract'","'./task-contract.mjs'").replaceAll("'./attachment-store'","'./attachment-store.mjs'").replaceAll("'./image-upload'","'./image-upload.mjs'");writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
const {TaskStore}=await import(join(dir,'task-store.mjs'));
const {verifyOwner,verifyMcpHeaders,validateOrigin}=await import(join(dir,'task-contract.mjs'));
function setup(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));let writes=0,hooks=0,reads=0;const d1={prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){reads++;return sql.prepare(query).get(...args)??null;},async all(){reads++;return {results:sql.prepare(query).all(...args)};},async run(){writes++;return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {store:new TaskStore(d1,async()=>{hooks++},async()=>{hooks++}),sql,writes:()=>writes,reads:()=>reads,hooks:()=>hooks};}
test('owner reaction persists, same desired state is retry-safe, changes and removal are explicit',async()=>{
 const {store}=setup();const t=await store.create({title:'reaction',description:'ask',clientId:'t'},'owner');const user=(await store.thread(t.id)).messages[0];const answer=await store.reply({task_id:t.id,message_id:user.id,text:'answer',idempotency_key:'r'});
 const first=await store.setReaction(t.id,answer.id,{emoji:'👍'},'owner');assert.deepEqual(first.reactions.map(r=>[r.emoji,r.authorVerified,r.authorSiteUserId]),[['👍',true,'owner']]);const duplicate=await store.setReaction(t.id,answer.id,{emoji:'👍'},'owner');assert.deepEqual(duplicate,first);assert.deepEqual((await store.thread(t.id)).messages.find(m=>m.id===answer.id).reactions,first.reactions);
 const changed=await store.setReaction(t.id,answer.id,{emoji:'❤️'},'owner');assert.equal(changed.reactions.length,1);assert.equal(changed.reactions[0].emoji,'❤️');assert.deepEqual((await store.setReaction(t.id,answer.id,{emoji:null},'owner')).reactions,[]);assert.deepEqual((await store.setReaction(t.id,answer.id,{emoji:null},'owner')).reactions,[]);assert.deepEqual((await store.thread(t.id)).messages.find(m=>m.id===answer.id).reactions,[]);
});
test('reactions never mutate conversation/history/status/unread or invoke event/push hooks',async()=>{
 const {store,sql,hooks}=setup();const t=await store.create({title:'task',description:'pending work',clientId:'t'},'owner');const m=await store.postUpdate({task_id:t.id,text:'result',idempotency_key:'reply'});const before={messages:sql.prepare('SELECT * FROM messages ORDER BY rowid').all(),tasks:sql.prepare('SELECT * FROM tasks').all(),pending:await store.pending(),unread:await store.unreadCount(),hooks:hooks()};
 await store.setReaction(t.id,m.id,{emoji:'👍'},'owner');await store.setReaction(t.id,m.id,{emoji:'❤️'},'owner');await store.setReaction(t.id,m.id,{emoji:null},'owner');assert.deepEqual(sql.prepare('SELECT * FROM messages ORDER BY rowid').all(),before.messages);assert.deepEqual(sql.prepare('SELECT * FROM tasks').all(),before.tasks);assert.deepEqual(await store.pending(),before.pending);assert.equal(await store.unreadCount(),before.unread);assert.equal(hooks(),before.hooks);
});
test('foreign task, unknown message, invalid emoji and spoofed attribution fail closed',async()=>{
 const {store,sql}=setup();const a=await store.create({title:'a',description:'a',clientId:'a'},'owner'),b=await store.create({title:'b',clientId:'b'},'owner');const m=(await store.thread(a.id)).messages[0];
 await assert.rejects(()=>store.setReaction(b.id,m.id,{emoji:'👍'},'owner'),/Message not found/);await assert.rejects(()=>store.setReaction(a.id,'missing',{emoji:'👍'},'owner'),/Message not found/);for(const input of [{emoji:'🔥'},{emoji:'<script>'},{emoji:1},{},{emoji:'👍',authorVerified:true},{emoji:'👍',authorSiteUserId:'other'}])await assert.rejects(()=>store.setReaction(a.id,m.id,input,'owner'));
 await store.setReaction(a.id,m.id,{emoji:'👍'},'owner');await assert.rejects(()=>store.setReaction(a.id,m.id,{emoji:null},'other'),/another owner identity/);await assert.rejects(()=>store.setReaction(a.id,m.id,{emoji:'❤️'},'other'),/another owner identity/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM message_reactions').get().n,1);assert.throws(()=>sql.prepare("INSERT INTO message_reactions VALUES('nonexistent','owner','👍',1,'2026-01-01')").run(),/FOREIGN KEY/);
});
test('concurrent same choice cannot create duplicate feedback; thread GET remains read-only',async()=>{
 const {store,writes,sql}=setup();const t=await store.create({title:'a',description:'a',clientId:'a'},'owner'),m=(await store.thread(t.id)).messages[0];await Promise.all(Array.from({length:4},()=>store.setReaction(t.id,m.id,{emoji:'👍'},'owner')));assert.equal(sql.prepare('SELECT COUNT(*) n FROM message_reactions').get().n,1);const before=writes();assert.equal((await store.thread(t.id)).messages[0].reactions.length,1);assert.equal(writes(),before);
});
test('HTTP route uses existing owner and same-origin checks, no direct MCP reaction write tool',()=>{
 const route=readFileSync(new URL('../app/api/tasks/[id]/messages/[messageId]/reaction/route.ts',import.meta.url),'utf8'),api=readFileSync(new URL('../lib/task-api.ts',import.meta.url),'utf8');assert(route.includes('POST(request:Request'));assert(route.includes('api(request'));assert(route.includes('await body(request),userId'));assert(api.includes('verifyOwner(await getChatGPTUser(),runtimeOwner())'));assert(api.includes("if(request.method!=='GET')validateOrigin(request)"));assert.throws(()=>verifyOwner(null));assert.throws(()=>verifyOwner({userId:'evil',email:'evil@example.com'}));assert.throws(()=>validateOrigin(new Request('https://room.example/api',{method:'POST',headers:{origin:'https://evil.example'}})));
});

test('changed reaction uses three DB operations; identical sets and absent removals only one read',async()=>{
 const {store,reads,writes}=setup();const t=await store.create({title:'speed',description:'ask',clientId:'speed'},'owner'),m=(await store.thread(t.id)).messages[0];
 let r=reads(),w=writes();await store.setReaction(t.id,m.id,{emoji:null},'owner');assert.equal(reads()-r,1);assert.equal(writes()-w,0);
 r=reads();w=writes();const first=await store.setReaction(t.id,m.id,{emoji:'👍'},'owner');assert.equal(reads()-r,2);assert.equal(writes()-w,1);
 r=reads();w=writes();assert.deepEqual(await store.setReaction(t.id,m.id,{emoji:'👍'},'owner'),first);assert.equal(reads()-r,1);assert.equal(writes()-w,0);
 r=reads();w=writes();await store.setReaction(t.id,m.id,{emoji:'❤️'},'owner');assert.equal(reads()-r,2);assert.equal(writes()-w,1);
 r=reads();w=writes();await store.setReaction(t.id,m.id,{emoji:null},'owner');assert.equal(reads()-r,2);assert.equal(writes()-w,1);
});
