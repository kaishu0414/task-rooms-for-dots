import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');
const refreshFunction=component.slice(component.indexOf(' async function refreshView()'),component.indexOf('\n useEffect(()=>()=>{if(feedbackTimer',component.indexOf(' async function refreshView()')));
function setup({thread='task-123',boardResult=true,threadResult=true,wait,acknowledging=false}={}){
 const state={calls:[],feedback:'',busy:false,selected:thread,draft:'入力中の下書き'};
 const names=['acknowledgementLock','refreshLock','setRefreshing','setRefreshFeedback','feedbackTimer','clearTimeout','setTimeout','selectedId','refresh','loadThread'];
 const values=[{current:acknowledging},{current:false},v=>state.busy=v,v=>state.feedback=v,{current:null},()=>{},()=>1,{current:thread},async()=>{state.calls.push('board');if(wait)await wait;return boardResult},async id=>{state.calls.push(id);return threadResult}];
 return {state,run:new Function(...names,refreshFunction+';return refreshView;')(...values)};
}
test('manual refresh reads board and active thread, prevents repeated clicks and preserves draft/selection',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve);const {state,run}=setup({wait});const first=run();assert.equal(state.busy,true);await run();assert.deepEqual(state.calls,['board','task-123']);release();await first;assert.equal(state.busy,false);assert.equal(state.feedback,'更新しました');assert.equal(state.draft,'入力中の下書き');assert.equal(state.selected,'task-123');
 assert(!refreshFunction.includes('setDraft'));assert(!refreshFunction.includes('setSelected'));assert(!refreshFunction.includes('setReplyMode'));
});
test('refresh without an active thread reads board only; failures remain explicit',async()=>{
 const board=setup({thread:null});await board.run();assert.deepEqual(board.state.calls,['board']);
 const failed=setup({boardResult:false});await failed.run();assert.match(failed.state.feedback,/更新できません/);assert.equal(failed.state.busy,false);
 const threadFailed=setup({threadResult:false});await threadFailed.run();assert.match(threadFailed.state.feedback,/更新できません/);
});
test('generic icon is standalone vector with no embedded source asset',()=>{
 const svg=readFileSync(new URL('../public/taskrooms.svg',import.meta.url),'utf8');
 assert(svg.startsWith('<svg'));assert(!svg.includes('base64'));assert(!svg.includes('<image'));assert(!svg.includes('href='));
 const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');assert(layout.includes('/taskrooms.svg'));assert(layout.includes('Task Rooms'));
});
test('PWA install icons are generic PNGs with exact sizes and no text or EXIF metadata',()=>{
 for(const size of [180,192,512]){const bytes=readFileSync(new URL(`../public/icons/taskrooms-${size}.png`,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);let offset=8;while(offset<bytes.length){const n=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString('ascii');assert(['IHDR','pHYs','IDAT','IEND'].includes(type));offset+=n+12;}assert.equal(offset,bytes.length);}
 const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
});

test('refresh cannot race an explicit unread acknowledgement',async()=>{const {state,run}=setup({acknowledging:true});await run();assert.deepEqual(state.calls,[]);assert.equal(state.busy,false);});
