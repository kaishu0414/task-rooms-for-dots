import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/composer-history.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createComposerHistory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const snapshot=(text='',keys=[],start=text.length,end=start)=>({text,keys,start,end});
const text=(time,inputType='insertText')=>({kind:'text',inputType,time});

test('text before image, batch addition, later text undo in chronological order',()=>{
 const history=createComposerHistory(snapshot());
 history.record(snapshot('hello'),text(0));
 history.record(snapshot('hello',['one','two']),{kind:'images',time:1});
 history.record(snapshot('hello!',['one','two']),text(2));
 assert.deepEqual(history.undo(),snapshot('hello',['one','two']));
 assert.deepEqual(history.undo(),snapshot('hello'));
 assert.deepEqual(history.undo(),snapshot());
 assert.equal(history.undo(),null);
 assert.deepEqual(history.redo(),snapshot('hello'));
 assert.deepEqual(history.redo(),snapshot('hello',['one','two']));
 assert.deepEqual(history.redo(),snapshot('hello!',['one','two']));
});
test('paste/file/drop batches are indivisible history operations',()=>{
 for(const prefix of ['paste','file','drop']){
  const history=createComposerHistory(snapshot('keep'));
  history.record(snapshot('keep',[prefix+'1',prefix+'2']),{kind:'images'});
  assert.deepEqual(history.undo(),snapshot('keep'));
  assert.deepEqual(history.redo(),snapshot('keep',[prefix+'1',prefix+'2']));
 }
});
test('contiguous typing coalesces but never crosses image boundary or timing boundary',()=>{
 const history=createComposerHistory(snapshot());
 history.record(snapshot('a'),text(0));history.record(snapshot('ab'),text(100));
 history.record(snapshot('ab',['photo']),{kind:'images',time:150});
 history.record(snapshot('abc',['photo']),text(200));history.record(snapshot('abcd',['photo']),text(1000));
 assert.equal(history.undo().text,'abc');
 assert.deepEqual(history.undo(),snapshot('ab',['photo']));
 assert.deepEqual(history.undo(),snapshot('ab'));
 assert.deepEqual(history.undo(),snapshot());
});
test('caret/selection changes split text groups and restore exact selection',()=>{
 const history=createComposerHistory(snapshot('hello'));
 history.select(0,5);
 history.record(snapshot('x'),text(10));history.select(0,0);
 history.record(snapshot('ax',[],1),text(20));
 assert.deepEqual(history.undo(),snapshot('x',[],0));
 assert.deepEqual(history.undo(),snapshot('hello',[],0,5));
});
test('backspace groups are separate from inserts and image changes',()=>{
 const history=createComposerHistory(snapshot('abcd'));
 history.record(snapshot('abc'),text(0,'deleteContentBackward'));
 history.record(snapshot('ab'),text(100,'deleteContentBackward'));
 history.record(snapshot('abx'),text(200));
 assert.equal(history.undo().text,'ab');assert.equal(history.undo().text,'abcd');
});
test('one IME composition groups across duration; separate composition is a new operation',()=>{
 const history=createComposerHistory(snapshot());
 history.record(snapshot('に'),{...text(0,'insertCompositionText'),composition:1});
 history.record(snapshot('日本'),{...text(2000,'insertCompositionText'),composition:1});
 history.record(snapshot('日本語'),{...text(3000,'insertCompositionText'),composition:2});
 assert.equal(history.undo().text,'日本');assert.equal(history.undo().text,'');
});
test('new edit after undo discards redo and obsolete retained image keys',()=>{
 const history=createComposerHistory(snapshot());
 history.record(snapshot('',['a']),{kind:'images'});history.undo();
 history.record(snapshot('new'),text(0));
 assert.equal(history.redo(),null);assert.deepEqual(history.retainedKeys(),[]);
});
test('snapshot callers cannot mutate history, and reset after successful send clears all history',()=>{
 const initial=snapshot('keep',['a']),history=createComposerHistory(initial);
 initial.keys.push('bad');history.record(snapshot('keep',['a','b']),{kind:'images'});
 const current=history.current();current.keys.push('bad');
 const undone=history.undo();undone.keys.length=0;
 assert.deepEqual(history.current(),snapshot('keep',['a']));
 history.reset(snapshot());assert.equal(history.undo(),null);assert.equal(history.redo(),null);assert.deepEqual(history.retainedKeys(),[]);
});
test('per-draft instances remain isolated and bounded history retains original baseline',()=>{
 const a=createComposerHistory(snapshot('initial'),3),b=createComposerHistory(snapshot('other'));
 for(let i=0;i<5;i++)a.record(snapshot(String(i)),{kind:'text',inputType:'insertFromPaste'});
 assert.equal(a.undo().text,'3');assert.equal(a.undo().text,'initial');assert.equal(a.undo(),null);
 assert.equal(b.current().text,'other');assert.equal(b.undo(),null);
});
test('preparing image keys remain cancellable without asynchronous state becoming a new edit',()=>{
 const history=createComposerHistory(snapshot('text'));
 history.record(snapshot('text',['processing']),{kind:'images'});
 assert.deepEqual(history.undo().keys,[]);
 assert.deepEqual(history.retainedKeys(),['processing']);
 assert.deepEqual(history.redo().keys,['processing']);
});
