import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/task-contract.ts',import.meta.url),'utf8');
const {ownerConfig,displayNames}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
// No network, file writes, credential creation, or printing configured values.
try {ownerConfig(process.env);displayNames(process.env);} catch {console.error('NOT READY: TASKROOM_OWNER_EMAIL and TASKROOM_OWNER_USER_ID must be configured server-side with non-placeholder values. No changes made.');process.exit(1);}
const eventNames=['MCP_EVENTS_ENCRYPTION_KEY','MCP_EVENTS_CALLBACK_ORIGINS'];
const pushNames=['WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_JWK','WEB_PUSH_VAPID_SUBJECT'];
let invalid=false;
for(const [label,names] of [['Events',eventNames],['Push',pushNames]]) {
 const count=names.filter(name=>!!process.env[name]).length;
 if(count&&count!==names.length){invalid=true;console.error(`${label}: incomplete configuration; configure all required names or leave all unset.`);}
 else console.log(`${label}: ${count?'names present; cryptographic and live delivery validation still required':'disabled (optional)'}.`);
}
console.log('Owner configuration format: valid. Private Sites identity, independent storage, and live access still need verification. No values printed or changes made.');
if(invalid)process.exit(1);
