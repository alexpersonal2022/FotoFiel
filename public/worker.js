import { calculateRecipe, enhance } from './engine.js?v=0.5.0';
self.onmessage=({data:{pixels,width,height,strength,detail=1,denoise=1}})=>{
  try {
    const data=new Uint8ClampedArray(pixels);
    const recipe=calculateRecipe(data,strength,{detail,denoise});
    enhance(data,width,height,recipe,message=>self.postMessage({message}));
    self.postMessage({pixels:data.buffer,recipe},[data.buffer]);
  } catch { self.postMessage({error:'Não foi possível processar esta foto. Pode faltar memória no dispositivo. Tente novamente ou escolha uma foto menor.'}); }
};
