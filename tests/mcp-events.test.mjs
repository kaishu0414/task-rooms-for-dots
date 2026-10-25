import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import ts from 'typescript';
const dir = mkdtempSync(join(tmpdir(), 'mcp-events-tests-'));
for (const name of ['task-contract','push-crypto','mcp-events']) {
 let source = readFileSync(new URL('../lib/'+name+'.ts', import.meta.url),'utf8').replaceAll("'./task-contract'", "'./task-contract.mjs'").replaceAll("'./push-crypto'", "'./push-crypto.mjs'");
 writeFileSync(join(dir,name+'.mjs'), ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const { McpEventStore, mcpEventsConfig, mcpEventCatalog, validateCallback, eventOwner, isPublicAddress, parseCallbackDnsAnswer, publicCallbackAddresses, standardWebhookSignature, MCP_USER_MESSAGE_EVENT } = await import(join(dir,'mcp-events.mjs'));
const encryption = randomBytes(32).toString('base64url');
const config = () => mcpEventsConfig({MCP_EVENTS_ENCRYPTION_KEY:encryption,MCP_EVENTS_CALLBACK_ORIGINS:'["https://chatgpt.com"]'});
const owner={email:'owner@example.test',userId:'owner'};
const secret = () => 'whsec_'+randomBytes(32).toString('base64');
const modernMeta = {
 'io.modelcontextprotocol/protocolVersion':'2026-07-28',
 'io.modelcontextprotocol/clientInfo':{name:'ExampleClient',version:'1.0.0'},
 'io.modelcontextprotocol/clientCapabilities':{},
};
const request = (options={}) => ({name:MCP_USER_MESSAGE_EVENT,arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/callback_test',secret:secret()},...options});
const dns = async () => ['104.18.32.7','2606:4700::6812:2007'];
function setup(sender=async(_url, init) => { const body=JSON.parse(init.body); return Response.json(body.type==='verification'?{challenge:body.challenge}:{}); },resolver=dns){
 const sql = new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(query){let args=[];return{bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};}};
 const events = new McpEventStore(db, config(), sender, resolver, async()=>{});
 sql.prepare("INSERT INTO tasks(id,client_id,title,status,summary,category,updated_at,links) VALUES('task','task-client','Sensitive financial title','backlog','','相談',?,'[]')").run(new Date().toISOString());
 sql.prepare("INSERT INTO tasks(id,client_id,title,status,summary,category,updated_at,links) VALUES('other','other-client','Other confidential title','backlog','','相談',?,'[]')").run(new Date().toISOString());
 function message(id,overrides={}){
  const r={id,task_id:'task',client_id:'client-'+id,role:'user',text:'Financial secrets must not leave the Site',created_at:new Date().toISOString(),delivery:'pending',author_verified:1,author_site_user_id:'owner',historical_summary:0,...overrides};
  sql.prepare('INSERT INTO messages('+Object.keys(r).join(',')+') VALUES('+Object.keys(r).map(()=>'?').join(',')+')').run(...Object.values(r)); return {id};
 }
 return{sql,db,events,message};
}
test('event catalog is ID-only and owner identity cannot use legacy no-identity service access',()=>{
 const event=mcpEventCatalog().events[0];assert.equal(event.name,'user_message.created');assert.deepEqual(Object.keys(event.payloadSchema.properties).sort(),['message_id','task_id']);assert.equal(event.payloadSchema.additionalProperties,false);
 assert.equal(eventOwner(new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}),owner),'owner');
 for(const headers of [{},{'oai-authenticated-user-email':'owner@example.test'},{'oai-authenticated-user-id':'x','oai-authenticated-user-email':'other@example.com'}])assert.throws(()=>eventOwner(new Headers(headers),owner),/Sign in|Owner/);
 assert.throws(()=>mcpEventCatalog({cursor:'invented'}));
});
test('event catalog accepts MCP request metadata without loosening event parameter validation',()=>{
 const expected=mcpEventCatalog();
 assert.deepEqual(mcpEventCatalog({_meta:modernMeta}),expected);
 assert.deepEqual(mcpEventCatalog({cursor:null,_meta:{}}),expected);
 for(const meta of [null,[],false,1,'metadata'])assert.throws(()=>mcpEventCatalog({_meta:meta}),/Object required/);
 assert.throws(()=>mcpEventCatalog({_meta:modernMeta,unknown:true}),/Unknown field/);
 assert.throws(()=>mcpEventCatalog({_meta:modernMeta,cursor:'invented'}),/Unknown event cursor/);
});
test('subscription lifecycle accepts metadata only at the request envelope and never uses it as identity',async()=>{
 const{events,sql}=setup();const input=request();
 const first=await events.subscribe('owner',{...input,_meta:modernMeta});
 const refreshed=await events.subscribe('owner',{...input,_meta:{...modernMeta,owner_site_user_id:'other-owner'}});
 assert.equal(refreshed.id,first.id);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,1);
 assert.equal(sql.prepare('SELECT owner_site_user_id FROM mcp_event_subscriptions').get().owner_site_user_id,'owner');
 for(const meta of [null,[],false,1,'metadata']){
  await assert.rejects(()=>events.subscribe('owner',{...input,_meta:meta}),/Object required/);
  await assert.rejects(()=>events.unsubscribe('owner',{name:input.name,arguments:{},delivery:{mode:'webhook',url:input.delivery.url},_meta:meta}),/Object required/);
 }
 await assert.rejects(()=>events.subscribe('owner',{...input,_meta:modernMeta,unknown:true}),/Unknown field/);
 await assert.rejects(()=>events.subscribe('owner',{...input,_meta:modernMeta,arguments:{_meta:{}}}),/Unknown field/);
 await assert.rejects(()=>events.subscribe('owner',{...input,_meta:modernMeta,delivery:{...input.delivery,_meta:{}}}),/Unknown field/);
 const stop={name:input.name,arguments:{},delivery:{mode:'webhook',url:input.delivery.url},_meta:modernMeta};
 await assert.rejects(()=>events.unsubscribe('owner',{...stop,unknown:true}),/Unknown field/);
 await events.unsubscribe('other-owner',stop);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,1);
 await events.unsubscribe('owner',stop);await events.unsubscribe('owner',stop);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
});
test('security config and callback origins are fail closed, exact and server-owned',()=>{
 assert.equal(mcpEventsConfig({}),null);assert.equal(mcpEventsConfig({MCP_EVENTS_ENCRYPTION_KEY:'x'}),null);
 for(const origins of ['[]','["https://evil.test"]','["https://chatgpt.com/"]','["http://chatgpt.com"]','["https://chatgpt.com:8443"]'])assert.equal(mcpEventsConfig({MCP_EVENTS_ENCRYPTION_KEY:encryption,MCP_EVENTS_CALLBACK_ORIGINS:origins}),null);
 for(const url of ['https://127.0.0.1/x','http://chatgpt.com/x','https://chatgpt.com.evil.test/x','https://evil.chatgpt.com/x','https://user:pass@chatgpt.com/x','https://chatgpt.com:8443/x','https://chatgpt.com/x#fragment','https://chatgpt.com\\@evil.test/x'])assert.throws(()=>validateCallback(url,config().callbackOrigins));
 assert.equal(validateCallback('https://chatgpt.com/mcp-events/callback_test',config().callbackOrigins),'https://chatgpt.com/mcp-events/callback_test');
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','0.0.0.0','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::1'])assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['104.18.32.7','8.8.8.8','2606:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(ip),true,ip);
});
const dnsHost='connectors.api.openai.com', dnsAlias='connectors.api.openai.com.cdn.cloudflare.net';
const dnsAnswer=(family, records)=>({Status:0,TC:false,Question:[{name:dnsHost,type:family===4?1:28}],Answer:records});
const cname=(name=dnsHost,data=dnsAlias+'.')=>({name,type:5,TTL:30,data});
const address=(family,data,name=dnsAlias)=>({name,type:family===4?1:28,TTL:300,data});
test('typed DoH parsing handles actual Cloudflare CNAME+A/AAAA shape without treating aliases as IPs',()=>{
 const ipv4=['104.18.38.184','172.64.149.72'],ipv6=['2a06:98c1:3103::6812:26b8','2a06:98c1:310b::ac40:9548'];
 for(const[family,ips]of[[4,ipv4],[6,ipv6]])assert.deepEqual(parseCallbackDnsAnswer(dnsAnswer(family,[cname(),...ips.map(ip=>address(family,ip))]),dnsHost,family),ips);
 assert.deepEqual(parseCallbackDnsAnswer(dnsAnswer(4,[cname(dnsHost,'second.example.com.'),cname('second.example.com',dnsAlias+'.'),address(4,ipv4[0])]),dnsHost,4),[ipv4[0]]);
 assert.deepEqual(parseCallbackDnsAnswer(dnsAnswer(6,[cname()]),dnsHost,6),[]); // Valid NODATA for one address family.
 assert.deepEqual(parseCallbackDnsAnswer({...dnsAnswer(6,[]),Answer:undefined},dnsHost,6),[]);
});
test('typed DoH parsing rejects private/malformed/mixed records and disconnected or cyclic CNAME chains',()=>{
 const valid=dnsAnswer(4,[cname(),address(4,'104.18.38.184')]);
 for(const value of [null,[],{}, {...valid,Status:3},{...valid,TC:true},{...valid,Question:[{name:'other.example.com',type:1}]},{...valid,Question:[{name:dnsHost,type:28}]},{...valid,Answer:{}},
  dnsAnswer(4,[cname(),address(4,'104.18.38.184'),address(4,'10.0.0.1')]),
  dnsAnswer(4,[cname(),address(4,'not-an-IP')]),dnsAnswer(4,[cname(),address(6,'2a06:98c1:3103::6812:26b8')]),
  dnsAnswer(4,[cname(),{name:dnsAlias,type:16,data:'ignore me'}]),
  dnsAnswer(4,[cname(),cname(dnsAlias,dnsHost),address(4,'104.18.38.184')]),
  dnsAnswer(4,[cname('unrelated.example.com'),address(4,'104.18.38.184',dnsHost)]),
  dnsAnswer(4,[cname(),address(4,'104.18.38.184','unrelated.example.com')]),
  dnsAnswer(4,[cname(),cname(dnsHost,'other.example.com'),address(4,'104.18.38.184')]),
  dnsAnswer(4,[cname(dnsHost,'127.0.0.1'),address(4,'104.18.38.184')]),
  dnsAnswer(4,['104.18.38.184',dnsAlias+'.']),
 ])assert.throws(()=>parseCallbackDnsAnswer(value,dnsHost,4));
 assert.throws(()=>parseCallbackDnsAnswer(dnsAnswer(6,[cname(),address(6,'2a06:98c1:3103::6812:26b8'),address(6,'fc00::1')]),dnsHost,6),/non-public/);
 const longChain=Array.from({length:9},(_,i)=>cname(i===0?dnsHost:'hop'+i+'.example.com','hop'+(i+1)+'.example.com'));
 assert.throws(()=>parseCallbackDnsAnswer(dnsAnswer(4,longChain),dnsHost,4));
});
test('public DNS uses only the fixed Cloudflare HTTPS endpoint, typed queries, no credentials, and manual redirects',async()=>{
 const requests=[];
 const sender=async(url,init)=>{requests.push({url,init});const parsed=new URL(url),family=parsed.searchParams.get('type')==='A'?4:6;
  assert.equal(parsed.origin,'https://cloudflare-dns.com');assert.equal(parsed.pathname,'/dns-query');assert.deepEqual([...parsed.searchParams.keys()],['name','type']);assert.equal(parsed.searchParams.get('name'),dnsHost);
  assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.deepEqual(init.headers,{Accept:'application/dns-json'});assert.equal(init.body,undefined);
  return Response.json(dnsAnswer(family,[cname(),address(family,family===4?'104.18.38.184':'2a06:98c1:3103::6812:26b8')]));};
 assert.deepEqual(await publicCallbackAddresses(dnsHost,sender),['104.18.38.184','2a06:98c1:3103::6812:26b8']);assert.equal(requests.length,2);
 await assert.rejects(()=>publicCallbackAddresses('https://'+dnsHost+'/path?secret=value',sender));assert.equal(requests.length,2);
});
test('DNS transport fails closed for redirects, HTTP/type/size errors, malformed JSON and empty address sets',async()=>{
 for(const response of [()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}),()=>new Response(null,{status:500}),()=>new Response('{}',{headers:{'content-type':'text/html'}}),()=>new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}}),()=>new Response('{',{headers:{'content-type':'application/json'}}),()=>Response.json({Status:2})])await assert.rejects(()=>publicCallbackAddresses(dnsHost,async()=>response()));
 await assert.rejects(()=>publicCallbackAddresses(dnsHost,async url=>Response.json(dnsAnswer(new URL(url).searchParams.get('type')==='A'?4:6,[]))),/non-public/);
 await assert.rejects(()=>publicCallbackAddresses(dnsHost,async()=>{throw new Error('DUMMY_SECRET_NEVER_LOG');}),err=>!err.message.includes('DUMMY_SECRET_NEVER_LOG'));
});
test('DNS transport has a bounded deadline even when the sender never resolves',async()=>{
 const started=Date.now();await assert.rejects(()=>publicCallbackAddresses(dnsHost,async()=>new Promise(()=>{})),/timed out/);assert(Date.now()-started<5000);
});
test('Standard Webhooks HMAC is independently verified over exact serialized bytes',async()=>{
 const key=secret(),body=JSON.stringify({eventId:'event-one',data:{task_id:'task',message_id:'message'}}),timestamp=1792828800;
 const signature=await standardWebhookSignature(key,'event-one',timestamp,body);
 assert.equal(signature,'v1,'+createHmac('sha256',Buffer.from(key.slice(6),'base64')).update('event-one.'+timestamp+'.'+body).digest('base64'));
 await assert.rejects(()=>standardWebhookSignature('whsec_AAAA','event-one',timestamp,body));
});
test('subscribe verifies challenge and signature before saving encrypted callback/secret; refresh is idempotent',async()=>{
 const sent=[];const input=request();const{events,sql}=setup(async(url,init)=>{sent.push({url,init});const payload=JSON.parse(init.body);assert.equal(payload.type,'verification');assert.equal(init.redirect,'manual');assert.equal(init.headers['webhook-signature'],'v1,'+createHmac('sha256',Buffer.from(input.delivery.secret.slice(6),'base64')).update(init.headers['webhook-id']+'.'+init.headers['webhook-timestamp']+'.'+init.body).digest('base64'));return Response.json({challenge:payload.challenge});});
 const sub=await events.subscribe('owner',input);assert.match(sub.id,/^sub_/);assert.equal(sub.cursor,null);assert.equal(sub.truncated,false);assert(Date.parse(sub.refreshBefore)>Date.now());
 const repeated=await events.subscribe('owner',input);assert.equal(repeated.id,sub.id);assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,1);
 const stored=JSON.stringify(sql.prepare('SELECT * FROM mcp_event_subscriptions').get());assert(!stored.includes(input.delivery.secret));assert(!stored.includes('callback_test'));assert(!JSON.stringify(sub).includes('whsec_'));
 assert.equal(sent.length,2);
});
test('failed challenge, redirect, DNS-private and invalid inputs store no subscription and do not leak details',async()=>{
 for(const sender of [async()=>Response.json({challenge:'wrong'}),async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}),async()=>{throw new Error('SECRET URL must not escape');},async()=>new Response('x'.repeat(5000))]){
  const{events,sql}=setup(sender);await assert.rejects(()=>events.subscribe('owner',request()),err=>{assert(!err.message.includes('SECRET'));return true;});assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
 }
 let sends=0;const{events,sql}=setup(async()=>{sends++;return new Response();},async()=>['127.0.0.1']);await assert.rejects(()=>events.subscribe('owner',request()),/non-public/);assert.equal(sends,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
 const normal=setup();for(const value of [request({name:'assistant.created'}),request({cursor:'replay'}),request({ttlMs:-1}),request({arguments:{role:'assistant'}}),request({arguments:{task_id:'missing'}}),request({delivery:{mode:'stream',url:'https://chatgpt.com/x',secret:secret()}})])await assert.rejects(()=>normal.events.subscribe('owner',value));
});
test('only committed verified owner posts emit IDs, once; foreign, system, assistant and read messages do not',async()=>{
 const deliveries=[];const{events,message,sql}=setup(async(url,init)=>{const body=JSON.parse(init.body);if(body.type==='verification')return Response.json({challenge:body.challenge});deliveries.push({url,init,body});return new Response(null,{status:204});});
 await events.subscribe('owner',request());
 const m=message('message-one',{attachment_json:JSON.stringify([{id:'image-secret',name:'confidential.png'}])});await events.deliver({...m,role:'assistant',text:'ignored'});await events.deliver(m);
 for(const [id,overrides] of [['system',{role:'system',author_verified:0,historical_summary:1}],['assistant',{role:'assistant'}],['foreign',{author_site_user_id:'other-owner'}],['read',{delivery:'read'}],['unverified',{author_verified:0}],['summary',{historical_summary:1}]])await events.deliver(message(id,overrides));
 assert.equal(deliveries.length,1);const sent=deliveries[0];assert.deepEqual(sent.body.data,{task_id:'task',message_id:'message-one'});assert.equal(sent.body.name,MCP_USER_MESSAGE_EVENT);assert.equal(sent.init.headers['webhook-id'],sent.body.eventId);assert(!JSON.stringify(sent).includes('Financial'));assert(!JSON.stringify(sent).includes('confidential.png'));assert(!JSON.stringify(sent).includes('image-secret'));assert.equal(sql.prepare('SELECT status FROM mcp_event_deliveries').get().status,'accepted');
});
test('filters, expiry and owner scoping are rechecked; unsubscribe is idempotent and stops delivery',async()=>{
 let count=0;const{events,message,sql}=setup(async(_url,init)=>{const body=JSON.parse(init.body);if(body.type==='verification')return Response.json({challenge:body.challenge});count++;return new Response();});
 const input=request({arguments:{task_id:'task'}}),sub=await events.subscribe('owner',input);
 await events.deliver(message('other-task',{task_id:'other'}));assert.equal(count,0);
 const unsubscribe={name:input.name,arguments:input.arguments,delivery:{mode:'webhook',url:input.delivery.url}};
 await events.unsubscribe('not-owner',unsubscribe);await events.deliver(message('owner-message'));assert.equal(count,1);
 sql.prepare('UPDATE mcp_event_subscriptions SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',sub.id);await events.deliver(message('expired'));assert.equal(count,1);
 await events.subscribe('owner',input);await events.unsubscribe('owner',unsubscribe);await events.unsubscribe('owner',unsubscribe);await events.deliver(message('unsubscribed'));assert.equal(count,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
});
test('transient delivery retries are bounded and preserve event ID; 410 and 413 are terminal',async()=>{
 let sends=[];let fail=2;const{events,message,sql}=setup(async(_url,init)=>{const body=JSON.parse(init.body);if(body.type==='verification')return Response.json({challenge:body.challenge});sends.push(body);return new Response(null,{status:fail-->0?503:204});});
 await events.subscribe('owner',request());await events.deliver(message('retry'));assert.equal(sends.length,3);assert.equal(new Set(sends.map(b=>b.eventId)).size,1);assert.equal(sql.prepare('SELECT status,attempts FROM mcp_event_deliveries').get().status,'accepted');assert.equal(sql.prepare('SELECT attempts FROM mcp_event_deliveries').get().attempts,3);
 for(const status of [410,413,302,400]){
  let count=0;const s=setup(async(_url,init)=>{const body=JSON.parse(init.body);if(body.type==='verification')return Response.json({challenge:body.challenge});count++;return new Response(null,{status});});await s.events.subscribe('owner',request());await s.events.deliver(s.message('terminal'));assert.equal(count,1);assert.equal(s.sql.prepare('SELECT status FROM mcp_event_deliveries').get().status,'rejected');if(status===410)assert.equal(s.sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
 }
});
test('duplicate concurrent delivery claims send once; permanent network errors do not acknowledge user messages',async()=>{
 let count=0;const{events,message,sql}=setup(async(_url,init)=>{const body=JSON.parse(init.body);if(body.type==='verification')return Response.json({challenge:body.challenge});count++;throw new Error('network secret');});await events.subscribe('owner',request());const m=message('concurrent');await Promise.all([events.deliver(m),events.deliver(m)]);assert.equal(count,3);assert.equal(sql.prepare('SELECT delivery FROM messages WHERE id=?').get(m.id).delivery,'pending');assert.equal(sql.prepare('SELECT status FROM mcp_event_deliveries').get().status,'failed');
});
test('subscription capacity and requested lifetime are bounded',async()=>{
 const{events,sql}=setup();for(let i=0;i<5;i++)await events.subscribe('owner',request({delivery:{mode:'webhook',url:'https://chatgpt.com/callback_'+i,secret:secret()}}));await assert.rejects(()=>events.subscribe('owner',request({delivery:{mode:'webhook',url:'https://chatgpt.com/callback_6',secret:secret()}})),/At most 5/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,5);
 const s=setup();const before=Date.now();const sub=await s.events.subscribe('owner',request({ttlMs:5000}));assert(Date.parse(sub.refreshBefore)>=before+5000);assert(Date.parse(sub.refreshBefore)<Date.now()+5001);
});
