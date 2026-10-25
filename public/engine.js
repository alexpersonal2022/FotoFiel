// Fixed pixel positions. No synthesis, geometric transforms or facial models.
export function calculateRecipe(data,strength=1) {
  const hist = new Uint32Array(256), sums=[0,0,0]; let count=0;
  const stride = Math.max(1, Math.floor(data.length / 4 / 200000));
  for(let i=0;i<data.length;i+=4*stride) {
    if(data[i+3]<128) continue;
    const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]; hist[Math.round(l)]++; count++;
    if(l>20 && l<235) for(let c=0;c<3;c++) sums[c]+=data[i+c];
  }
  let total=0,median=128;
  for(let i=0;i<256;i++){total+=hist[i];if(total>=count/2){median=i;break;}}
  const percentile=p=>{let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=count*p)return i;}return 255;};
  const low=count?percentile(.01):0,high=count?percentile(.99):255;
  let dark=0;for(let i=0;i<75;i++)dark+=hist[i];
  // A bright sky must not make the global median darken an underexposed foreground.
  const backlit=count>0&&dark/count>.12&&percentile(.85)>160&&median>85&&percentile(.1)<55;
  const shadowExposure=backlit?Math.max(1.6,Math.min(2.3,1.6+(55-percentile(.1))/60)):0;
  const avg=(sums[0]+sums[1]+sums[2])/3;
  return { version:3,strength:Math.max(.5,Math.min(1.5,strength)),backlit,shadowExposure,
    gamma:backlit?1:count ? Math.max(.58,Math.min(1.12,Math.log(.48)/Math.log(Math.max(.02,Math.min(.98,median/255))))):1,
    black:backlit?0:Math.min(12,low*.35),white:backlit?255:255-Math.min(18,(255-high)*.45),
    shadows:backlit?0:count?Math.max(0,Math.min(1,(90-percentile(.25))/90))*.14:0,
    balance:sums.map(s=>s?Math.max(.965,Math.min(1.035,1+(avg/s-1)*.18)):1), sharpness:.45 };
}
export function enhance(data,width,height,recipe,progress=()=>{}) {
  const strength=recipe.strength??1;
  const curve=Float64Array.from({length:256},(_,x)=>{
    const n=x/255,stretched=Math.max(0,Math.min(1,(x-recipe.black)/(recipe.white-recipe.black)));
    const curved=Math.pow(stretched,recipe.gamma);
    let light=n+(curved-n)*(1-n*n);
    light+=recipe.shadows*4*light*(1-light)*(1-light);
    if(recipe.shadowExposure){
      // Monotonic shadow curve anchored at 65%: prevents tonal reversals/flat bands.
      // No face masks or generated pixels; highlights above the anchor stay unchanged.
      const anchor=.65,shadowGamma=Math.pow(2,-recipe.shadowExposure*.5);
      if(n<anchor)light+=anchor*Math.pow(n/anchor,shadowGamma)-n;
    }
    return Math.max(0,Math.min(255,(n+(light-n)*strength)*255));
  });
  for(let y=0;y<height;y++) {
    for(let x=0;x<width;x++) {const i=(y*width+x)*4;if(!data[i+3])continue;
      const r=data[i],g=data[i+1],b=data[i+2],l=.2126*r+.7152*g+.0722*b;
      const base=Math.floor(l),f=l-base,target=curve[base]*(1-f)+curve[Math.min(255,base+1)]*f;
      const gain=l>0?target/l:1;
      // Shared luminance gain avoids the hue drift of independent RGB gamma.
      const colorStrength=strength*(1-Math.pow(l/255,4));
      const rr=r*gain*(1+(recipe.balance[0]-1)*colorStrength),gg=g*gain*(1+(recipe.balance[1]-1)*colorStrength),bb=b*gain*(1+(recipe.balance[2]-1)*colorStrength);
      const max=Math.max(rr,gg,bb),compression=max>255?255/max:1;
      const luminance=(.2126*rr+.7152*gg+.0722*bb)*compression;
      const saturation=1+.045*strength*(1-(max-Math.min(rr,gg,bb))/Math.max(1,max));
      data[i]=luminance+(rr*compression-luminance)*saturation;
      data[i+1]=luminance+(gg*compression-luminance)*saturation;
      data[i+2]=luminance+(bb*compression-luminance)*saturation;
    }
  }
  progress('Ajustando nitidez…');
  // Three rolling rows avoid a second full-size image buffer. Threshold avoids noise boost.
  const row=width*4; let prev=data.slice(0,row),current=data.slice(0,row);
  for(let y=0;y<height;y++){
    const next=data.slice(Math.min(y+1,height-1)*row,Math.min(y+1,height-1)*row+row);
    for(let x=1;x<width-1;x++)for(let c=0;c<3;c++){
      const k=x*4+c, i=y*row+k;
      if(data[y*row+x*4+3]!==255 || current[k-4-c+3]!==255 || current[k+4-c+3]!==255 || prev[k-c+3]!==255 || next[k-c+3]!==255)continue;
      const detail=current[k]-(current[k-4]+current[k+4]+prev[k]+next[k])/4;
      if(Math.abs(detail)>4)data[i]=current[k]+Math.max(-10,Math.min(10,detail*recipe.sharpness*strength));
    }
    prev=current;current=next;
  }
  return data;
}
