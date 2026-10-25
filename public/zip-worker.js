import {makeZip} from './zip.js';
self.onmessage=async({data:{files}})=>{try{const blob=await makeZip(files,{onProgress:progress=>self.postMessage({progress})});self.postMessage({blob});}catch(error){self.postMessage({error:error.message});}};
