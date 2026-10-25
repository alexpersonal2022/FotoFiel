import {STYLES,applyStyle} from './styles.js';
const $=id=>document.getElementById(id);
const blob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Sem memória para preparar a imagem. Tente novamente.')),'image/png'));
export class StylesView{
  constructor({onError,onStatus,onDownload,onLock,onSelect}){
    Object.assign(this,{onError,onStatus,onDownload,onLock,onSelect});
    this.cards=new Map();this.locked=false;this.generation=0;
    for(const style of STYLES){
      const button=document.createElement('button');button.type='button';button.className='style-card';button.dataset.style=style.id;
      const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;canvas.setAttribute('aria-hidden','true');
      if(style.selective)button.dataset.selective='true';
      const name=document.createElement('span');name.textContent=style.name;
      button.append(canvas,name);button.setAttribute('aria-pressed','false');button.onclick=()=>this.select(style.id);
      const wrapper=document.createElement('div');wrapper.className='style-option';
      const label=document.createElement('label');label.className='export-choice';
      const check=document.createElement('input');check.type='checkbox';check.dataset.export=style.id;check.setAttribute('aria-label',`Incluir ${style.name} no ZIP`);
      const choice=document.createElement('span');choice.textContent='Incluir no ZIP';label.append(check,choice);wrapper.append(button,label);
      check.onchange=()=>{check.checked?this.picked.add(style.id):this.picked.delete(style.id);this.onChange?.({kind:'selection'});};
      $('style-gallery').append(wrapper);this.cards.set(style.id,{button,canvas,check,choice});
    }
    $('style-intensity').oninput=()=>{
      this.intensity=Number($('style-intensity').value);this.recipes.set(this.id,this.intensity);this.onChange?.({kind:'recipe',id:this.id});this.onSelect();this.updateLabels();this.ready=false;this.updateDisabled();
      clearTimeout(this.debounce);this.cancelPreview?.();this.generation++;
      this.debounce=setTimeout(()=>this.renderPreview(),120);
    };
    $('enlarge').onclick=()=>this.openZoom();
    $('gallery-enlarge').onclick=()=>this.openZoom();
    $('gallery-download').onclick=()=>this.onDownload();
    $('zoom-close').onclick=()=>$('zoom-dialog').close();
    $('zoom-dialog').onclose=()=>this.clearZoom();
    $('zoom-fit').onclick=()=>this.fitZoom();
    $('zoom-actual').onclick=()=>this.setZoom(100);
    $('zoom-level').oninput=()=>this.setZoom(Number($('zoom-level').value));
    $('zoom-original').onclick=()=>this.zoomMode(true);
    $('zoom-result').onclick=()=>this.zoomMode(false);
    $('zoom-download').onclick=()=>this.onDownload();
    this.clear();
  }
  get style(){return STYLES.find(s=>s.id===this.id);}
  setBusy(value){this.locked=value;this.updateDisabled();}
  updateDisabled(){
    const unavailable=this.locked||!this.ready;
    $('download').disabled=unavailable;$('enlarge').disabled=unavailable;$('zoom-download').disabled=unavailable;
    $('gallery-enlarge').disabled=unavailable;$('gallery-download').disabled=unavailable;
    $('style-intensity').disabled=this.locked||!this.base||this.id==='natural';
    for(const [id,{button,check,choice}] of this.cards){button.disabled=this.locked||!this.base||(STYLES.find(s=>s.id===id).selective&&!this.mask);check.disabled=this.locked||!this.canExport(id);choice.textContent=id==='natural'?'Incluir no ZIP':`ZIP · ${this.recipes.get(id)??100}%`;}
    this.onChange?.({kind:'state'});
  }
  updateLabels(){
    $('selected-style').textContent=this.style.name;
    $('style-intensity').parentElement.hidden=this.id==='natural';
    $('current-style-heading').textContent=this.style.name.toLocaleUpperCase('pt-BR');
    $('style-value').textContent=`${this.intensity}%`;
    $('style-description').textContent=this.id==='natural'?'Correção natural, sem filtro adicional.':`${this.intensity===0?'Intensidade zero: a base melhorada.':'O estilo é aplicado sobre a base melhorada.'} Miniaturas mostram os estilos a 100%.`;
    $('download').textContent=this.id==='natural'?'Baixar fotografia melhorada ↓':`Baixar ${this.style.name} ↓`;
    document.querySelector('.badge.right').textContent=this.id==='natural'?'Melhorada':this.style.name;
    for(const [id,{button}] of this.cards)button.setAttribute('aria-pressed',String(id===this.id));
  }
  clearZoom(){
    if(this.zoomURL)URL.revokeObjectURL(this.zoomURL);this.zoomURL=null;
    $('zoom-image').removeAttribute('src');
  }
  clear(){
    clearTimeout(this.debounce);this.cancelPreview?.();this.generation++;
    if($('zoom-dialog').open)$('zoom-dialog').close();this.clearZoom();
    if(this.previewURL)URL.revokeObjectURL(this.previewURL);this.previewURL=null;
    this.base=null;this.previewBase=null;this.thumbBase=null;this.mask=null;this.id='natural';this.intensity=100;this.ready=false;
    this.recipes=new Map(STYLES.map(s=>[s.id,100]));this.picked=new Set();this.onChange?.({kind:'clear'});
    $('style-intensity').value=100;
    for(const {canvas,button,check} of this.cards.values()){canvas.width=canvas.height=1;button.dataset.state='';check.checked=false;}
    this.updateLabels();this.updateDisabled();
  }
  async setBase(canvas,originalURL){
    this.base=canvas;this.originalURL=originalURL;
    const p=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(canvas.width,canvas.height));
    p.width=Math.max(1,Math.round(canvas.width*scale));p.height=Math.max(1,Math.round(canvas.height*scale));
    const ctx=p.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,p.width,p.height);
    this.previewBase=ctx.getImageData(0,0,p.width,p.height);p.width=p.height=1;
    const thumb=document.createElement('canvas'),s=Math.min(1,240/Math.max(canvas.width,canvas.height));
    thumb.width=Math.max(1,Math.round(canvas.width*s));thumb.height=Math.max(1,Math.round(canvas.height*s));
    const t=thumb.getContext('2d',{willReadFrequently:true});t.drawImage(canvas,0,0,thumb.width,thumb.height);
    const pixels=t.getImageData(0,0,thumb.width,thumb.height);this.thumbBase=pixels;
    for(const style of STYLES){
      if(style.selective){this.cards.get(style.id).button.dataset.state='pending';continue;}
      const c=this.cards.get(style.id).canvas;c.width=thumb.width;c.height=thumb.height;
      c.getContext('2d').putImageData(new ImageData(applyStyle(pixels.data,style.id,100),thumb.width,thumb.height),0,0);
      this.cards.get(style.id).button.dataset.state='ready';
    }
    thumb.width=thumb.height=1;
    await this.renderPreview();
  }
  async select(id){
    if(this.locked||!this.base)return;
    if(STYLES.find(s=>s.id===id).selective&&!this.mask)return;
    clearTimeout(this.debounce);this.cancelPreview?.();this.generation++;
    this.id=id;this.intensity=this.recipes.get(id)??100;$('style-intensity').value=this.intensity;this.onSelect();this.updateLabels();await this.renderPreview();
  }
  async setMask(mask){
    if(!this.base)return;
    if(!mask?.data||mask.data.length!==mask.width*mask.height)throw new Error('Máscara inválida.');
    this.mask={width:mask.width,height:mask.height,data:mask.data.slice()};
    this.onChange?.({kind:'mask'});
    const {data,width,height}=this.thumbBase;
    for(const style of STYLES.filter(s=>s.selective)){
      const {canvas,button}=this.cards.get(style.id);canvas.width=width;canvas.height=height;
      canvas.getContext('2d').putImageData(new ImageData(applyStyle(data,style.id,100,{width,height,mask:this.mask}),width,height),0,0);button.dataset.state='ready';
    }
    this.updateDisabled();
    if(this.style.selective){clearTimeout(this.debounce);this.cancelPreview?.();this.generation++;await this.renderPreview();}
  }
  maskUnavailable(){if(this.mask)return;for(const style of STYLES.filter(s=>s.selective))this.cards.get(style.id).button.dataset.state='unavailable';this.updateDisabled();}
  filter(pixels,id,intensity,preview=false,width,height){
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./style-worker.js',import.meta.url),{type:'module'});
      const finish=()=>{clearTimeout(timer);worker.terminate();if(preview&&this.cancelPreview===cancel)this.cancelPreview=null;};
      const cancel=()=>{finish();reject(new DOMException('Renderização substituída','AbortError'));};
      const timer=setTimeout(()=>{finish();reject(new Error('O estilo excedeu o tempo de processamento. Escolha novamente para tentar outra vez.'));},120000);
      if(preview)this.cancelPreview=cancel;
      worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(new Uint8ClampedArray(data.pixels));};
      worker.onerror=()=>{finish();reject(new Error('Falha ao processar o estilo. Sua base natural está preservada.'));};
      let mask;const transfers=[pixels.buffer];
      if(STYLES.find(s=>s.id===id).selective){if(!this.mask){finish();reject(new Error('Seleção de pessoas indisponível.'));return;}const data=this.mask.data.slice();mask={data:data.buffer,width:this.mask.width,height:this.mask.height};transfers.push(data.buffer);}
      worker.postMessage({pixels:pixels.buffer,id,intensity,width,height,mask},transfers);
    });
  }
  async renderPreview(){
    if(!this.previewBase)return;
    $('error').hidden=true;
    const generation=++this.generation,id=this.id,intensity=this.intensity;
    for(const {button} of this.cards.values())if(button.dataset.state==='processing')button.dataset.state='ready';
    this.cards.get(id).button.dataset.state='processing';
    this.ready=false;this.updateLabels();this.updateDisabled();this.onStatus(`Preparando ${this.style.name}…`);
    let canvas;
    try{
      const {width,height,data}=this.previewBase;
      const pixels=id==='natural'||intensity===0?data:await this.filter(data.slice(),id,intensity,true,width,height);
      if(generation!==this.generation)return;
      canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
      const url=URL.createObjectURL(await blob(canvas));
      if(generation!==this.generation){URL.revokeObjectURL(url);return;}
      const img=new Image();img.src=url;await img.decode();
      if(generation!==this.generation){URL.revokeObjectURL(url);return;}
      if(this.previewURL)URL.revokeObjectURL(this.previewURL);this.previewURL=url;
      $('result').src=url;$('result').alt=`Fotografia: ${this.style.name}, intensidade ${intensity}%`;
      this.ready=true;this.cards.get(id).button.dataset.state='ready';this.onStatus(`${this.style.name} pronta. Compare, amplie ou baixe.`);
    }catch(error){if(error.name!=='AbortError'&&generation===this.generation){this.cards.get(id).button.dataset.state='failed';this.onError(error.message);this.onStatus(`Falha ao preparar ${this.style.name}. Toque novamente no estilo para tentar ou escolha Melhorada natural.`);}}
    finally{if(canvas)canvas.width=canvas.height=1;if(generation===this.generation)this.updateDisabled();}
  }
  canExport(id){return !!this.base&&(id!==this.id||this.ready)&&this.cards.get(id)?.button.dataset.state==='ready'&&(!STYLES.find(s=>s.id===id)?.selective||!!this.mask);}
  async exportCanvasFor(id,intensity){
    if(!this.canExport(id))throw new Error('Esta versão ainda não está pronta. Escolha-a novamente para tentar.');
    if(id==='natural'||intensity===0)return this.base;
    const {width,height}=this.base;
    const pixels=this.base.getContext('2d').getImageData(0,0,width,height);
    const out=await this.filter(pixels.data,id,intensity,false,width,height);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').putImageData(new ImageData(out,width,height),0,0);return canvas;
  }
  async exportCanvas(){if(!this.ready)throw new Error('Aguarde a prévia ficar pronta.');return this.exportCanvasFor(this.id,this.intensity);}
  async openZoom(){
    if(this.locked||!this.ready)return;
    this.onLock(true);this.onStatus('Preparando visualização em resolução original…');let canvas;
    try{
      canvas=await this.exportCanvas();const image=await blob(canvas);
      this.clearZoom();this.zoomURL=URL.createObjectURL(image);
      $('zoom-image').src=this.zoomURL;await $('zoom-image').decode();
      $('zoom-title').textContent=this.id==='natural'?this.style.name:`${this.style.name} · ${this.intensity}%`;
      $('zoom-dialog').showModal();this.zoomMode(false);this.fitZoom();
      this.onStatus('Visualização ampliada pronta.');
    }catch(error){this.onError(error.message);}
    finally{if(canvas&&canvas!==this.base)canvas.width=canvas.height=1;this.onLock(false);}
  }
  setZoom(value){
    this.zoom=Math.max(1,Math.min(200,value));$('zoom-level').value=this.zoom;$('zoom-value').textContent=`${this.zoom}%`;
    $('zoom-image').style.width=`${Math.round(this.base.width*this.zoom/100)}px`;
    $('zoom-image').style.height=`${Math.round(this.base.height*this.zoom/100)}px`;
  }
  fitZoom(){const v=$('zoom-viewport');this.setZoom(Math.min(100,Math.floor(100*Math.min((v.clientWidth-24)/this.base.width,(v.clientHeight-24)/this.base.height))));}
  zoomMode(original){
    $('zoom-image').src=original?this.originalURL:this.zoomURL;
    $('zoom-image').alt=original?'Fotografia original ampliada':`${this.style.name} ampliada`;
    $('zoom-original').setAttribute('aria-pressed',String(original));$('zoom-result').setAttribute('aria-pressed',String(!original));
  }
}
