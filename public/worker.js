import { calculateRecipe, enhance } from './engine.js';
self.onmessage=({data:{pixels,width,height,strength}})=>{
  try {
    const data=new Uint8ClampedArray(pixels);
    const recipe=calculateRecipe(data,strength);
    enhance(data,width,height,recipe,message=>self.postMessage({message}));
    self.postMessage({pixels:data.buffer,recipe},[data.buffer]);
  } catch { self.postMessage({error:'Não foi possível processar esta foto. Pode faltar memória no dispositivo. Tente novamente ou escolha uma foto menor.'}); }
};
