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
function setup(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));let writes=0;const d1={prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){writes++;return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {store:new TaskStore(d1),sql,d1,writes:()=>writes};}
const {validateActivity,readActivity}=await import(join(dir,'task-activity.mjs'));
test('activity accepts reports without percentage; timestamps and allowed fields are server-owned',()=>{const time='2026-10-25T02:00:00.000Z';for(const state of ['active','waiting','queued','done'])assert.deepEqual(validateActivity({current:'資料を確認',state},time),{current:'資料を確認',state,updatedAt:time});assert.equal(validateActivity(null),null);for(const value of [{current:'work',state:'typing'},{current:'',state:'active'},{current:'x'.repeat(161),state:'active'},{current:'work',state:'active',updatedAt:time},{current:'work',state:'active',percent:50}])assert.throws(()=>validateActivity(value));assert.equal(readActivity(null),null);assert.equal(readActivity('broken'),null);assert.equal(readActivity('{"current":"work","state":"active","updatedAt":"bad"}'),null);assert.deepEqual(readActivity(JSON.stringify(validateActivity({current:'確認待ち',state:'waiting'},time))),{current:'確認待ち',state:'waiting',updatedAt:time});});
test('activity is independently persisted/read without changing milestones, status, messages or authority',async()=>{const {store,sql}=setup();const t=await store.create({title:'report',clientId:'a'},'owner');const progress={completed:1,total:2,current:'first done',remaining:['second'],state:'active'};await store.update(t.id,{progress});const before=await store.getTask(t.id);const updated=await store.update(t.id,{activity:{current:'現在の資料を確認中',state:'active'}});assert.equal(updated.activity.state,'active');assert.ok(Number.isFinite(Date.parse(updated.activity.updatedAt)));assert.deepEqual(updated.progress,before.progress);assert.equal(updated.status,before.status);assert.equal(sql.prepare('SELECT COUNT(*) n FROM messages').get().n,0);assert.deepEqual((await store.thread(t.id)).task.activity,updated.activity);assert.deepEqual((await store.listTasks())[0].activity,updated.activity);await store.update(t.id,{activity:{current:'返答待ち',state:'waiting'}});await assert.rejects(()=>store.update(t.id,{activity:{current:'調査済み',state:'done'}}),/does not match/);assert.equal((await store.getTask(t.id)).status,'working');await assert.rejects(()=>store.update(t.id,{activity:{current:'spoof',state:'active'}},true),/Unknown/);await store.update(t.id,{activity:null});assert.equal((await store.getTask(t.id)).activity,null);});
test('new owner post queues atomically, retries and assistant updates never fabricate active work',async()=>{const {store}=setup();const t=await store.create({title:'existing',clientId:'b'},'owner');assert.equal(t.activity.state,'queued');assert.equal(t.activity.current,'返信待ち');await store.update(t.id,{activity:{current:'確認中',state:'active'}});const first=await store.post(t.id,{text:'new request',clientId:'message'},'owner');const continued=(await store.getTask(t.id)).activity;assert.equal(continued.state,'active');assert.equal(continued.current,'確認中');await store.update(t.id,{activity:{current:'依頼を調査中',state:'active'}});const active=(await store.getTask(t.id)).activity;await store.post(t.id,{text:'new request',clientId:'message'},'owner');assert.deepEqual((await store.getTask(t.id)).activity,active);await store.create({title:'retry',clientId:'b'},'owner');assert.deepEqual((await store.getTask(t.id)).activity,active);await store.reply({task_id:t.id,message_id:first.id,text:'ack',idempotency_key:'ack'});assert.deepEqual((await store.getTask(t.id)).activity,active);await store.update(t.id,{status:'done',activity:{current:'終了',state:'done'}});await store.post(t.id,{text:'followup',clientId:'followup'},'owner');assert.equal((await store.getTask(t.id)).activity.state,'queued');});
test('seed and migrated old rows remain unknown; initial image-only room queues without fake milestones',async()=>{const {store,sql}=setup();const seeded=await store.create({title:'history',clientId:'seed',status:'working'},null,true);assert.equal(seeded.activity,null);const draftId=crypto.randomUUID(),imageId=crypto.randomUUID();sql.prepare("INSERT INTO draft_image_attachments(id,task_id,owner_site_user_id,client_id,object_key,name,mime_type,size,width,height,sha256,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(imageId,draftId,'owner','upload','private-test','image.png','image/png',20,1,1,'hash','ready',new Date().toISOString());const input={title:'画像の相談',description:'',clientId:'draft',draftId,attachmentIds:[imageId]};const created=await store.create(input,'owner');assert.equal(created.activity.state,'queued');assert.equal(created.progress,null);await store.update(created.id,{activity:{current:'画像を確認中',state:'active'}});const updated=(await store.getTask(created.id)).activity;await store.create(input,'owner');assert.deepEqual((await store.getTask(created.id)).activity,updated);const message=(await store.thread(created.id)).messages[0];assert.equal(message.attachments.length,1);assert.equal(message.authorVerified,true);});
test('MCP schema includes activity reports and source contains no new event authority',()=>{const route=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8');assert(route.includes('activity:activityInputSchema'));const migration=readFileSync(new URL('../drizzle/0000_taskrooms.sql',import.meta.url),'utf8');assert(migration.includes('`activity_json` text'));assert(!/^\s*(?:INSERT|UPDATE|DELETE)\s/im.test(migration));});

test('user post preserves only fresh valid active reports on working tasks, without refreshing their timestamp',async()=>{
 const {store,sql}=setup();const t=await store.create({title:'continuation',clientId:'preserve'},'owner');
 const good={current:'実装中',state:'active',updatedAt:new Date(Date.now()-1000).toISOString()};
 const cases=[
  ['working',JSON.stringify(good),true],
  ...['waiting','done','backlog'].map(status=>[status,JSON.stringify(good),false]),
  ...['waiting','queued','done'].map(state=>['working',JSON.stringify({...good,state}),false]),
  ...[null,'not json','[]','{}',JSON.stringify({...good,extra:1}),JSON.stringify({...good,current:''}),JSON.stringify({...good,current:123}),JSON.stringify({...good,current:'x'.repeat(161)}),JSON.stringify({...good,updatedAt:'invalid'}),JSON.stringify({...good,updatedAt:new Date(Date.now()+60000).toISOString()}),JSON.stringify({...good,updatedAt:new Date(Date.now()-300000).toISOString()}),JSON.stringify({...good,updatedAt:new Date(Date.now()-600000).toISOString()})].map(value=>['working',value,false])
 ];
 for(const [i,[status,value,preserve]] of cases.entries()){
  sql.prepare('UPDATE tasks SET status=?,activity_json=? WHERE id=?').run(status,value,t.id);
  await store.post(t.id,{text:'追加の情報',clientId:'case-'+i},'owner');
  const row=sql.prepare('SELECT status,activity_json FROM tasks WHERE id=?').get(t.id);
  assert.equal(row.status,'working');
  if(preserve)assert.equal(row.activity_json,value,'preserve original JSON and timestamp');
  else assert.equal(JSON.parse(row.activity_json).state,'queued','invalid/stale/inactive case '+i);
 }
});
test('user post evaluates concurrent assistant activity on the current SQL row, not its earlier read',async()=>{
 const {store,sql,d1}=setup();const t=await store.create({title:'race',clientId:'race'},'owner');
 const original=d1.batch.bind(d1);let injected=false;
 const reported={current:'新しい工程を実行中',state:'active',updatedAt:new Date(Date.now()-1000).toISOString()};
 d1.batch=async(statements)=>{if(!injected){injected=true;sql.prepare('UPDATE tasks SET activity_json=? WHERE id=?').run(JSON.stringify(reported),t.id);}return original(statements);};
 await store.post(t.id,{text:'追加',clientId:'race-post'},'owner');
 assert.deepEqual((await store.getTask(t.id)).activity,reported);
});

test('status-only updates synchronize reported activity and preserve waiting detail or fresh actual work',async()=>{
 const {store,sql}=setup();const t=await store.create({title:'consistency',clientId:'status'},'owner');
 await store.update(t.id,{activity:{current:'実装中',state:'active'}});
 const active=(await store.getTask(t.id)).activity;
 assert.deepEqual((await store.update(t.id,{status:'working'})).activity,active);
 let task=await store.update(t.id,{status:'waiting'});assert.equal(task.activity.current,'あなたの確認待ち');assert.equal(task.activity.state,'waiting');
 await store.update(t.id,{activity:{current:'資料を送ってください',state:'waiting'}});
 const waiting=(await store.getTask(t.id)).activity;
 assert.deepEqual((await store.update(t.id,{status:'waiting'})).activity,waiting);
 task=await store.update(t.id,{status:'working'});assert.equal(task.activity.current,'dotの対応待ち');assert.equal(task.activity.state,'queued');
 await store.update(t.id,{activity:{current:'外部の調査待ち',state:'waiting'}});
 const dependency=(await store.getTask(t.id)).activity;
 assert.deepEqual((await store.update(t.id,{status:'working'})).activity,dependency);
 task=await store.update(t.id,{status:'backlog'});assert.equal(task.activity.current,'後回し');assert.equal(task.activity.state,'queued');
 task=await store.update(t.id,{status:'done'});assert.equal(task.activity.current,'完了');assert.equal(task.activity.state,'done');
 sql.prepare('UPDATE tasks SET activity_json=? WHERE id=?').run('malformed',t.id);
 assert.equal((await store.update(t.id,{status:'waiting'})).activity.state,'waiting');
});
test('explicit activity must match status; dependency waiting and explicit unknown remain valid',async()=>{
 const {store}=setup();const t=await store.create({title:'states',clientId:'states'},'owner');
 const map={waiting:['waiting'],working:['active','queued','waiting'],done:['done'],backlog:['queued']};
 for(const status of Object.keys(map)){
  for(const state of ['active','queued','waiting','done']){
   const action=()=>store.update(t.id,{status,activity:{current:'reported',state}});
   if(map[status].includes(state)){const task=await action();assert.equal(task.activity.state,state);}
   else await assert.rejects(action,/does not match/);
  }
  assert.equal((await store.update(t.id,{status,activity:null})).activity,null);
 }
 await store.update(t.id,{status:'waiting'});
 await assert.rejects(()=>store.update(t.id,{activity:{current:'wrong',state:'active'}}),/does not match/);
});
test('activity-only rejects status races; status-only preserves concurrently reported waiting detail',async()=>{
 const {store,sql}=setup();const t=await store.create({title:'race',clientId:'status-race'},'owner');
 const original=store.getTask.bind(store);let inject=true;
 store.getTask=async(id)=>{const row=await original(id);if(inject){inject=false;sql.prepare("UPDATE tasks SET status='waiting' WHERE id=?").run(id);}return row;};
 await assert.rejects(()=>store.update(t.id,{activity:{current:'work',state:'active'}}),/status changed/);
 assert.notEqual((await original(t.id)).activity.state,'active');
 inject=true;
 const waiting={current:'確認事項を追加しました',state:'waiting',updatedAt:new Date().toISOString()};
 store.getTask=async(id)=>{const row=await original(id);if(inject){inject=false;sql.prepare('UPDATE tasks SET activity_json=? WHERE id=?').run(JSON.stringify(waiting),id);}return row;};
 assert.deepEqual((await store.update(t.id,{status:'waiting'})).activity,waiting);
});

test('legacy inconsistent activity is normalized on read without DB writes or a fabricated fresh timestamp',async()=>{
 const {store,sql,writes}=setup();const t=await store.create({title:'legacy',clientId:'legacy'},'owner');
 const storedTime='2026-10-20T12:00:00.000Z',old={current:'古い作業中',state:'active',updatedAt:'2026-10-19T12:00:00.000Z'};
 sql.prepare("UPDATE tasks SET status='waiting',activity_json=?,updated_at=? WHERE id=?").run(JSON.stringify(old),storedTime,t.id);
 const before=writes(),expected={current:'あなたの確認待ち',state:'waiting',updatedAt:storedTime};
 assert.deepEqual((await store.getTask(t.id)).activity,expected);
 assert.deepEqual((await store.thread(t.id)).task.activity,expected);
 assert.deepEqual((await store.listTasks())[0].activity,expected);
 assert.equal(writes(),before);assert.equal(sql.prepare('SELECT activity_json FROM tasks WHERE id=?').get(t.id).activity_json,JSON.stringify(old));
 for(const [status,state] of [['done','done'],['backlog','queued']]){
  sql.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,t.id);
  const task=await store.getTask(t.id);assert.equal(task.activity.state,state);assert.equal(task.activity.updatedAt,storedTime);
 }
 const custom={current:'資料待ち',state:'waiting',updatedAt:storedTime};
 sql.prepare("UPDATE tasks SET status='working',activity_json=? WHERE id=?").run(JSON.stringify(custom),t.id);
 assert.deepEqual((await store.getTask(t.id)).activity,custom);
 sql.prepare("UPDATE tasks SET activity_json=NULL WHERE id=?").run(t.id);
 assert.equal((await store.getTask(t.id)).activity,null);
});
