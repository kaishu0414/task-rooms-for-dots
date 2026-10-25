/** Dropped URLs/HTML are never fetched. Only local File objects enter upload validation. */
export function droppedImages(transfer:Pick<DataTransfer,'files'|'types'>):File[]{if(Array.from(transfer.types).some(type=>type==='text/uri-list'||type==='text/html'))return [];return Array.from(transfer.files);}
export function hasDraggedFiles(types:readonly string[]):boolean{return types.includes('Files');}
