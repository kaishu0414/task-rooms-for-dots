import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'attachment-tests-'));
for(const name of ['task-activity','task-progress','task-contract','image-upload','attachment-store','task-store']){
 let source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');
 for(const dep of ['task-activity','task-progress','task-contract','image-upload','attachment-store'])source=source.replaceAll("'./"+dep+"'","'./"+dep+".mjs'");
 writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const { AttachmentStore,assistantImageBytes,MAX_ASSISTANT_IMAGE_BYTES }=await import(join(dir,'attachment-store.mjs'));
const { TaskStore }=await import(join(dir,'task-store.mjs'));
const { inspectImage,readImageBody,MAX_IMAGE_BYTES }=await import(join(dir,'image-upload.mjs'));
function crc(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length,0);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,8+data.length)),8+data.length);return b;}
function png(width=2,height=2){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;return new Uint8Array(Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n','binary'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,0,0,255,0,0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]));}
const webp=new Uint8Array(Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=','base64'));
function setup(hooks={}){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(query){let args=[];return{bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){await hooks.beforeRun?.(query,args,sql);return sql.prepare(query).run(...args);},execute(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const objects=new Map();let puts=0,deletes=0;
 const bucket={async put(key,bytes){puts++;await hooks.beforePut?.(key,bytes);objects.set(key,Uint8Array.from(bytes));},async get(key){const value=objects.get(key);return value?{arrayBuffer:async()=>Uint8Array.from(value).buffer}:null;},async delete(key){deletes++;await hooks.beforeDelete?.(key);objects.delete(key);}};
 return{sql,db,objects,bucket,attachments:new AttachmentStore(db,bucket),store:new TaskStore(db),puts:()=>puts,deletes:()=>deletes};
}
async function task(s,id='t'){return s.store.create({title:'private task',clientId:id},'owner');}
async function stage(s,t,id='image',owner='owner'){return s.attachments.stage(t.id,owner,id,'photo.png','image/png',png());}
test('MIME sniffing checks PNG CRC/chunks/dimensions and WebP structure, not extensions',()=>{
 assert.deepEqual(inspectImage(png(),'image/png'),{width:2,height:2,mimeType:'image/png'});assert.deepEqual(inspectImage(webp,'image/webp'),{width:2,height:2,mimeType:'image/webp'});
 for(const [bytes,type] of [[png(),'image/jpeg'],[new TextEncoder().encode('<svg onload="alert(1)"/>'),'image/png'],[png().slice(0,-1),'image/png'],[Buffer.concat([png(),Buffer.from('<script/>')]),'image/png'],[webp,'image/png'],[webp.slice(0,-2),'image/webp'],[png(9000,2),'image/png'],[png(5000,5000),'image/png']])assert.throws(()=>inspectImage(bytes,type));
 const corrupt=png();corrupt[30]^=1;assert.throws(()=>inspectImage(corrupt,'image/png'));assert.throws(()=>inspectImage(new Uint8Array(MAX_IMAGE_BYTES+1),'image/png'),/6MB/);
});
test('bounded streaming rejects excess content with and without an honest Content-Length',async()=>{
 await assert.rejects(()=>readImageBody(new Request('https://site.test',{method:'POST',headers:{'content-length':String(MAX_IMAGE_BYTES+1)},body:'x'})),/6MB/);
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_IMAGE_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
 await assert.rejects(()=>readImageBody(new Request('https://site.test',{method:'POST',body:stream,duplex:'half'})),/6MB/);
 assert.deepEqual(await readImageBody(new Request('https://site.test',{method:'POST',body:png()})),png());
});
test('staging is idempotent, private before bind, filename sanitized and owner-scoped',async()=>{
 const s=setup(),t=await task(s);const a=await s.attachments.stage(t.id,'owner','upload-id','../unsafe\\name\n.png','image/png',png());assert(!/[\/\\\n]/.test(a.name));assert.equal(s.puts(),1);const repeat=await s.attachments.stage(t.id,'owner','upload-id','../unsafe\\name\n.png','image/png',png());assert.equal(repeat.id,a.id);assert.equal(s.puts(),1);
 await assert.rejects(()=>s.attachments.read(a.id,'owner'),/not found/);await assert.rejects(()=>s.attachments.read(a.id,'foreign'),/not found/);assert(!JSON.stringify(a).includes('object_key'));assert(!JSON.stringify(a).includes('private-images/'));
 await assert.rejects(()=>s.attachments.stage(t.id,'owner','upload-id','different.png','image/png',png()),/different image/);
});
test('failed object put can retry safely using same upload ID and immutable image bytes',async()=>{
 let fail=true;const s=setup({beforePut:async()=>{if(fail){fail=false;throw new Error('temporary');}}}),t=await task(s);
 await assert.rejects(()=>stage(s,t),/temporary/);assert.equal(s.sql.prepare('SELECT state FROM image_attachments').get().state,'uploading');
 const result=await stage(s,t);assert.equal(s.sql.prepare('SELECT state FROM image_attachments').get().state,'ready');assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM image_attachments').get().n,1);assert.equal(s.objects.size,1);assert.equal(result.name,'photo.png');
});
test('image-only post binds atomically and remains idempotent; source actor and message must match',async()=>{
 const s=setup(),t=await task(s),a=await stage(s,t);const req={text:'',clientId:'post',attachmentIds:[a.id]};const m=await s.store.post(t.id,req,'owner');assert.equal(m.authorVerified,true);assert.equal(m.authorSiteUserId,'owner');assert.deepEqual(m.attachments.map(x=>x.id),[a.id]);assert.equal((await s.store.post(t.id,req,'owner')).id,m.id);assert.equal(s.sql.prepare('SELECT message_id FROM image_attachments').get().message_id,m.id);
 const loaded=await s.attachments.read(a.id,'owner');assert.deepEqual(new Uint8Array(await loaded.object.arrayBuffer()),png());await assert.rejects(()=>s.attachments.read(a.id,'foreign'),/not found/);await assert.rejects(()=>s.attachments.remove(a.id,'owner'),/削除/);await assert.rejects(()=>s.store.post(t.id,{...req,text:'changed'},'owner'),/Idempotency/);
 const image=await s.attachments.imageContent(a.id);assert.equal(image.mimeType,'image/png');assert.deepEqual(Buffer.from(image.data,'base64'),Buffer.from(png()));
});
test('attachment binding rejects wrong owner/task, expiry, duplicates and reuse without partial messages',async()=>{
 const s=setup(),t=await task(s),other=await task(s,'other'),a=await stage(s,t),foreign=await stage(s,t,'foreign','not-owner');
 for(const [taskId,ids] of [[other.id,[a.id]],[t.id,[foreign.id]],[t.id,[a.id,a.id]],[t.id,[a.id,'missing']]])await assert.rejects(()=>s.store.post(taskId,{text:'x',clientId:Math.random().toString(),attachmentIds:ids},'owner'));
 assert.equal((await s.store.thread(t.id)).messages.length,0);assert.equal(s.sql.prepare('SELECT message_id FROM image_attachments WHERE id=?').get(a.id).message_id,null);
 s.sql.prepare('UPDATE image_attachments SET created_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',a.id);await assert.rejects(()=>s.store.post(t.id,{text:'x',clientId:'expired',attachmentIds:[a.id]},'owner'));
});
test('concurrent messages cannot consume the same image twice; concurrent same upload remains one object',async()=>{
 const s=setup(),t=await task(s);const [a,b]=await Promise.all([stage(s,t),stage(s,t)]);assert.equal(a.id,b.id);assert.equal(s.objects.size,1);
 const outcomes=await Promise.allSettled([s.store.post(t.id,{text:'one',clientId:'one',attachmentIds:[a.id]},'owner'),s.store.post(t.id,{text:'two',clientId:'two',attachmentIds:[a.id]},'owner')]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);assert.equal((await s.store.thread(t.id)).messages.length,1);
});
test('staged removal respects ownership and never resurrects a deletion claim',async()=>{
 const s=setup(),t=await task(s),a=await stage(s,t);await assert.rejects(()=>s.attachments.remove(a.id,'foreign'),/not found/);assert.equal(s.objects.size,1);
 s.sql.prepare("UPDATE image_attachments SET state='deleting' WHERE id=?").run(a.id);await assert.rejects(()=>stage(s,t),/削除|delet|競合|再試行/);assert.equal(s.sql.prepare('SELECT state FROM image_attachments WHERE id=?').get(a.id).state,'deleting');
});
test('unbound quota is bounded and rejects more objects without writing them',async()=>{
 const s=setup(),t=await task(s);for(let i=0;i<20;i++)await stage(s,t,'img-'+i);await assert.rejects(()=>stage(s,t,'overflow'),/未送信/);assert.equal(s.objects.size,20);assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM image_attachments').get().n,20);
});
test('browser attachment routes are authenticated; no public R2 URL or download-by-key entry point',()=>{
 const upload=readFileSync(new URL('../app/api/tasks/[id]/attachments/route.ts',import.meta.url),'utf8');const read=readFileSync(new URL('../app/api/attachments/[id]/route.ts',import.meta.url),'utf8');
 assert.match(upload,/api\(request/);assert.match(read,/verifyOwner|getChatGPTUser|api\(request/);assert.match(read,/nosniff/);assert.match(read,/private|no-store/);assert.doesNotMatch(upload,/publicUrl/);assert.doesNotMatch(read,/searchParams\.get\(['"]key/);
});

test('new user hooks fire only after commit and only once; seed, assistant replies and retries never wake dot',async()=>{
 const s=setup(),calls=[];const store=new TaskStore(s.db,undefined,async event=>{assert.deepEqual(Object.keys(event),['id']);const row=s.sql.prepare('SELECT * FROM messages WHERE id=?').get(event.id);assert.equal(row.role,'user');assert.equal(row.author_verified,1);assert.equal(row.historical_summary,0);calls.push(event.id);});
 const request={title:'task',description:'new owner request',clientId:'initial'};const t=await store.create(request,'owner');await store.create(request,'owner');assert.equal(calls.length,1);
 await store.seed({tasks:[{title:'Imported history',description:'historical text',clientId:'old'}]});await store.create({title:'empty',clientId:'empty'},'owner');assert.equal(calls.length,1);
 const p={text:'message',clientId:'post'};const [a,b]=await Promise.all([store.post(t.id,p,'owner'),store.post(t.id,p,'owner')]);assert.equal(a.id,b.id);assert.equal(calls.length,2);await store.post(t.id,p,'owner');assert.equal(calls.length,2);
 await store.reply({task_id:t.id,message_id:a.id,text:'reply',idempotency_key:'reply'});await store.postUpdate({task_id:t.id,text:'progress',idempotency_key:'progress'});await store.thread(t.id);await store.pending();assert.equal(calls.length,2);
 const image=await stage(s,t);const attached=await store.post(t.id,{clientId:'image',attachmentIds:[image.id]},'owner');assert.equal(calls.at(-1),attached.id);assert.equal(calls.length,3);
 const failing=new TaskStore(s.db,undefined,async()=>{throw new Error('event delivery failed');});const saved=await failing.post(t.id,{text:'persist despite event failure',clientId:'failure'},'owner');assert.equal(s.sql.prepare('SELECT delivery FROM messages WHERE id=?').get(saved.id).delivery,'pending');
});
test('cleanup cannot delete an image whose concurrent message binding won the deletion claim',async()=>{
 let bound=false;const s=setup({beforeRun:async(query,args,sql)=>{
  if(!bound&&query.startsWith("UPDATE image_attachments SET state='deleting'")&&query.includes('created_at')){
   const image=sql.prepare('SELECT * FROM image_attachments WHERE id=?').get(args[0]);bound=true;
   sql.prepare("INSERT INTO messages(id,task_id,client_id,role,text,created_at,delivery,author_verified,author_site_user_id) VALUES('race-message',?,'race-client','user','just committed',?,'pending',1,'owner')").run(image.task_id,new Date().toISOString());
   sql.prepare('UPDATE image_attachments SET message_id=? WHERE id=?').run('race-message',image.id);
  }
 }}),t=await task(s),a=await stage(s,t);const key=s.sql.prepare('SELECT object_key FROM image_attachments WHERE id=?').get(a.id).object_key;
 s.sql.prepare('UPDATE image_attachments SET created_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',a.id);
 await stage(s,t,'cleanup-trigger');assert.equal(bound,true);assert.equal(s.objects.has(key),true);assert.equal(s.sql.prepare('SELECT message_id FROM image_attachments WHERE id=?').get(a.id).message_id,'race-message');
});
const draftId='79c3d698-2679-48ca-8d24-3e6b49e48d94';
async function draftImage(s,client='draft-image',owner='owner',draft=draftId){return s.attachments.stageDraft(draft,owner,client,'portrait.png','image/png',png());}
test('new room stages privately without a task, then atomically commits image-only initial message and one event',async()=>{
 const s=setup();s.sql.exec('PRAGMA foreign_keys=ON');const events=[];s.store=new TaskStore(s.db,undefined,async m=>events.push(m.id));
 const image=await draftImage(s);assert.equal((await s.store.listTasks()).length,0);await assert.rejects(()=>s.attachments.read(image.id,'owner'),/not found/);
 const input={title:'画像の相談',description:'',clientId:'new-image-room',draftId,attachmentIds:[image.id]};
 const t=await s.store.create(input,'owner'),thread=await s.store.thread(t.id);
 assert.equal(thread.messages.length,1);assert.equal(thread.messages[0].authorVerified,true);assert.equal(thread.messages[0].text,'');assert.equal(thread.messages[0].attachments[0].id,image.id);assert.equal(events.length,1);
 assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM draft_image_attachments').get().n,0);assert.equal((await s.attachments.read(image.id,'owner')).metadata.id,image.id);
 await assert.rejects(()=>s.attachments.remove(image.id,'owner'),/送信済み/);await assert.rejects(()=>s.attachments.read(image.id,'other'),/not found/);
 assert.equal((await s.store.create(input,'owner')).id,t.id);assert.equal(events.length,1);
 await assert.rejects(()=>s.store.create({...input,description:'changed'},'owner'),/Idempotency/);
 await s.store.update(t.id,{title:'renamed'});assert.equal((await s.store.create(input,'owner')).id,t.id);
});
test('initial attachment scope, count, empty input and MIME defense leave no phantom room',async()=>{
 const s=setup();const image=await draftImage(s);const input={title:'draft',clientId:'scope',draftId,attachmentIds:[image.id]};
 await assert.rejects(()=>s.store.create(input,'other'),/画像を選び直して/);
 await assert.rejects(()=>s.store.create({...input,draftId:'80c3d698-2679-48ca-8d24-3e6b49e48d94'},'owner'),/画像を選び直して/);
 await assert.rejects(()=>s.store.create({...input,attachmentIds:[image.id,image.id]},'owner'),/4枚/);
 await assert.rejects(()=>s.store.create({...input,attachmentIds:[]},'owner'),/メッセージか画像/);
 await assert.rejects(()=>s.store.create({...input,draftId:'not-a-uuid'},'owner'),/Invalid draftId/);
 await assert.rejects(()=>s.attachments.stageDraft(draftId,'owner','svg','bad.svg','image/svg+xml',new TextEncoder().encode('<svg/>')),/JPEG|PNG|WebP|Unsupported|対応|画像/);
 assert.equal((await s.store.listTasks()).length,0);
});
test('new room upload and same-key create retries do not duplicate messages or emit events',async()=>{
 let failed=true;const s=setup({beforePut(){if(failed){failed=false;throw Error('temporary upload failure');}}});
 await assert.rejects(()=>draftImage(s),/temporary/);assert.equal((await s.store.listTasks()).length,0);
 const image=await draftImage(s);const input={title:'retry',description:'hello',clientId:'retry',draftId,attachmentIds:[image.id]};
 const events=[];s.store=new TaskStore(s.db,undefined,async m=>events.push(m.id));
 const results=await Promise.all([s.store.create(input,'owner'),s.store.create(input,'owner')]);assert.equal(results[0].id,results[1].id);assert.equal((await s.store.thread(results[0].id)).messages.length,1);assert.equal(events.length,1);
});
test('removed staged image cannot create an empty room after prevalidation races',async()=>{
 const s=setup(),image=await draftImage(s),original=s.db.batch;let once=true;
 s.db.batch=async statements=>{if(once){once=false;s.sql.prepare('DELETE FROM draft_image_attachments WHERE id=?').run(image.id);}return original(statements);};
 await assert.rejects(()=>s.store.create({title:'race',clientId:'race',draftId,attachmentIds:[image.id]},'owner'),/競合/);
 assert.equal((await s.store.listTasks()).length,0);assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
});
test('draft removal is owner scoped and upload idempotency cannot replace bytes',async()=>{
 const s=setup(),image=await draftImage(s);assert.equal((await draftImage(s)).id,image.id);
 await assert.rejects(()=>s.attachments.remove(image.id,'other'),/not found/);
 await assert.rejects(()=>s.attachments.stageDraft(draftId,'owner','draft-image','changed.png','image/png',png()),/already used/);
 await s.attachments.remove(image.id,'owner');assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM draft_image_attachments').get().n,0);assert.equal(s.objects.size,0);
});

async function stageAssistant(s,t,key='assistant-image'){return s.attachments.stageAssistant({task_id:t.id,filename:'slide.png',mime_type:'image/png',data_base64:Buffer.from(png()).toString('base64'),idempotency_key:key});}
test('assistant image stage is private, idempotent and has no role spoof or URL ingestion',async()=>{
 const s=setup(),t=await task(s),a=await stageAssistant(s,t);assert.equal((await stageAssistant(s,t)).id,a.id);assert.equal(s.puts(),1);await assert.rejects(()=>s.attachments.read(a.id,'owner'));
 const valid={task_id:t.id,filename:'slide.png',mime_type:'image/png',data_base64:Buffer.from(png()).toString('base64'),idempotency_key:'second'};
 for(const bad of [{...valid,url:'https://elsewhere.test/image.png'},{...valid,data_base64:'https://elsewhere.test/image.png'},{...valid,role:'user'},{...valid,mime_type:'image/jpeg'},{...valid,data_base64:Buffer.from('<svg/>').toString('base64')},{...valid,data_base64:'YQ=Z'},{...valid,data_base64:'YQ==\n'},{...valid,data_base64:'AB=='},{...valid,data_base64:'A'.repeat(4*Math.ceil(4*1024*1024/3)+4)}])await assert.rejects(()=>s.attachments.stageAssistant(bad));
 assert.equal(s.puts(),1);await assert.rejects(()=>stage(s,t,'reserved','!assistant-image:v1'),/Reserved/);
});
test('assistant reply atomically binds image and acknowledges once with assistant provenance',async()=>{
 const s=setup(),t=await task(s),u=await s.store.post(t.id,{text:'please show slide',clientId:'u'},'owner'),a=await stageAssistant(s,t);let notified=0;const store=new TaskStore(s.db,async()=>notified++);
 const req={task_id:t.id,message_id:u.id,text:'',attachment_ids:[a.id],idempotency_key:'reply-image'};const r=await store.reply(req);assert.equal(r.role,'assistant');assert.equal(r.authorVerified,false);assert.equal(r.authorSiteUserId,null);assert.deepEqual(r.attachments.map(a=>a.id),[a.id]);assert.equal((await store.reply(req)).id,r.id);assert.equal(notified,1);assert.equal((await store.pending()).length,0);
 const loaded=await s.attachments.read(a.id,'owner');assert.deepEqual(new Uint8Array(await loaded.object.arrayBuffer()),png());assert.equal((await s.attachments.imageContent(a.id)).mimeType,'image/png');
 await assert.rejects(()=>store.reply({...req,text:'different'}),/Idempotency/);await assert.rejects(()=>store.reply({...req,text:'other',attachment_ids:[]}),/Idempotency/);
});
test('assistant/user images cannot cross author or task boundaries and failed reply never acknowledges',async()=>{
 const s=setup(),t=await task(s),other=await task(s,'other'),u=await s.store.post(t.id,{text:'ask',clientId:'u'},'owner'),user=await stage(s,t),a=await stageAssistant(s,t);
 await assert.rejects(()=>s.store.post(t.id,{text:'spoof',clientId:'spoof',attachmentIds:[a.id]},'owner'));
 await assert.rejects(()=>s.store.post(t.id,{text:'spoof',clientId:'spoof2',attachmentIds:[a.id]},'!assistant-image:v1'));
 for(const ids of [[user.id],[a.id,a.id],[a.id,' '+a.id],[a.id,'missing'],Array(5).fill(a.id)])await assert.rejects(()=>s.store.reply({task_id:t.id,message_id:u.id,text:'x',attachment_ids:ids,idempotency_key:'r'}));
 await assert.rejects(()=>s.store.postUpdate({task_id:other.id,text:'x',attachment_ids:[a.id],idempotency_key:'cross-task'}));
 assert.equal((await s.store.pending()).length,1);assert.equal(s.sql.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n,0);assert.equal(s.sql.prepare('SELECT message_id FROM image_attachments WHERE id=?').get(a.id).message_id,null);
});
test('assistant image post updates are payload-idempotent and cannot consume an image twice',async()=>{
 const s=setup(),t=await task(s),a=await stageAssistant(s,t),u=await s.store.post(t.id,{text:'show me',clientId:'u'},'owner');const req={task_id:t.id,text:'slide',attachment_ids:[a.id],source_message_id:u.id,idempotency_key:'update-image'};
 const results=await Promise.all([s.store.postUpdate(req),s.store.postUpdate(req)]);assert.equal(results[0].id,results[1].id);assert.equal((await s.store.pending()).length,1);
 await assert.rejects(()=>s.store.postUpdate({...req,idempotency_key:'reuse'}));await assert.rejects(()=>s.store.postUpdate({...req,attachment_ids:[]}));await assert.rejects(()=>s.store.postUpdate({...req,text:'changed'}));
 const row=s.sql.prepare('SELECT message_id FROM image_attachments WHERE id=?').get(a.id);assert.equal(row.message_id,results[0].id);
 // A corrupt author binding fails closed on image retrieval.
 s.sql.prepare('UPDATE messages SET author_verified=1 WHERE id=?').run(results[0].id);await assert.rejects(()=>s.attachments.read(a.id,'owner'),/not found/);
});
test('assistant concurrent distinct replies never duplicate or partially bind',async()=>{
 const s=setup(),t=await task(s),u=await s.store.post(t.id,{text:'ask',clientId:'u'},'owner'),a=await stageAssistant(s,t),b=await stageAssistant(s,t,'b');
 const results=await Promise.allSettled([s.store.reply({task_id:t.id,message_id:u.id,text:'a',attachment_ids:[a.id],idempotency_key:'a'}),s.store.reply({task_id:t.id,message_id:u.id,text:'b',attachment_ids:[b.id],idempotency_key:'b'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.sql.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n,1);assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM image_attachments WHERE message_id IS NOT NULL').get().n,1);assert.equal((await s.store.pending()).length,0);
});
test('assistant bind races with removal safely without acknowledging or posting',async()=>{
 const s=setup(),t=await task(s),u=await s.store.post(t.id,{text:'ask',clientId:'u'},'owner'),a=await stageAssistant(s,t);const original=s.db.batch;s.db.batch=async statements=>{s.sql.prepare("UPDATE image_attachments SET state='deleting' WHERE id=?").run(a.id);return original(statements);};
 await assert.rejects(()=>s.store.reply({task_id:t.id,message_id:u.id,text:'slide',attachment_ids:[a.id],idempotency_key:'race'}),/could not be committed/);assert.equal((await s.store.pending()).length,1);assert.equal(s.sql.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n,0);
});
test('MCP image tool keeps large-body exception specific and authenticated protected image reads',()=>{
 const route=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8'),api=readFileSync(new URL('../lib/task-api.ts',import.meta.url),'utf8'),get=readFileSync(new URL('../app/api/attachments/[id]/route.ts',import.meta.url),'utf8');assert(route.includes('verifyMcpHeaders(request.headers,runtimeOwner())'));assert(route.includes("name==='upload_assistant_image'"));assert(route.includes('length>200000'));assert(route.includes('attachment_ids:attachmentIds'));assert(api.includes('total>maxBytes'));assert(api.includes('reader.cancel()'));assert(get.includes('verifyOwner(await getChatGPTUser(),runtimeOwner())'));assert(get.includes("'Cache-Control':'private, no-store'"));
});
test('assistant commit DB failure rolls back both image binding and user acknowledgement',async()=>{
 const s=setup(),t=await task(s),u=await s.store.post(t.id,{text:'ask',clientId:'u'},'owner'),a=await stageAssistant(s,t);
 const original=s.db.prepare;s.db.prepare=query=>{const result=original(query);if(query.startsWith('UPDATE tasks SET updated_at=? WHERE'))result.execute=()=>{throw Error('injected DB failure');};return result;};
 await assert.rejects(()=>s.store.reply({task_id:t.id,message_id:u.id,text:'slide',attachment_ids:[a.id],idempotency_key:'rollback'}),/injected/);assert.equal((await s.store.pending()).length,1);assert.equal(s.sql.prepare('SELECT message_id FROM image_attachments WHERE id=?').get(a.id).message_id,null);assert.equal(s.sql.prepare("SELECT COUNT(*) n FROM messages WHERE role='assistant'").get().n,0);
});

test('bounded base64 decoding preserves every byte and boundary after optimized copy',()=>{for(const length of [1,2,3,255,256,257,4096,MAX_ASSISTANT_IMAGE_BYTES]){const input=Buffer.alloc(length);for(let i=0;i<input.length;i++)input[i]=i%256;assert.deepEqual(Buffer.from(assistantImageBytes(input.toString('base64'))),input);}assert.throws(()=>assistantImageBytes(Buffer.alloc(MAX_ASSISTANT_IMAGE_BYTES+1).toString('base64')));for(const value of ['AB==','YQ=Z','YQ==\n','===='])assert.throws(()=>assistantImageBytes(value));});
