export function sampleMask(mask,x,y,width,height){
  const mx=Math.max(0,Math.min(mask.width-1,(x+.5)*mask.width/width-.5));
  const my=Math.max(0,Math.min(mask.height-1,(y+.5)*mask.height/height-.5));
  const x0=Math.floor(mx),y0=Math.floor(my),x1=Math.min(mask.width-1,x0+1),y1=Math.min(mask.height-1,y0+1),fx=mx-x0,fy=my-y0;
  return ((mask.data[y0*mask.width+x0]*(1-fx)+mask.data[y0*mask.width+x1]*fx)*(1-fy)+(mask.data[y1*mask.width+x0]*(1-fx)+mask.data[y1*mask.width+x1]*fx)*fy)/255;
}
export function resizeMask(mask,width,height){
  const data=new Uint8ClampedArray(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=255*sampleMask(mask,x,y,width,height);
  return {width,height,data};
}
export function paintSegment(mask,a,b,radius,value,softness=.4){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x)-radius)),right=Math.min(mask.width-1,Math.ceil(Math.max(a.x,b.x)+radius));
  const top=Math.max(0,Math.floor(Math.min(a.y,b.y)-radius)),bottom=Math.min(mask.height-1,Math.ceil(Math.max(a.y,b.y)+radius));
  const hard=radius*(1-Math.max(0,Math.min(1,softness)));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
    const distance=Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));if(distance>radius)continue;
    const alpha=distance<=hard?1:Math.max(0,(radius-distance)/(radius-hard||1));
    const i=y*mask.width+x;mask.data[i]+= (value-mask.data[i])*alpha;
  }
}
export class MaskHistory{
  constructor(data,limit=12){this.data=data.slice();this.limit=limit;this.undoStack=[];this.redoStack=[];}
  checkpoint(){this.undoStack.push(this.data.slice());if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
  undo(){if(!this.undoStack.length)return false;this.redoStack.push(this.data);this.data=this.undoStack.pop();return true;}
  redo(){if(!this.redoStack.length)return false;this.undoStack.push(this.data);this.data=this.redoStack.pop();return true;}
}
