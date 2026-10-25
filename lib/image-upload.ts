import {ApiError} from './task-contract';
export const MAX_IMAGE_BYTES=6*1024*1024,MAX_IMAGE_PIXELS=16*1024*1024,MAX_ATTACHMENTS=4;
const bad=()=>new ApiError(400,'JPEG・PNG・WebPの画像を選んでください。HEICは端末でJPEGに変換できる場合のみ送信できます。');
const u16=(b:Uint8Array,p:number)=>b[p]*256+b[p+1];
const u32=(b:Uint8Array,p:number)=>(b[p]*0x1000000+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3])>>>0;
const le32=(b:Uint8Array,p:number)=>(b[p]+(b[p+1]<<8)+(b[p+2]<<16)+b[p+3]*0x1000000)>>>0;
const ascii=(b:Uint8Array,p:number,n:number)=>String.fromCharCode(...b.slice(p,p+n));
function dimensions(width:number,height:number,mimeType:string){if(!width||!height||width>8192||height>8192||width*height>MAX_IMAGE_PIXELS)throw new ApiError(400,'画像が大きすぎます。縮小して選び直してください。');return{width,height,mimeType};}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes:Uint8Array,start:number,end:number){let c=0xffffffff;for(let p=start;p<end;p++)c=crcTable[(c^bytes[p])&255]^(c>>>8);return(c^0xffffffff)>>>0;}
export function inspectImage(bytes:Uint8Array,claimedType:string){
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new ApiError(413,'画像は1枚6MBまでです。');let info:{width:number;height:number;mimeType:string}|undefined;
 if(ascii(bytes,0,8)==='\x89PNG\r\n\x1a\n'){
  let p=8,width=0,height=0,seenData=false,ended=false;while(p+12<=bytes.length){const size=u32(bytes,p),type=ascii(bytes,p+4,4);if(size>MAX_IMAGE_BYTES||p+12+size>bytes.length||crc(bytes,p+4,p+8+size)!==u32(bytes,p+8+size))throw bad();if(p===8&&type!=='IHDR')throw bad();if(type==='IHDR'){if(p!==8||size!==13)throw bad();width=u32(bytes,p+8);height=u32(bytes,p+12);}if(type==='acTL')throw bad();if(type==='IDAT')seenData=true;p+=12+size;if(type==='IEND'){if(size||p!==bytes.length)throw bad();ended=true;break;}}if(!ended||!seenData)throw bad();info=dimensions(width,height,'image/png');
 }else if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9){
  let p=2,width=0,height=0,scan=false;while(p<bytes.length-2){if(bytes[p++]!==0xff)throw bad();while(bytes[p]===0xff)p++;const marker=bytes[p++];if(marker===0xda){const length=u16(bytes,p);if(length<2||p+length>=bytes.length-2)throw bad();scan=true;break;}if(marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const length=u16(bytes,p);if(length<2||p+length>bytes.length-2)throw bad();if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)throw bad();height=u16(bytes,p+3);width=u16(bytes,p+5);}p+=length;}if(!scan)throw bad();info=dimensions(width,height,'image/jpeg');
 }else if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'&&le32(bytes,4)+8===bytes.length){
  let p=12,width=0,height=0,image=false;const imageSize=(w:number,h:number)=>{dimensions(w,h,'image/webp');if(image||(width&&(width!==w||height!==h)))throw bad();width=w;height=h;image=true;};while(p+8<=bytes.length){const type=ascii(bytes,p,4),length=le32(bytes,p+4),data=p+8;if(data+length>bytes.length)throw bad();if(type==='ANIM'||type==='ANMF')throw bad();if(type==='VP8X'){if(length!==10||bytes[data]&2||width||image)throw bad();width=1+bytes[data+4]+(bytes[data+5]<<8)+(bytes[data+6]<<16);height=1+bytes[data+7]+(bytes[data+8]<<8)+(bytes[data+9]<<16);}if(type==='VP8 '){if(length<10||ascii(bytes,data+3,3)!=='\x9d\x01\x2a')throw bad();imageSize((bytes[data+6]+(bytes[data+7]<<8))&0x3fff,(bytes[data+8]+(bytes[data+9]<<8))&0x3fff);}if(type==='VP8L'){if(length<5||bytes[data]!==0x2f)throw bad();const bits=le32(bytes,data+1);imageSize((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}p=data+length+(length%2);}if(p!==bytes.length||!image)throw bad();info=dimensions(width,height,'image/webp');
 }
 if(!info||claimedType!==info.mimeType)throw bad();return info;
}
export async function readImageBody(request:Request){if(Number(request.headers.get('content-length')||0)>MAX_IMAGE_BYTES)throw new ApiError(413,'画像は1枚6MBまでです。');const reader=request.body?.getReader();if(!reader)throw bad();const chunks:Uint8Array[]=[];let size=0;for(;;){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new ApiError(413,'画像は1枚6MBまでです。');}chunks.push(result.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
