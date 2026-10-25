// ZIP store (no recompression): PNG/JPEG are already compressed. UTF-8 names, CRC32.
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes,crc=0xffffffff){for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return crc>>>0;}
const header=size=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
export async function makeZip(files,{maxBytes=256*1024*1024,onProgress=()=>{}}={}){
  if(!files.length)throw new Error('Nenhum arquivo pronto para o ZIP.');
  if(files.length>65535)throw new Error('Quantidade de arquivos excedida.');
  const parts=[],central=[],names=new Set();let offset=0,centralSize=0;
  for(let index=0;index<files.length;index++){
    const {name,blob}=files[index];
    if(!blob||!Number.isSafeInteger(blob.size)||blob.size<0||typeof blob.slice!=='function')throw new Error('Arquivo inválido.');
    if(!name||/[\\/\u0000]/.test(name)||name==='.'||name==='..'||names.has(name))throw new Error('Nome de arquivo inválido ou repetido no ZIP.');
    names.add(name);const encoded=new TextEncoder().encode(name);if(encoded.length>65535)throw new Error('Nome de arquivo muito longo.');
    const projected=offset+30+encoded.length+blob.size+centralSize+46+encoded.length+22;
    if(projected>maxBytes||projected>0xffffffff)throw new Error('O ZIP excede o limite de 256 MB. Selecione menos versões; os downloads individuais continuam disponíveis.');
    let crc=0xffffffff;
    for(let start=0;start<blob.size;start+=1024*1024)crc=crc32(new Uint8Array(await blob.slice(start,start+1024*1024).arrayBuffer()),crc);
    crc=(crc^0xffffffff)>>>0;
    const local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint16(12,0x21,true);
    local.view.setUint32(14,crc,true);local.view.setUint32(18,blob.size,true);local.view.setUint32(22,blob.size,true);local.view.setUint16(26,encoded.length,true);
    const entry=header(46);entry.view.setUint32(0,0x02014b50,true);entry.view.setUint16(4,20,true);entry.view.setUint16(6,20,true);entry.view.setUint16(8,0x800,true);entry.view.setUint16(14,0x21,true);
    entry.view.setUint32(16,crc,true);entry.view.setUint32(20,blob.size,true);entry.view.setUint32(24,blob.size,true);entry.view.setUint16(28,encoded.length,true);entry.view.setUint32(42,offset,true);
    parts.push(local.bytes,encoded,blob);central.push(entry.bytes,encoded);offset+=30+encoded.length+blob.size;centralSize+=46+encoded.length;
    onProgress({completed:index+1,total:files.length});
  }
  const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.bytes],{type:'application/zip'});
}
