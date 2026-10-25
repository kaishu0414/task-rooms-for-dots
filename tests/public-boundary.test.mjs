import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const contract=readFileSync(new URL('../lib/task-contract.ts',import.meta.url),'utf8');
const js=ts.transpileModule(contract,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ownerConfig,verifyOwner,verifyMcpHeaders,ApiError,historyPreview}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const owner={email:'owner@taskrooms.example',userId:'site-owner-fixture'};
const env={TASKROOM_OWNER_EMAIL:owner.email,TASKROOM_OWNER_USER_ID:owner.userId};
const headers=(email=owner.email,id=owner.userId)=>new Headers({'oai-authenticated-user-email':email,'oai-authenticated-user-id':id});
test('empty or placeholder owner configuration is closed, never wildcard/default',()=>{
 for(const value of [{},{TASKROOM_OWNER_EMAIL:owner.email},{TASKROOM_OWNER_USER_ID:owner.userId},{...env,TASKROOM_OWNER_EMAIL:'owner@example.test'},{...env,TASKROOM_OWNER_USER_ID:'REPLACE_ME'},{...env,TASKROOM_OWNER_EMAIL:'bad'}])assert.throws(()=>ownerConfig(value),e=>e.status===503);
 assert.deepEqual(ownerConfig(env),owner);assert.throws(()=>verifyOwner({email:owner.email,userId:owner.userId}),e=>e.status===503);
});
test('browser and MCP require BOTH exact Site-scoped identity and owner email',()=>{
 for(const candidate of [null,{email:owner.email,userId:'wrong-site-id'},{email:'other@taskrooms.example',userId:owner.userId},{email:owner.email,userId:''}])assert.throws(()=>verifyOwner(candidate,owner));
 for(const h of [new Headers(),new Headers({'oai-authenticated-user-email':owner.email}),new Headers({'oai-authenticated-user-id':owner.userId}),headers(owner.email,'wrong-site-id'),headers('other@taskrooms.example')])assert.throws(()=>verifyMcpHeaders(h,owner));
 assert.equal(verifyMcpHeaders(headers(),owner).userId,owner.userId);
});
test('all MCP methods are denied before discovery, data, image, or subscription access',async()=>{
 const src=readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8');
 const stripped=src.replace(/^import .*;\n/gm,'');
 const injected=`const historyPreview=globalThis.__taskroomTest.historyPreview; const ApiError=globalThis.__taskroomTest.ApiError; const verifyMcpHeaders=globalThis.__taskroomTest.verify; const runtimeOwner=()=>globalThis.__taskroomTest.config; const MAX_ASSISTANT_IMAGE_BYTES=4*1024*1024; const activityInputSchema={},progressInputSchema={}; const logMcpEventResult=()=>{}; class McpEventError extends Error{}; const response=(data,status=200)=>Response.json(data,{status}); const body=async r=>r.json(); const object=v=>v; const validateOrigin=()=>{}; const denied=()=>{throw Error('storage accessed before auth')}; const taskStore=denied,attachmentStore=denied,eventStore=denied;\n`;
 const moduleCode=ts.transpileModule(injected+stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 globalThis.__taskroomTest={ApiError,historyPreview,verify:verifyMcpHeaders,config:owner};
 try{const route=await import('data:text/javascript;base64,'+Buffer.from(moduleCode).toString('base64'));
  for(const method of ['server/discover','tools/list','tools/call','events/list','events/subscribe','events/unsubscribe']){
   for(const h of [new Headers(),headers(owner.email,'wrong-site-id')]){const response=await route.POST(new Request('https://taskrooms.example/mcp',{method:'POST',headers:h,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{name:'list_tasks'}})}));assert([401,403].includes(response.status));assert(!(await response.text()).includes('storage accessed'));}
  }
  const preview=await route.POST(new Request('https://taskrooms.example/mcp',{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'preview_history_import',arguments:{tasks:[{clientId:'selected',title:'Fictional title',summary:'Selected historical text only'}]}}})}));assert.equal(preview.status,200);const value=await preview.json();assert.equal(value.result.isError,false);assert.equal(JSON.parse(value.result.content[0].text).tasks.length,1);
  globalThis.__taskroomTest.config=undefined;const missing=await route.POST(new Request('https://taskrooms.example/mcp',{method:'POST',headers:headers(),body:'{}'}));assert.equal(missing.status,503);
 }finally{delete globalThis.__taskroomTest;}
});
test('empty migrations create no account, task, message, subscription, or fixture data',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())assert.equal(db.prepare(`SELECT count(*) n FROM "${name}"`).get().n,0,name);
 assert.equal(existsSync(new URL('../operations',import.meta.url)),false);assert.equal(existsSync(new URL('../app/api/import-existing',import.meta.url)),false);
});
test('public template has no auto identity mocking or generated private manifest',()=>{
 const vite=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');assert(vite.includes('mockAuth:false'));assert(vite.includes('127.0.0.1'));
 const manifest=JSON.parse(readFileSync(new URL('../.openai/hosting.example.json',import.meta.url),'utf8'));assert(!('project_id' in manifest));assert.equal(existsSync(new URL('../.openai/hosting.json',import.meta.url)),false);
});

test('bootstrap endpoint reveals only configured owner current Site ID and never touches storage',async()=>{
 const helpers=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const source=readFileSync(new URL('../app/api/setup/identity/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const setup=`const {ApiError,verifySetupOwner}=globalThis.__setupTest.helpers;const env=globalThis.__setupTest.env;const getChatGPTUser=async()=>globalThis.__setupTest.user;\n`;
 const code=ts.transpileModule(setup+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const state={helpers,env:{TASKROOM_OWNER_EMAIL:owner.email},user:{email:owner.email,userId:owner.userId}};globalThis.__setupTest=state;
 try{const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  let response=await route.GET();assert.equal(response.status,200);assert.deepEqual(await response.json(),{siteUserId:owner.userId});assert.match(response.headers.get('cache-control'),/private, no-store/);
  for(const user of [null,{email:'other@taskrooms.example',userId:owner.userId},{email:owner.email,userId:''},{email:owner.email,userId:'bad identity'}]){state.user=user;response=await route.GET();assert([401,403].includes(response.status));assert(!Object.hasOwn(await response.json(),'siteUserId'));}
  state.user={email:owner.email,userId:owner.userId};state.env.TASKROOM_OWNER_EMAIL='';assert.equal((await route.GET()).status,503);state.env.TASKROOM_OWNER_EMAIL='owner@example.test';assert.equal((await route.GET()).status,503);state.env.TASKROOM_OWNER_EMAIL=owner.email;state.env.TASKROOM_OWNER_USER_ID='different-id';assert.equal((await route.GET()).status,403);state.env.TASKROOM_OWNER_USER_ID=owner.userId;assert.equal((await route.GET()).status,200);
  assert(!/taskStore|attachmentStore|eventStore|\.DB|\.BUCKET/.test(source));
 }finally{delete globalThis.__setupTest;}
});
test('display names are bounded presentation only and cannot authorize any owner',async()=>{
 const {displayNames}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 assert.deepEqual(displayNames({}),{owner:'あなた',assistant:'dot'});assert.deepEqual(displayNames({TASKROOM_OWNER_DISPLAY_NAME:' Sample User ',TASKROOM_ASSISTANT_DISPLAY_NAME:'Sample Dot'}),{owner:'Sample User',assistant:'Sample Dot'});
 for(const value of ['x'.repeat(41),'<script>','name\ncontrol','   '])assert.throws(()=>displayNames({TASKROOM_OWNER_DISPLAY_NAME:value}));
 assert.throws(()=>ownerConfig({TASKROOM_OWNER_DISPLAY_NAME:owner.email,TASKROOM_ASSISTANT_DISPLAY_NAME:owner.userId}),e=>e.status===503);
});

test('long display names cannot expand two-column status filters; full labels remain available',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8'),room=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));assert(css.includes('.status-navigation button>span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'));assert(room.includes('title={group.label}'));
});
