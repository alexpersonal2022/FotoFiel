const encode=(canvas,type)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha na exportação: o navegador pode estar sem memória.')),`image/${type}`,.95));
export async function encodeImage(canvas,type){
  if(!['png','jpeg'].includes(type))throw new Error('Formato de exportação inválido.');
  if(type==='png')return encode(canvas,type);
  const flat=document.createElement('canvas');flat.width=canvas.width;flat.height=canvas.height;
  try{const ctx=flat.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,flat.width,flat.height);ctx.drawImage(canvas,0,0);return await encode(flat,type);}finally{flat.width=flat.height=1;}
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
