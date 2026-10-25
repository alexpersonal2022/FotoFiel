import {STYLES} from './styles.js';
import {encodeImage,downloadBlob} from './image-export.js';
const $=id=>document.getElementById(id);
const CACHE_LIMIT=255*1024*1024;
export class BulkExport{
  constructor({styles,onLock,onStatus,getFilename,getFormat}){
    Object.assign(this,{styles,onLock,onStatus,getFilename,getFormat});this.cache=new Map();this.states=new Map();this.running=false;
    styles.onChange=event=>this.change(event);
    $('bulk-download').onclick=()=>this.run();$('bulk-retry').onclick=()=>this.run(true);
    $('bulk-clear').onclick=()=>{styles.picked.clear();for(const {check} of styles.cards.values())check.checked=false;this.change({kind:'selection'});};
    $('bulk-cancel').onclick=()=>{this.cancelled=true;this.zipCancel?.();this.onStatus('Cancelamento solicitado. Aguarde o arquivo atual terminar.');};
    $('bulk-format').value=$('format').value;$('bulk-format').onchange=()=>{$('format').value=$('bulk-format').value;$('format').dispatchEvent(new Event('change',{bubbles:true}));};
    $('format').addEventListener('change',()=>{$('bulk-format').value=$('format').value;this.change({kind:'format'});});this.refresh();
  }
  change(event){
    if(event.kind!=='state')$('bulk-report').textContent='';
    if(event.kind==='selection')for(const id of this.cache.keys())if(!this.styles.picked.has(id)){this.cache.delete(id);this.states.delete(id);}
    if(event.kind==='selection')for(const id of this.states.keys())if(!this.styles.picked.has(id))this.states.delete(id);
    if(event.kind==='clear'||event.kind==='format'){this.cache.clear();this.states.clear();$('bulk-report').textContent='';}
    if(event.kind==='recipe'){this.cache.delete(event.id);this.states.delete(event.id);}
    if(event.kind==='mask')for(const s of STYLES.filter(s=>s.selective)){this.cache.delete(s.id);this.states.delete(s.id);}
    this.refresh();
  }
  refresh(){
    const ids=[...this.styles.picked];const ready=ids.filter(id=>this.styles.canExport(id)).length;
    $('bulk-count').textContent=`${ids.length} selecionada${ids.length===1?'':'s'} · ${ready} pronta${ready===1?'':'s'}`;
    $('bulk-download').disabled=this.running||this.styles.locked||!ready;
    $('bulk-clear').disabled=this.running||this.styles.locked||!ids.length;
    $('bulk-retry').hidden=!ids.some(id=>this.states.get(id)?.state==='failed');$('bulk-retry').disabled=this.running||this.styles.locked;
    $('bulk-cancel').hidden=!this.running;
    $('bulk-list').replaceChildren();
    for(const id of ids){const style=STYLES.find(s=>s.id===id),row=document.createElement('li');row.dataset.bulkItem=id;const state=this.states.get(id);row.textContent=`${style.name}${id==='natural'?'':` · ${this.styles.recipes.get(id)}%`} — ${state?.message||(this.styles.canExport(id)?'Pronta para exportar':'Prévia indisponível')}`;$('bulk-list').append(row);}
  }
  state(id,state,message){this.states.set(id,{state,message});this.refresh();}
  zip(files){return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./zip-worker.js',import.meta.url),{type:'module'});
    const done=()=>{clearTimeout(timer);worker.terminate();this.zipCancel=null;};
    const timer=setTimeout(()=>{done();reject(new Error('O ZIP excedeu dois minutos. Tente novamente com menos versões.'));},120000);
    this.zipCancel=()=>{done();reject(new DOMException('Cancelado','AbortError'));};
    worker.onerror=e=>{e.preventDefault();done();reject(new Error('Não foi possível montar o ZIP. Os arquivos já renderizados foram mantidos para tentar novamente.'));};
    worker.onmessage=({data})=>{if(data.progress){this.onStatus(`Montando ZIP: ${data.progress.completed} de ${data.progress.total} arquivos verificados.`);return;}done();data.error?reject(new Error(data.error)):resolve(data.blob);};
    worker.postMessage({files});
  });}
  async run(retryOnly=false){
    if(this.running||this.styles.locked||!this.styles.base)return;
    const type=this.getFormat(),stem=this.getFilename();
    const entries=[...this.styles.picked].map(id=>{const s=STYLES.find(s=>s.id===id),intensity=this.styles.recipes.get(id)??100;return {...s,intensity,key:`${id}:${intensity}:${type}`,name:`${stem}_${s.file}${id==='natural'?'':`_${intensity}pct`}.${type==='jpeg'?'jpg':'png'}`};});
    if(!entries.length)return;
    this.running=true;this.cancelled=false;$('bulk-report').textContent='';this.onLock(true);this.refresh();
    try{
      for(let index=0;index<entries.length;index++){
        if(this.cancelled)break;
        const entry=entries[index],cached=this.cache.get(entry.id);
        if(cached?.key===entry.key){this.state(entry.id,'ready','Arquivo pronto (reutilizado)');continue;}
        if(retryOnly&&this.states.get(entry.id)?.state!=='failed')continue;
        let canvas;
        try{
          if(!this.styles.canExport(entry.id))throw new Error('Versão indisponível; prepare sua prévia ou seleção antes de repetir.');
          this.state(entry.id,'processing','Renderizando em resolução original');this.onStatus(`Exportando ${index+1} de ${entries.length}: ${entry.name}.`);
          canvas=await this.styles.exportCanvasFor(entry.id,entry.intensity);const blob=await encodeImage(canvas,type);
          const bytes=[...this.cache.values()].reduce((sum,item)=>sum+item.blob.size,0);
          if(bytes+blob.size>CACHE_LIMIT)throw new Error('Limite de memória do lote atingido. Desmarque versões ou use o download individual.');
          this.cache.set(entry.id,{key:entry.key,name:entry.name,blob});this.state(entry.id,'ready','Arquivo pronto');
        }catch(error){this.state(entry.id,'failed',`Falha: ${error.message}`);}
        finally{if(canvas&&canvas!==this.styles.base)canvas.width=canvas.height=1;}
      }
      if(this.cancelled){$('bulk-report').textContent='Lote cancelado. As versões prontas serão reutilizadas ao baixar novamente.';return;}
      const files=entries.map(e=>this.cache.get(e.id)).filter((file,index)=>file?.key===entries[index].key);
      const failures=entries.filter(e=>this.cache.get(e.id)?.key!==e.key);
      if(!files.length)throw new Error('Nenhuma versão ficou pronta. Veja as falhas na lista e tente novamente.');
      const archive=await this.zip(files);if(this.cancelled)return;
      downloadBlob(archive,`${stem}_versoes_${type==='jpeg'?'jpeg':'png'}.zip`);
      $('bulk-report').textContent=`ZIP preparado com ${files.length} arquivo${files.length===1?'':'s'}.${failures.length?` Não incluídas: ${failures.map(s=>s.name).join(', ')}. Use Repetir falhas.`:''}`;
      this.onStatus('ZIP preparado. Confira os downloads do navegador.');
    }catch(error){$('bulk-report').textContent=error.name==='AbortError'?'ZIP cancelado. Arquivos prontos mantidos para tentar novamente.':error.message;}
    finally{this.running=false;this.onLock(false);this.refresh();}
  }
}
