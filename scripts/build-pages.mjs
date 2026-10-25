import './build-cloud.mjs';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const expected=JSON.parse(await readFile(new URL('expected-runtime.json',import.meta.url),'utf8'));
const output=new URL('_site/',root);await mkdir(output,{recursive:true});
for(const {name} of expected){
  const relative=name.slice(7),dest=new URL(relative,output);
  await mkdir(new URL('./',dest),{recursive:true});
  await copyFile(new URL(name,root),dest);
}
const index=new URL('index.html',output);
let html=await readFile(index,'utf8');
html=html.replace('<meta charset="UTF-8">',`<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
await writeFile(index,html);await writeFile(new URL('.nojekyll',output),'');
console.log('Pages: somente o runtime revisado em _site. Nenhuma foto.');
