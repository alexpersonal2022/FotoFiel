// Classic Worker: all libraries, model and weights are served from this application.
let model;
self.onmessage=async({data:{pixels,width,height}})=>{
  try{
    self.postMessage({message:'Carregando modelo local de pessoas…'});
    if(!model){
      const vendor=new URL('./vendor/',self.location.href);
      importScripts(...['tf.min.js','tf-backend-wasm.js','body-segmentation.min.js'].map(name=>new URL(name,vendor).href));
      self.postMessage({message:'Inicializando WebAssembly local…'});
      tf.wasm.setWasmPaths(vendor.href);tf.wasm.setThreadsCount(1);
      await tf.setBackend('wasm');await tf.ready();
      self.postMessage({message:'Carregando pesos locais de segmentação…'});
      model=await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.BodyPix,{architecture:'ResNet50',outputStride:16,quantBytes:2,modelUrl:new URL('model-precise.json',vendor).href});
    }
    self.postMessage({message:'Segmentando todas as pessoas da fotografia…'});
    const result=await model.segmentPeople(new ImageData(new Uint8ClampedArray(pixels),width,height),{multiSegmentation:false,segmentBodyParts:false,flipHorizontal:false,internalResolution:.75,segmentationThreshold:.55,maxDetections:20,scoreThreshold:.2});
    if(!result.length)throw new Error('Nenhuma máscara retornada pelo modelo.');
    const rgba=await result[0].mask.toImageData(),mask=new Uint8ClampedArray(rgba.width*rgba.height);
    let selected=0;for(let i=0;i<mask.length;i++){mask[i]=rgba.data[i*4+3];if(mask[i]>127)selected++;}
    self.postMessage({mask:mask.buffer,width:rgba.width,height:rgba.height,selected,backend:tf.getBackend()},[mask.buffer]);
  }catch(error){console.error(error);self.postMessage({error:error.message||'Falha na segmentação local.'});}
};
