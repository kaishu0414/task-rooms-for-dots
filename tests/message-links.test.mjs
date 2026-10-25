import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/message-links.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {messageParts}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function links(text){const parts=messageParts(text);assert.equal(parts.map(p=>p.text).join(''),text);return parts.filter(p=>p.href);}
test('Japanese prose, multiple links, query, fragment and line breaks remain intact',()=>{
 const text='こちら https://example.com/a?q=1&name=あなた#section。\n次は「http://example.org/file.pdf」。';
 assert.deepEqual(links(text).map(p=>p.text),['https://example.com/a?q=1&name=あなた#section','http://example.org/file.pdf']);
});
test('sentence punctuation stays outside links; balanced URL parentheses remain',()=>{
 assert.deepEqual(links('(https://example.com/path). https://example.org/wiki/Thing_(part)!').map(p=>p.text),['https://example.com/path','https://example.org/wiki/Thing_(part)']);
 assert.equal(links('https://example.com/a]),!?;:')[0].text,'https://example.com/a');
 assert.equal(links('（https://example.com/page）。')[0].text,'https://example.com/page');
});
test('only valid http(s) become anchors; unsafe schemes and markup stay plain text',()=>{
 assert.equal(links('javascript:alert(1) data:text/html,<script>x</script> ftp://example.com https:// https://?bad').length,0);
 assert.equal(links('<script>alert(1)</script> https://example.com/" onclick="alert(2)')[0].href,'https://example.com/');
 assert.equal(links('HTTPS://EXAMPLE.COM/path')[0].href,'https://example.com/path');
});
test('plain text, empty text and encoded punctuation preserve original text',()=>{
 assert.deepEqual(links('改行\nそのまま'),[]);assert.deepEqual(links(''),[]);
 assert.equal(links('https://example.com/a%29?q=a%2Cb')[0].text,'https://example.com/a%29?q=a%2Cb');
});
test('conversation renderer uses safe native anchors; existing artifact cards remain native links',()=>{
 const component=readFileSync(new URL('../components/TaskRoom.tsx',import.meta.url),'utf8');
 assert(component.includes('href={part.href} target="_blank" rel="noopener noreferrer"'));
 assert(component.includes('href={link.url} target="_blank" rel="noopener noreferrer"'));
 assert(!component.includes('dangerouslySetInnerHTML'));
});
