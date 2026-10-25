// Fixed pixel positions. No synthesis, geometric transforms or facial models.
export function calculateRecipe(data,strength=1,{detail=1,denoise=1}={}) {
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
  return { version:4,strength:Math.max(0,Math.min(1.5,strength)),detail:Math.max(0,Math.min(1.5,detail)),denoise:Math.max(0,Math.min(1.5,denoise)),backlit,shadowExposure,
    gamma:backlit?1:count ? Math.max(.58,Math.min(1.12,Math.log(.48)/Math.log(Math.max(.02,Math.min(.98,median/255))))):1,
    black:backlit?0:Math.min(12,low*.35),white:backlit?255:255-Math.min(18,(255-high)*.45),
    shadows:backlit?0:count?Math.max(0,Math.min(1,(90-percentile(.25))/90))*.14:0,
    balance:sums.map(s=>s?Math.max(.965,Math.min(1.035,1+(avg/s-1)*.18)):1), sharpness:.85 };
}
export function enhance(data,width,height,recipe,progress=()=>{}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw new Error('Dimensões inválidas.');
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
  return refineDetails(data,width,height,recipe,progress);
}

const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;

// Robust high-frequency estimate in low-gradient patches, rather than treating
// every edge or texture as noise. Bounded sampling is independent of image size.
export function estimateNoise(data,width,height){
  if(width<3||height<3)return 0;
  const residual=[],step=Math.max(1,Math.ceil(Math.sqrt(width*height/16000)));
  for(let y=1;y<height-1;y+=step)for(let x=1;x<width-1;x+=step){
    const i=(y*width+x)*4,indices=[i,i-4,i+4,i-width*4,i+width*4];
    if(indices.some(k=>data[k+3]!==255))continue;
    const v=indices.map(k=>luma(data[k],data[k+1],data[k+2]));
    if(v[0]<8||v[0]>247||Math.max(...v)-Math.min(...v)>32)continue;
    residual.push(Math.abs(v[0]-(v[1]+v[2]+v[3]+v[4])*.25));
  }
  if(residual.length<16)return 0;
  residual.sort((a,b)=>a-b);
  return Math.min(18,residual[Math.floor(residual.length/2)]*1.326);
}

function reduceNoise(data,width,height,sigma,amount){
  if(sigma<1||amount<=0||width<3||height<3)return;
  const row=width*4,range=Math.max(6,Math.min(28,sigma*2.7));
  const blend=Math.min(.85,amount*Math.min(.8,sigma/12));
  let previous=data.slice(0,row),current=data.slice(0,row);
  for(let y=0;y<height;y++){
    const next=data.slice(Math.min(y+1,height-1)*row,Math.min(y+1,height-1)*row+row);
    for(let x=1;x<width-1;x++){
      const k=x*4,i=y*row+k;
      if(current[k+3]!==255)continue;
      const center=luma(current[k],current[k+1],current[k+2]);
      let weight=0,r=0,g=0,b=0;
      for(let dy=0;dy<3;dy++)for(let dx=-1;dx<=1;dx++){
        const line=dy===0?previous:dy===1?current:next,vertical=dy===1?2:1;
        const j=k+dx*4;if(line[j+3]!==255)continue;
        const distance=luma(line[j],line[j+1],line[j+2])-center;
        const w=vertical*(dx===0?2:1)/(1+distance*distance/(range*range));
        weight+=w;r+=line[j]*w;g+=line[j+1]*w;b+=line[j+2]*w;
      }
      if(weight){data[i]=current[k]+blend*(r/weight-current[k]);data[i+1]=current[k+1]+blend*(g/weight-current[k+1]);data[i+2]=current[k+2]+blend*(b/weight-current[k+2]);}
    }
    previous=current;current=next;
  }
}

function localLightMap(data,width,height){
  const scale=Math.min(1,768/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const values=new Float32Array(w*h),weights=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(width-1,Math.floor((x+.5)*width/w)),sy=Math.min(height-1,Math.floor((y+.5)*height/h)),i=(sy*width+sx)*4;
    const alpha=data[i+3]/255;values[y*w+x]=luma(data[i],data[i+1],data[i+2])*alpha;weights[y*w+x]=alpha;
  }
  // Separable box sums, including alpha weights. Maps are limited to 768 x 768
  // even for 40 MP images; no second full-resolution image buffer.
  const radius=Math.max(2,Math.round(Math.max(w,h)*.012));
  function blur(input){
    const temp=new Float32Array(w*h),output=new Float32Array(w*h);
    for(let y=0;y<h;y++){
      let sum=0;for(let x=0;x<=Math.min(w-1,radius);x++)sum+=input[y*w+x];
      for(let x=0;x<w;x++){temp[y*w+x]=sum;if(x-radius>=0)sum-=input[y*w+x-radius];if(x+radius+1<w)sum+=input[y*w+x+radius+1];}
    }
    for(let x=0;x<w;x++){
      let sum=0;for(let y=0;y<=Math.min(h-1,radius);y++)sum+=temp[y*w+x];
      for(let y=0;y<h;y++){output[y*w+x]=sum;if(y-radius>=0)sum-=temp[(y-radius)*w+x];if(y+radius+1<h)sum+=temp[(y+radius+1)*w+x];}
    }
    return output;
  }
  const light=blur(values),alpha=blur(weights);
  for(let i=0;i<light.length;i++)light[i]=alpha[i]>1e-5?light[i]/alpha[i]:0;
  return {data:light,width:w,height:h};
}

// Real non-generative detail work, applied to the original-size pixels. All
// channels share a luminance correction; locations, alpha and geometry remain.
export function refineDetails(data,width,height,recipe,progress=()=>{}){
  const detail=recipe.detail??(recipe.sharpness===0?0:1),denoise=recipe.denoise??1;
  if(width<3||height<3||(!detail&&!denoise))return data;
  progress('Analisando textura e reduzindo ruído…');
  const sigma=estimateNoise(data,width,height);
  reduceNoise(data,width,height,sigma,denoise);
  if(detail<=0)return data;
  progress('Equilibrando contraste local e definição…');
  const map=localLightMap(data,width,height),row=width*4;
  const createRow=y=>{
    y=Math.max(0,Math.min(height-1,y));
    const pixels=data.slice(y*row,(y+1)*row),lum=new Float32Array(width),fine=new Float32Array(width),wide=new Float32Array(width);
    for(let x=0;x<width;x++)lum[x]=luma(pixels[x*4],pixels[x*4+1],pixels[x*4+2]);
    for(let x=0;x<width;x++){
      const left=lum[Math.max(0,x-1)],right=lum[Math.min(width-1,x+1)];
      fine[x]=(left+2*lum[x]+right)/4;
      wide[x]=(lum[Math.max(0,x-2)]+4*left+6*lum[x]+4*right+lum[Math.min(width-1,x+2)])/16;
    }
    return {pixels,lum,fine,wide};
  };
  // Five rolling rows retain the unmodified input to the detail pass.
  let rows=[createRow(-2),createRow(-1),createRow(0),createRow(1),createRow(2)];
  const threshold=Math.max(.6,sigma*(denoise>0?.55:.9));
  const soft=value=>Math.sign(value)*Math.max(0,Math.abs(value)-threshold);
  for(let y=0;y<height;y++){
    const my=Math.max(0,Math.min(map.height-1,(y+.5)*map.height/height-.5)),y0=Math.floor(my),y1=Math.min(map.height-1,y0+1),fy=my-y0;
    const current=rows[2];
    for(let x=2;x<width-2;x++){
      const k=x*4,i=y*row+k;
      if(current.pixels[k+3]!==255||rows[0].pixels[k+3]!==255||rows[1].pixels[k+3]!==255||rows[3].pixels[k+3]!==255||rows[4].pixels[k+3]!==255||current.pixels[k-4+3]!==255||current.pixels[k+4+3]!==255||current.pixels[k-8+3]!==255||current.pixels[k+8+3]!==255)continue;
      const l=current.lum[x];
      const small=(rows[1].fine[x]+2*current.fine[x]+rows[3].fine[x])/4;
      const broad=(rows[0].wide[x]+4*rows[1].wide[x]+6*current.wide[x]+4*rows[3].wide[x]+rows[4].wide[x])/16;
      const mx=Math.max(0,Math.min(map.width-1,(x+.5)*map.width/width-.5)),x0=Math.floor(mx),x1=Math.min(map.width-1,x0+1),fx=mx-x0;
      const background=(map.data[y0*map.width+x0]*(1-fx)+map.data[y0*map.width+x1]*fx)*(1-fy)+(map.data[y1*map.width+x0]*(1-fx)+map.data[y1*map.width+x1]*fx)*fy;
      const micro=.95*soft(l-small)+.65*soft(small-broad);
      const difference=l-background;
      const clarity=.38*difference/(1+Math.abs(difference)/30);
      const highlight=Math.min(1,Math.max(0,(255-l)/22)),shadow=Math.min(1,l/18);
      let delta=Math.max(-18,Math.min(18,(micro+clarity)*detail))*highlight*shadow;
      // Limit halos around text/high-contrast edges using the nearby input range.
      const low=Math.min(current.lum[x-1],l,current.lum[x+1],rows[1].lum[x],rows[3].lum[x]);
      const high=Math.max(current.lum[x-1],l,current.lum[x+1],rows[1].lum[x],rows[3].lum[x]);
      delta=Math.max(low-2-l,Math.min(high+2-l,delta));
      const r=current.pixels[k],g=current.pixels[k+1],b=current.pixels[k+2];
      delta=Math.max(-Math.min(r,g,b),Math.min(255-Math.max(r,g,b),delta));
      data[i]=r+delta;data[i+1]=g+delta;data[i+2]=b+delta;
    }
    rows.shift();rows.push(createRow(y+3));
  }
  return data;
}
