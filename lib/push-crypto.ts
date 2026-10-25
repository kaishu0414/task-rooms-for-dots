/** Web Push RFC 8291/8188 (aes128gcm) and RFC 8292 (VAPID), using Worker WebCrypto. */
const encoder=new TextEncoder();
export const buffer=(bytes:Uint8Array)=>Uint8Array.from(bytes).buffer;
export function unbase64url(value:string):Uint8Array {if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid base64url');const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export function base64url(value:Uint8Array):string{return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function join(...parts:Uint8Array[]){const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){output.set(p,offset);offset+=p.length;}return output;}
async function hkdf(input:Uint8Array,salt:Uint8Array,info:Uint8Array,length:number){const key=await crypto.subtle.importKey('raw',buffer(input),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:buffer(salt),info:buffer(info)},key,length*8));}
export async function encryptPush(payload:string,userPublic:Uint8Array,auth:Uint8Array):Promise<Uint8Array>{
 const user=await crypto.subtle.importKey('raw',buffer(userPublic),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const server=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',server.publicKey));
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:user},server.privateKey,256));
 const ikm=await hkdf(shared,auth,join(encoder.encode('WebPush: info\0'),userPublic,serverPublic),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(ikm,salt,encoder.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(ikm,salt,encoder.encode('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',buffer(cek),'AES-GCM',false,['encrypt']);
 const plain=join(encoder.encode(payload),new Uint8Array([2]));
 if(plain.length+16>4096)throw new Error('Push payload too large');
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:buffer(nonce)},key,buffer(plain)));
 const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=serverPublic.length;
 return join(header,serverPublic,encrypted);
}
export async function vapidAuthorization(endpoint:string,publicKey:string,privateJwk:JsonWebKey,subject:string):Promise<string>{
 const key=await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=base64url(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=base64url(encoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:subject})));
 const unsigned=header+'.'+claims;
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(unsigned)));
 return `vapid t=${unsigned}.${base64url(signature)}, k=${publicKey}`;
}
