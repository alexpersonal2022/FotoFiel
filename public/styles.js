// All styles are deterministic color transforms over the same improved base.
import {sampleMask} from './mask-core.js';
export const STYLES = [
  {id:'natural',name:'Melhorada natural',file:'melhorada_natural'},
  {id:'pb-classico',name:'Preto e branco clássico',file:'pb_classico'},
  {id:'pb-dramatico',name:'Preto e branco dramático',file:'pb_dramatico'},
  {id:'quente',name:'Quente suave',file:'quente_suave'},
  {id:'dourado',name:'Dourado',file:'dourado'},
  {id:'frio',name:'Frio suave',file:'frio_suave'},
  {id:'vivas',name:'Cores vivas',file:'cores_vivas'},
  {id:'suave',name:'Suave',file:'suave'},
  {id:'cinema',name:'Cinematográfico',file:'cinematografico'},
  {id:'vintage',name:'Vintage',file:'vintage'},
  {id:'pessoas-coloridas',name:'Pessoas coloridas, fundo P&B',file:'pessoas_coloridas_fundo_pb',selective:true},
  {id:'pessoas-pb',name:'Pessoas P&B, fundo colorido',file:'pessoas_pb_fundo_colorido',selective:true},
];
const clamp=x=>Math.max(0,Math.min(255,x));
const contrast=(x,amount)=>clamp(x+amount*Math.sin(2*Math.PI*(x/255-.5))*255/(2*Math.PI));
// Returns a NEW buffer, never writes to the supplied base. 0 always equals the base.
export function applyStyle(base,id,intensity=100,context={}){
  if(!STYLES.some(s=>s.id===id))throw new Error('Estilo desconhecido.');
  if(!Number.isFinite(intensity))throw new Error('Intensidade inválida.');
  const out=new Uint8ClampedArray(base),mix=Math.max(0,Math.min(100,intensity))/100;
  if(id==='natural'||mix===0)return out;
  if(STYLES.find(s=>s.id===id).selective){
    const {mask,width,height}=context;
    if(!mask||!mask.data||mask.data.length!==mask.width*mask.height||!(mask.width>0&&mask.height>0)||base.length!==width*height*4)throw new Error('Este estilo precisa de uma seleção de pessoas válida.');
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;if(!base[i+3])continue;
      const selected=sampleMask(mask,x,y,width,height),amount=mix*(id==='pessoas-pb'?selected:1-selected);
      const l=.2126*base[i]+.7152*base[i+1]+.0722*base[i+2];
      for(let c=0;c<3;c++)out[i+c]=base[i+c]+(l-base[i+c])*amount;
    }
    return out;
  }
  for(let i=0;i<base.length;i+=4){
    if(!base[i+3])continue;
    const r=base[i],g=base[i+1],b=base[i+2],l=.2126*r+.7152*g+.0722*b,n=l/255;
    const mid=4*n*(1-n),shadow=(1-n)*(1-n),highlight=n*n;
    let rr=r,gg=g,bb=b;
    switch(id){
      case 'pb-classico':rr=gg=bb=contrast(l,.12);break;
      case 'pb-dramatico':rr=gg=bb=contrast(l,.7);break;
      case 'quente':rr=r+7*mid;gg=g+1.5*mid;bb=b-6*mid;break;
      case 'dourado':rr=r+12*mid;gg=g+5*mid;bb=b-10*mid;break;
      case 'frio':rr=r-5*mid;gg=g+1*mid;bb=b+7*mid;break;
      case 'vivas':{
        const saturation=(Math.max(r,g,b)-Math.min(r,g,b))/255;
        // Lower boosts for already vivid colors. No facial/skin inference.
        const amount=.24*(1-saturation);
        rr=r+(r-l)*amount;gg=g+(g-l)*amount;bb=b+(b-l)*amount;break;
      }
      case 'suave':{
        const target=contrast(l,-.18),delta=target-l;
        rr=r+delta;gg=g+delta;bb=b+delta;break;
      }
      case 'cinema':{
        const delta=contrast(l,.18)-l;
        rr=r+delta-5*shadow+5*highlight;gg=g+delta+2*shadow;bb=b+delta+6*shadow-5*highlight;break;
      }
      case 'vintage':{
        const faded=12+l*.91,delta=faded-l;
        rr=l+(r-l)*.83+delta+4*mid;gg=l+(g-l)*.83+delta+1.5*mid;bb=l+(b-l)*.83+delta-5*mid;break;
      }
    }
    out[i]=r+(clamp(rr)-r)*mix;out[i+1]=g+(clamp(gg)-g)*mix;out[i+2]=b+(clamp(bb)-b)*mix;
  }
  return out;
}
