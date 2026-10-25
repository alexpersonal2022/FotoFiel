import {resizeMask,paintSegment,MaskHistory} from './mask-core.js';
const $=id=>document.getElementById(id);
export class Selection{
  constructor({onMask,onUnavailable}){
    this.onMask=onMask;this.onUnavailable=onUnavailable;this.job=0;this.tool='include';
    $('selection-retry').onclick=()=>this.run();
    $('selection-edit').onclick=()=>this.openEditor();
    $('selection-manual').onclick=()=>{this.stop();this.state('manual','Seleção manual: use Incluir para marcar as pessoas. Nada foi selecionado automaticamente.');this.openEditor(true);};
    $('mask-cancel').onclick=()=>$('mask-dialog').close();
    $('mask-dialog').onclose=()=>this.closeEditor();
    $('zoom-dialog').addEventListener('close',()=>this.releaseResult());
    $('mask-apply').onclick=()=>this.apply();
    document.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>this.setTool(b.dataset.brush));
    $('mask-undo').onclick=()=>this.historyStep('undo');$('mask-redo').onclick=()=>this.historyStep('redo');
    for(const [id,suffix] of [['brush-size',''],['brush-softness','%']])$(id).oninput=()=>$(id+'-value').textContent=$(id).value+suffix;
    $('mask-visible').onchange=()=>{$('mask-overlay').style.opacity=$('mask-visible').checked?'1':'0';};
    $('mask-fit').onclick=()=>this.fit();$('mask-actual').onclick=()=>this.zoom(100);$('mask-zoom').oninput=()=>this.zoom(Number($('mask-zoom').value));
    const overlay=$('mask-overlay');overlay.onpointerdown=e=>this.pointerDown(e);overlay.onpointermove=e=>this.pointerMove(e);
    overlay.onpointerup=e=>this.pointerEnd(e);overlay.onpointercancel=e=>this.pointerEnd(e);
    document.addEventListener('keydown',e=>{
      if(!$('mask-dialog').open)return;
      if(!(e.ctrlKey||e.metaKey))return;
      if(e.key.toLowerCase()==='z'){e.preventDefault();this.historyStep(e.shiftKey?'redo':'undo');}
      else if(e.key.toLowerCase()==='y'){e.preventDefault();this.historyStep('redo');}
    });this.clear();
  }
  state(value,text){$('segmentation-status').dataset.state=value;$('segmentation-status').textContent=text;this.buttons();}
  buttons(){
    $('selection-retry').disabled=!this.base||!!this.worker||this.pending||this.locked;
    $('selection-edit').disabled=!this.base||!this.mask||this.locked;
    $('selection-manual').disabled=!this.base||this.locked;$('selection-manual').hidden=!!this.mask;
  }
  setBusy(value){this.locked=value;if(!value)this.releaseResult();this.buttons();}
  releaseResult(){const resolve=this.waiting;this.waiting=null;resolve?.();}
  async waitForIdle(job){while(job===this.job&&(this.locked||$('zoom-dialog').open)){this.state('processing','Seleção calculada. Será aplicada ao terminar a exportação ou fechar a ampliação.');await new Promise(resolve=>this.waiting=resolve);}}
  stop(){this.job++;clearTimeout(this.timeout);this.worker?.terminate();this.worker=null;this.pending=false;this.releaseResult();this.buttons();}
  clear(){
    this.stop();if($('mask-dialog').open)$('mask-dialog').close();this.closeEditor();
    this.base=null;this.mask=null;this.state('idle','Selecione uma fotografia para segmentar as pessoas.');
  }
  snapshot(){return this.mask?{mask:{width:this.mask.width,height:this.mask.height,data:this.mask.data.slice()},source:this.source}:null;}
  start(base,previous){
    this.base=base;
    if(previous&&previous.mask.width===base.width&&previous.mask.height===base.height){
      const job=this.job;
      this.onMask(previous.mask).then(()=>{if(job!==this.job)return;this.mask=previous.mask;this.source=previous.source;this.state('ready',`Seleção ${this.source==='automatic'?'automática':this.source==='manual'?'manual':'revisada'} mantida após ajustar a melhoria natural.`);}).catch(()=>{if(job===this.job)this.run();});
    }else this.run();
  }
  async run(){
    if(!this.base||this.worker||this.pending)return;
    this.stop();const job=this.job;
    this.state('processing','Preparando segmentação local. A melhoria natural e os filtros globais já podem ser usados.');
    const c=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(this.base.width,this.base.height));
    c.width=Math.max(1,Math.round(this.base.width*scale));c.height=Math.max(1,Math.round(this.base.height*scale));
    const full=document.createElement('canvas');full.width=this.base.width;full.height=this.base.height;full.getContext('2d').putImageData(this.base,0,0);
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(full,0,0,c.width,c.height);const image=ctx.getImageData(0,0,c.width,c.height);
    c.width=c.height=full.width=full.height=1;
    const fail=message=>{
      if(job!==this.job)return;this.stop();
      this.onUnavailable();
      this.state('failed',`${message} ${this.mask?'A seleção anterior foi mantida.':'Use Criar seleção manual ou repita a segmentação.'} A melhoria natural e os demais filtros continuam disponíveis.`);
    };
    try{
      this.worker=new Worker(new URL('./segmentation-worker.js',import.meta.url));this.buttons();
      this.timeout=setTimeout(()=>fail('A segmentação excedeu dois minutos.'),120000);
      this.worker.onerror=e=>{e.preventDefault();fail('Não foi possível iniciar o modelo local.');};
      this.worker.onmessage=async({data})=>{
        if(job!==this.job)return;
        if(data.message){this.state('processing',data.message);return;}
        if(data.error){fail(`Falha na segmentação: ${data.error}`);return;}
        clearTimeout(this.timeout);this.worker.terminate();this.worker=null;
        if(!data.selected){this.onUnavailable();this.state('empty',`O modelo não encontrou pessoas com confiança suficiente. ${this.mask?'Seleção anterior mantida.':'Nenhuma seleção foi criada; selecione manualmente ou tente novamente.'} Os filtros globais continuam disponíveis.`);return;}
        try{
          const mask=resizeMask({data:new Uint8ClampedArray(data.mask),width:data.width,height:data.height},this.base.width,this.base.height);
          this.pending=true;await this.waitForIdle(job);if(job!==this.job)return;
          await this.onMask(mask);if(job!==this.job)return;
          this.pending=false;this.mask=mask;this.source='automatic';this.state('ready','Seleção automática pronta. Confira todas as pessoas e corrija cabelos, mãos, roupas e contornos se necessário.');
        }catch(error){fail(`Não foi possível preparar a máscara: ${error.message}`);}
      };
      this.worker.postMessage({pixels:image.data.buffer,width:image.width,height:image.height},[image.data.buffer]);
    }catch(error){fail(error.message);}
  }
  openEditor(empty=false){
    if(!this.base||(!this.mask&&!empty)||this.locked)return;
    if(this.worker||this.pending){this.stop();this.state('ready','Segmentação interrompida para corrigir a seleção existente.');}
    this.emptyDraft=empty;this.history=new MaskHistory(empty?new Uint8ClampedArray(this.base.width*this.base.height):this.mask.data);
    this.overlayImage=new ImageData(this.base.width,this.base.height);
    for(const id of ['mask-base','mask-overlay']){$(id).width=this.base.width;$(id).height=this.base.height;}
    $('mask-base').getContext('2d').putImageData(this.base,0,0);
    $('mask-visible').checked=true;$('mask-overlay').style.opacity='1';this.setTool('include');this.drawOverlay();this.historyButtons();
    $('mask-help').textContent=empty?'Seleção vazia. Pinte todas as pessoas com Incluir. Nada será aplicado até tocar em Aplicar seleção.':'Rosa indica pessoas. Corrija todas as pessoas; os dois estilos usam esta mesma seleção. Ctrl+Z desfaz, Ctrl+Shift+Z refaz.';
    $('mask-dialog').showModal();this.fit();
  }
  closeEditor(){this.history=null;this.overlayImage=null;this.stroke=null;for(const id of ['mask-base','mask-overlay'])$(id).width=$(id).height=1;}
  setTool(tool){
    this.tool=tool;document.querySelectorAll('[data-brush]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brush===tool)));
    $('mask-stage').classList.toggle('pan',tool==='pan');
  }
  zoom(value){if(!this.base)return;value=Math.max(1,Math.min(400,value));$('mask-zoom').value=value;$('mask-zoom-value').textContent=value+'%';$('mask-stage').style.width=Math.round(this.base.width*value/100)+'px';$('mask-stage').style.height=Math.round(this.base.height*value/100)+'px';}
  fit(){const v=$('mask-viewport');this.zoom(Math.min(100,Math.floor(100*Math.min((v.clientWidth-24)/this.base.width,(v.clientHeight-24)/this.base.height))));}
  point(e){const r=$('mask-overlay').getBoundingClientRect();return {x:(e.clientX-r.left)*this.base.width/r.width,y:(e.clientY-r.top)*this.base.height/r.height};}
  pointerDown(e){
    if(!this.history||this.stroke||e.button!==0)return;
    if(this.tool==='pan'){
      if(e.pointerType==='touch')return;
      this.stroke={pan:true,id:e.pointerId,x:e.clientX,y:e.clientY,left:$('mask-viewport').scrollLeft,top:$('mask-viewport').scrollTop};
    }else{
      e.preventDefault();this.history.checkpoint();const point=this.point(e);this.stroke={id:e.pointerId,last:point};this.paint(point,point);
    }
    $('mask-overlay').setPointerCapture(e.pointerId);this.historyButtons();
  }
  pointerMove(e){
    if(!this.stroke||this.stroke.id!==e.pointerId)return;
    if(this.stroke.pan){$('mask-viewport').scrollLeft=this.stroke.left+this.stroke.x-e.clientX;$('mask-viewport').scrollTop=this.stroke.top+this.stroke.y-e.clientY;return;}
    const point=this.point(e);this.paint(this.stroke.last,point);this.stroke.last=point;
  }
  pointerEnd(e){if(this.stroke?.id!==e.pointerId)return;this.stroke=null;if($('mask-overlay').hasPointerCapture(e.pointerId))$('mask-overlay').releasePointerCapture(e.pointerId);this.historyButtons();}
  paint(a,b){
    const radius=Number($('brush-size').value)/2;
    paintSegment({data:this.history.data,width:this.base.width,height:this.base.height},a,b,radius,this.tool==='exclude'?0:255,Number($('brush-softness').value)/100);
    this.drawOverlay({left:Math.floor(Math.min(a.x,b.x)-radius-1),right:Math.ceil(Math.max(a.x,b.x)+radius+1),top:Math.floor(Math.min(a.y,b.y)-radius-1),bottom:Math.ceil(Math.max(a.y,b.y)+radius+1)});
  }
  drawOverlay(rect){
    if(!this.history)return;
    const w=this.base.width,h=this.base.height,r=rect||{left:0,right:w-1,top:0,bottom:h-1};
    const left=Math.max(0,r.left),right=Math.min(w-1,r.right),top=Math.max(0,r.top),bottom=Math.min(h-1,r.bottom),data=this.overlayImage.data;
    if(right<left||bottom<top)return;
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const i=(y*w+x)*4;data[i]=224;data[i+1]=32;data[i+2]=140;data[i+3]=this.history.data[y*w+x]*.5;}
    $('mask-overlay').getContext('2d').putImageData(this.overlayImage,0,0,left,top,right-left+1,bottom-top+1);
  }
  historyButtons(){if(!this.history)return;$('mask-undo').disabled=!this.history.undoStack.length||!!this.stroke;$('mask-redo').disabled=!this.history.redoStack.length||!!this.stroke;}
  historyStep(direction){if(!this.history||this.stroke)return;if(this.history[direction]()){this.drawOverlay();this.historyButtons();}}
  async apply(){
    if(!this.history||this.stroke)return;
    const job=this.job,base=this.base;
    const mask={width:this.base.width,height:this.base.height,data:this.history.data.slice()};$('mask-apply').disabled=true;
    try{
      await this.onMask(mask);if(job!==this.job||base!==this.base)return;this.mask=mask;this.source=this.emptyDraft?'manual':'revised';
      const count=mask.data.reduce((n,v)=>n+(v>127),0);
      this.state('ready',`${this.source==='manual'?'Seleção manual':'Seleção revisada'} aplicada aos dois estilos.${count?' Confira os contornos na visualização ampliada.':' A máscara está vazia: nenhuma pessoa está incluída.'}`);
      $('mask-dialog').close();
    }catch(error){$('mask-help').textContent=`Não foi possível aplicar: ${error.message}`;}
    finally{$('mask-apply').disabled=false;}
  }
}
