import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'mcp-event-diagnostics-'));
const source=readFileSync(new URL('../lib/mcp-event-diagnostics.ts',import.meta.url),'utf8');
writeFileSync(join(dir,'diagnostics.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const{mcpEventDiagnostic,logMcpEventResult}=await import(join(dir,'diagnostics.mjs'));
const sensitive='DUMMY_SECRET_NEVER_LOG';
const input={name:sensitive,arguments:{task_id:sensitive,[sensitive]:sensitive},delivery:{mode:sensitive,url:'https://chatgpt.com/'+sensitive+'?token='+sensitive+'#'+sensitive,secret:sensitive,[sensitive]:sensitive},_meta:{owner:sensitive,token:sensitive},[sensitive]:sensitive};
test('event diagnostics expose only known fields, fixed reasons and exact safe origins',()=>{
 const err=Object.assign(new Error(sensitive),{rpcCode:-32015,reason:'origin_not_approved'});
 const out=mcpEventDiagnostic('events/subscribe',input,err);
 assert.equal(out.reason,'origin_not_approved');assert.equal(out.rpc_code,-32015);
 assert.equal(out.callback_origin,'https://chatgpt.com');
 assert.deepEqual(out.param_fields,['name','arguments','delivery','_meta']);
 assert.equal(out.param_unknown_count,1);assert.equal(out.delivery_unknown_count,1);assert.equal(out.argument_unknown_count,1);
 assert(!JSON.stringify(out).includes(sensitive));
 assert.deepEqual(mcpEventDiagnostic('events/subscribe',input),{diagnostic:'mcp_event_result',method:'events/subscribe',outcome:'ok'});
 for(const method of ['tools/call',sensitive,null,{}])assert.equal(mcpEventDiagnostic(method,input,err),null);
});
test('untrusted error and callback strings never leak credentials, paths or unknown hosts',()=>{
 const urls=['https://'+sensitive+'.openai.com/'+sensitive,'https://'+sensitive+'.example.com/'+sensitive,'https://'+sensitive+'@chatgpt.com/x','https://chatgpt.com:8443/'+sensitive,'http://chatgpt.com/'+sensitive,sensitive];
 for(const url of urls){const out=mcpEventDiagnostic('events/unsubscribe',{delivery:{url}},Object.assign(new Error(sensitive),{rpcCode:12345,reason:sensitive}));assert.equal(out.rpc_code,-32600);assert.equal(out.reason,'unclassified_error');assert.equal(out.callback_origin,undefined);assert(!JSON.stringify(out).includes(sensitive));}
 const managed=mcpEventDiagnostic('events/subscribe',{delivery:{url:'https://events.openai.com/private?token='+sensitive}},new Error('Unknown field'));
 assert.equal(managed.callback_origin_class,'openai_subdomain');assert.equal(managed.callback_origin,'https://events.openai.com');assert(!JSON.stringify(managed).includes(sensitive));
 assert.equal(mcpEventDiagnostic('events/list',{},new Error('Unknown field')).reason,'unknown_parameter');
 assert.equal(mcpEventDiagnostic('events/list',{},new Error('Object required')).reason,'invalid_object');
 for(const message of ['__proto__','constructor','toString'])assert.equal(mcpEventDiagnostic('events/list',{},new Error(message)).reason,'unclassified_error');
});
test('only short readable OpenAI-managed origins are logged, never lookalikes or token-like labels',()=>{
 for(const hostname of ['events.openai.com','webhooks.chatgpt.com','api.chatgpt.com','mcp-events.openai.com']){
  const out=mcpEventDiagnostic('events/subscribe',{delivery:{url:'https://'+hostname+'/'+sensitive+'?token='+sensitive}},new Error('Unknown field'));
  assert.equal(out.callback_origin,'https://'+hostname);assert(!JSON.stringify(out).includes(sensitive));
 }
 for(const hostname of ['openai.com.evil.test','evilopenai.com','chatgpt.com.evil.test','123456789abcdef.openai.com','abcdefabcdef.openai.com','averylongrandomsecretlabel.openai.com','abcdef1234567890.openai.com','xn--token.openai.com','a.b.c.d.openai.com']){
  const out=mcpEventDiagnostic('events/subscribe',{delivery:{url:'https://'+hostname+'/'+sensitive}},new Error('Unknown field'));
  assert.equal(out.callback_origin,undefined);assert(!JSON.stringify(out).includes(hostname));assert(!JSON.stringify(out).includes(sensitive));
 }
});
test('logging is restricted to events and cannot change the operation if logging fails',()=>{
 const original=console.warn;const logged=[];
 try{console.warn=value=>logged.push(value);logMcpEventResult('tools/call',input,new Error(sensitive));logMcpEventResult('events/subscribe',input,Object.assign(new Error(sensitive),{reason:'challenge_failed',rpcCode:-32015}));assert.equal(logged.length,1);assert(!logged[0].includes(sensitive));console.warn=()=>{throw new Error(sensitive);};assert.doesNotThrow(()=>logMcpEventResult('events/list',{}));}finally{console.warn=original;}
});
