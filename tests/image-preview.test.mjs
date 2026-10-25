import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('components/ImagePreview.tsx','utf8');
const helper=source.slice(source.indexOf('export function previewSource'),source.indexOf('type PreviewImage'));
const js=ts.transpileModule(helper,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {previewSource}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const origin='https://room.example';
test('preview admits authenticated same-origin image route and same-origin blob drafts',()=>{
 assert.equal(previewSource('/api/attachments/abc-123',origin),origin+'/api/attachments/abc-123');
 assert.equal(previewSource(origin+'/api/attachments/abc-123',origin),origin+'/api/attachments/abc-123');
 assert.equal(previewSource('blob:'+origin+'/abc-123',origin),'blob:'+origin+'/abc-123');
});
test('preview rejects external fetch, data/javascript, traversal, credentials, queries, and unrelated paths',()=>{
 for(const url of ['https://other.example/api/attachments/a','//other.example/api/attachments/a','blob:https://other.example/a','blob:null/a','data:image/svg+xml,<svg/>','javascript:alert(1)',origin+'/api/attachments/../private',origin+'/api/attachments/a?token=x',origin+'/api/attachments/a#x','https://user:pass@room.example/api/attachments/a',origin+'/public.png',origin+'/api/attachments/a/b',''])assert.equal(previewSource(url,origin),null,url);
});
test('dialog contains focus, restores original focus, blocks app scroll and closes Escape before parent handler',()=>{
 assert(source.includes("role=\"dialog\" aria-modal=\"true\""));
 assert(source.includes("document.addEventListener('keydown',key,true)"));
 assert(source.includes('event.stopImmediatePropagation()'));
 assert(source.includes('previous?.isConnected'));
 assert(source.includes('previous.focus({preventScroll:true})'));
 assert(source.includes('node.inert=true'));
 assert(source.includes('node.inert=inert'));
 assert(source.includes("document.body.style.overflow='hidden'"));
 assert(source.includes('event.target===event.currentTarget'));
 assert(source.includes("button:not(:disabled),[tabindex=\"0\"]"));
});
test('fit/zoom, private image loading failure, safe area and reduced-motion are explicit',()=>{
 const css=readFileSync('components/ImagePreview.module.css','utf8');
 assert(source.includes('画像を全体表示'));assert(source.includes('画像プレビューを閉じる'));
 assert(source.includes('onError={()=>{setFailed(true);setLoading(false);}}'));
 assert(source.includes('key={source} src={source}'));assert(!source.includes('dangerouslySetInnerHTML'));
 assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('env(safe-area-inset-bottom)'));
 assert(css.includes('overscroll-behavior:contain'));assert(css.includes('cursor:zoom-out'));
});
