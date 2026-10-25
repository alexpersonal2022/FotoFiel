import './setup-segmentation.mjs';
import {readFile,unlink,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const expected=JSON.parse(await readFile(new URL('expected-runtime.json',import.meta.url),'utf8'));
for(const entry of expected){
  const data=await readFile(new URL(entry.name,root));
  if(data.length!==entry.bytes||createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('Integridade divergente: '+entry.name);
}
for(const name of ['manifest.json','model-source.json'])await unlink(new URL('public/vendor/'+name,root));
const allowed=new Set(expected.map(e=>e.name.slice(7)));
async function inspect(dir,prefix=''){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const name=prefix+item.name;
    if(item.isDirectory())await inspect(new URL(item.name+'/',dir),name+'/');
    else if(!item.isFile()||!allowed.has(name))throw Error('Arquivo inesperado: '+name);
  }
}
await inspect(new URL('public/',root));
console.log('Runtime estático idêntico ao pacote revisado. Nenhuma fotografia incluída.');
