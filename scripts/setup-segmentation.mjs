import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/vendor/',import.meta.url);await mkdir(root,{recursive:true});
const assets=[
 ['tf.min.js','https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'],
 ['body-segmentation.min.js','https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation@1.0.2/dist/body-segmentation.min.js'],
 ['tf-backend-wasm.js','https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.js'],
 ['tfjs-backend-wasm.wasm','https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tfjs-backend-wasm.wasm'],
 ['tfjs-backend-wasm-simd.wasm','https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tfjs-backend-wasm-simd.wasm'],
 ['tfjs-backend-wasm-threaded-simd.wasm','https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tfjs-backend-wasm-threaded-simd.wasm'],
 ['TFJS-LICENSE.txt','https://raw.githubusercontent.com/tensorflow/tfjs/master/LICENSE'],
 ['BODY-SEGMENTATION-LICENSE.txt','https://raw.githubusercontent.com/tensorflow/tfjs-models/master/LICENSE'],
 ['APACHE-2.0.txt','https://raw.githubusercontent.com/tensorflow/tfjs/master/LICENSE'],
];
const manifest=[];
async function download(file,url,retained=true){const r=await fetch(url);if(!r.ok)throw new Error(`${r.status}: ${url}`);const data=Buffer.from(await r.arrayBuffer());if(retained)await writeFile(new URL(file,root),data);manifest.push({file,url,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),retained});console.log(`${file}: ${data.length} bytes`);return data;}
for(const [file,url] of assets)await download(file,url);
const modelBase='https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/resnet50/quant2/';
const json=JSON.parse((await download('model-source.json',modelBase+'model-stride16.json')).toString());
if(json.weightsManifest.length!==1)throw new Error('Checkpoint inesperado.');
const parts=[];
for(const file of json.weightsManifest[0].paths){if(!/^[\w.-]+$/.test(file))throw new Error('Caminho de peso inesperado');parts.push(await download(file,modelBase+file,false));}
// TFJS fetches all shard response headers before consuming the bodies. A large
// HTTP/1.1 checkpoint can exhaust the browser connection pool. One concatenated
// shard preserves the weights in manifest order and avoids that deadlock.
const combined=Buffer.concat(parts);json.weightsManifest[0].paths=['bodypix-resnet.bin'];
for(const [file,data] of [['bodypix-resnet.bin',combined],['model-precise.json',Buffer.from(JSON.stringify(json))]]){
  await writeFile(new URL(file,root),data);manifest.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),retained:true,derivedFrom:modelBase+'model-stride16.json'});
}
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
// Only obsolete files created by earlier local model setup attempts are removed.
const obsolete=['model-stride16.json','model-stride8.json','group1-shard1of2.bin','group1-shard2of2.bin',...Array.from({length:12},(_,i)=>`group1-shard${i+1}of12.bin`)];
for(const file of obsolete){const target=new URL(file,root);if(!target.href.startsWith(root.href))throw new Error('Caminho fora do diretório vendor.');try{await unlink(target);}catch(error){if(error.code!=='ENOENT')throw error;}}
console.log('Modelo e runtime instalados localmente. Nenhuma foto foi transferida.');
