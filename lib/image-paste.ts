/** User paste only: use image File payloads, never clipboard HTML or remote URLs. */
export function pastedImages(data:Pick<DataTransfer,'items'|'files'>):File[]{
 const items=Array.from(data.items??[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file);
 const files=items.length?items:Array.from(data.files??[]);
 return files.filter(file=>file.type.startsWith('image/')||(!file.type&&/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)));
}
