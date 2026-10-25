import { inspectImage } from './image-format.js';
import { StylesView } from './styles-view.js';
import { Selection } from './selection.js';
import { BulkExport } from './bulk-export.js';
import {encodeImage,downloadBlob} from './image-export.js';
const $=id=>document.getElementById(id);
const strengthLabel=document.createElement('label');strengthLabel.htmlFor='strength';strengthLabel.textContent='Intensidade da melhoria';
const strengthSelect=document.createElement('select');strengthSelect.id='strength';
for(const [value,label] of [['0.7','Suave'],['1','Equilibrada'],['1.4','Mais intensa']]){
  const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value==='1';strengthSelect.append(option);
}
const formatLabel=document.querySelector('label[for="format"]');formatLabel.before(strengthLabel,strengthSelect);
strengthSelect.style.marginBottom='18px';
let worker, originalURL, resultURL, output, filename, selectedFile, busy=false;
const status=message=>$('status').textContent=message;
const error=message=>{$('error').textContent=message;$('error').hidden=false;};
const styles=new StylesView({onError:error,onStatus:status,onDownload:()=>$('download').click(),onLock:setBusy,onSelect:()=>mode('result')});
const selection=new Selection({onMask:mask=>styles.setMask(mask),onUnavailable:()=>styles.maskUnavailable()});
const bulk=new BulkExport({styles,onLock:setBusy,onStatus:status,getFilename:()=>filename,getFormat:()=>$('format').value});
function release(){
  selection.clear();
  styles.clear();
  selectedFile=null;
  worker?.terminate();worker=null;
  for(const url of [originalURL,resultURL])if(url)URL.revokeObjectURL(url);
  originalURL=resultURL=null;
  if(output){output.width=1;output.height=1;output=null;}
  for(const id of ['original','result'])$(id).removeAttribute('src');
  $('original-download').removeAttribute('href');
}
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);$('file').disabled=value;$('clear').disabled=value;$('download').disabled=value;$('strength').disabled=value;$('format').disabled=value;$('bulk-format').disabled=value;styles.setBusy(value);selection.setBusy(value);}
function mode(value){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));
  $('result').style.clipPath=value==='result'?'none':value==='original'?'inset(0 100% 0 0)':'';
  $('divider').hidden=value!=='split';$('compare-control').hidden=value!=='split';
  document.querySelector('.badge.left').hidden=value==='result';document.querySelector('.badge.right').hidden=value==='original';
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
$('compare').oninput=()=>{$('stage').style.setProperty('--split',`${$('compare').value}%`);};
async function loadFile(file,{preserveSelection=false}={}){
  if(!file||busy)return;
  $('error').hidden=true;
  if(file.size>25*1024*1024){error('O arquivo excede o limite de 25 MB. Selecione uma foto menor.');return;}
  setBusy(true);let decoded,canvas;
  const previousSelection=preserveSelection&&file===selectedFile?selection.snapshot():null;
  try{
    status('Validando e preparando fotografia…');
    const info=inspectImage(await file.arrayBuffer());
    const url=URL.createObjectURL(new Blob([file],{type:info.type}));
    try{
      decoded=new Image();decoded.src=url;await decoded.decode();
    }finally{URL.revokeObjectURL(url);}
    const width=decoded.naturalWidth,height=decoded.naturalHeight;
    if(!width||!height||width*height>40_000_000)throw new Error('Dimensões não suportadas. O limite é 40 megapixels.');
    release();$('editor').hidden=true;
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});
    if(!ctx)throw new Error('Seu navegador não oferece Canvas 2D. Atualize o navegador.');
    ctx.drawImage(decoded,0,0);decoded.src='';decoded=null;
    const pixels=ctx.getImageData(0,0,width,height);
    originalURL=URL.createObjectURL(file);
    $('original').src=originalURL;
    $('original-download').href=originalURL;$('original-download').download=file.name;
    filename=file.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80)||'foto';
    status('Ajustando iluminação e cores…');
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    const processed=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('O processamento excedeu 2 minutos. Tente novamente ou use uma foto menor.')),120000);
      worker.onmessage=({data})=>{
        if(data.message){status(data.message);return;}
        clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.pixels);
      };
      worker.onerror=()=>{clearTimeout(timer);reject(new Error('Não foi possível iniciar o motor de imagem. Abra o aplicativo pelo endereço http://localhost:3000 em um navegador atualizado.'));};
      worker.postMessage({pixels:pixels.data.buffer,width,height,strength:Number($('strength').value)},[pixels.data.buffer]);
    });
    worker.terminate();worker=null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(processed),width,height),0,0);
    output=canvas;canvas=null;status('Criando prévia…');
    await styles.setBase(output,originalURL);
    await $('result').decode();await $('original').decode();
    $('stage').style.aspectRatio=`${width} / ${height}`;
    $('dimensions').textContent=`${width} × ${height} pixels · dimensões originais com orientação normalizada`;
    $('compare').value=50;$('stage').style.setProperty('--split','50%');mode('split');
    selectedFile=file;
    $('upload').hidden=true;$('editor').hidden=false;status('Pronta. Compare e baixe sua fotografia melhorada.');
    selection.start(styles.previewBase,previousSelection);
  }catch(e){release();$('editor').hidden=true;$('upload').hidden=false;status('');error(e.message||'Não foi possível abrir esta fotografia.');}
  finally{if(canvas){canvas.width=canvas.height=1;}if(decoded)decoded.src='';setBusy(false);$('file').value='';}
}
$('file').onchange=e=>loadFile(e.target.files[0]);
for(const event of ['dragenter','dragover'])$('upload').addEventListener(event,e=>{e.preventDefault();$('upload').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('upload').addEventListener(event,e=>{e.preventDefault();$('upload').classList.remove('dragging');});
$('upload').addEventListener('drop',e=>{if(e.dataTransfer.files.length!==1){error('Selecione uma fotografia por vez.');return;}loadFile(e.dataTransfer.files[0]);});
$('strength').onchange=()=>{if(selectedFile)loadFile(selectedFile,{preserveSelection:true});};
$('clear').onclick=()=>{release();selectedFile=null;$('editor').hidden=true;$('upload').hidden=false;$('error').hidden=true;status('Foto removida da sessão.');$('file').focus();};
$('download').onclick=async()=>{
  if(!output||busy)return;
  setBusy(true);$('error').hidden=true;status('Exportando na resolução original…');let styled;
  try{
    const type=$('format').value;styled=await styles.exportCanvas();const blob=await encodeImage(styled,type);
    const suffix=styles.id==='natural'?styles.style.file:`${styles.style.file}_${styles.intensity}pct`;
    downloadBlob(blob,`${filename}_${suffix}.${type==='jpeg'?'jpg':'png'}`);
    status('Arquivo preparado. Confira os downloads do navegador.');
  }catch(e){error(e.message);status('Falha ao exportar. Sua foto continua disponível para tentar novamente.');}
  finally{if(styled&&styled!==output)styled.width=styled.height=1;setBusy(false);}
};
