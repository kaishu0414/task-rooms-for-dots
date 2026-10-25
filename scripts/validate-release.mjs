import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const manifest=JSON.parse(readFileSync(join(root,'FILE_MANIFEST.json'),'utf8'));
if(!Array.isArray(manifest.files)||manifest.files.some(file=>typeof file.path!=='string'||file.path.startsWith('/')||file.path.includes('\\')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(file.sha256))||new Set(manifest.files.map(file=>file.path)).size!==manifest.files.length)throw new Error('Invalid release manifest');
const expected=new Map(manifest.files.map(file=>[file.path,file]));
const ignored=new Set(['node_modules','dist','.next','.vinext','.wrangler','.sites-runtime']);
const errors=[];const found=[];
function walk(dir){for(const name of readdirSync(dir)){const full=join(dir,name),path=relative(root,full).replaceAll('\\','/'),stat=lstatSync(full);if(path!=='.env.example'&&(/(?:^|\/)\.env(?:\.|$)/.test(path)||/(?:^|\/)\.dev\.vars(?:\.|$)/.test(path)||/(?:^|\/)\.git(?:\/|$)/.test(path)||path==='.openai/hosting.json'||/\.(?:sqlite(?:3)?|db|dump|log|zip|tar|gz|map)$/.test(path)))errors.push('Private state filename: '+path);if(ignored.has(path))continue;if(stat.isSymbolicLink()){errors.push('Symlink: '+path);continue;}if(stat.isDirectory()){walk(full);continue;}if(path==='FILE_MANIFEST.json'||path.endsWith('.tsbuildinfo'))continue;found.push(path);const item=expected.get(path);if(!item){errors.push('Unlisted file: '+path);continue;}const bytes=readFileSync(full);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)errors.push('Changed file: '+path);if(bytes.includes(0)&&!/^public\/icons\/taskrooms-(?:180|192|512)\.png$/.test(path))errors.push('Unexpected binary: '+path);}}
walk(root);for(const path of expected.keys())if(!found.includes(path))errors.push('Missing file: '+path);
// Pattern scan is a guardrail, not a guarantee of privacy. Manual review is required.
for(const path of [...found,'FILE_MANIFEST.json']){const text=readFileSync(join(root,path),'utf8');if(/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer [A-Za-z0-9_-]{24,}|appg(?:prj|proj|dep|ver)_[a-z0-9]+)/.test(text))errors.push('Potential private material: '+path);if(/(?:^|\/)\.(?:git|env|dev\.vars)(?:\/|$)/.test(path)&&path!=='.env.example')errors.push('Private state filename: '+path);}
if(errors.length){console.error('Release check failed:\n'+errors.join('\n'));process.exit(1);}console.log(`Release inventory verified: ${found.length} allowlisted files; no unlisted files, symlinks, unexpected binaries, or matched private-material patterns. Manual review remains required.`);
