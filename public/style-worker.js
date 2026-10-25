import {applyStyle} from './styles.js';
self.onmessage=({data:{pixels,id,intensity,width,height,mask}})=>{
  try{
    if(mask)mask.data=new Uint8ClampedArray(mask.data);
    const out=applyStyle(new Uint8ClampedArray(pixels),id,intensity,{width,height,mask});
    self.postMessage({pixels:out.buffer},[out.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
