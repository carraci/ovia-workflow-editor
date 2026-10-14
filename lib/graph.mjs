import dagre from '@dagrejs/dagre';
export const width=248,height=122;
export const colors={Frontend:'#3979de',Backend:'#8855c6',API:'#db8a2d',Database:'#369969',External:'#219a97',Errors:'#d65c65',Admin:'#687381'};
export function arrange(nodes,edges,direction='LR'){
 const g=new dagre.graphlib.Graph({multigraph:true});g.setGraph({rankdir:direction,nodesep:76,ranksep:140,marginx:36,marginy:36});g.setDefaultEdgeLabel(()=>({}));
 nodes.forEach(n=>g.setNode(n.id,{width,height}));
 edges.forEach(e=>{if(g.hasNode(e.source)&&g.hasNode(e.target))g.setEdge(e.source,e.target,{width:e.label?Math.min(180,e.label.length*5.2):0,height:e.label?24:0},e.id);});
 dagre.layout(g);
 const placed=nodes.map(n=>({...n,position:{x:g.node(n.id).x-width/2,y:g.node(n.id).y-height/2}}));
 const routed=edges.map(e=>{const v=g.edge({v:e.source,w:e.target,name:e.id});return {...e,points:v?.points||[],labelPosition:v?.x!==undefined?{x:v.x,y:v.y}:null};});
 const compact=direction==='LR'&&nodes[0]?.id.startsWith('20-master-commerce');
 if(compact)placed.forEach((n,i)=>{n.position={x:36+(i%4)*398,y:36+Math.floor(i/4)*220};});
 const router=createRouter(placed);const labels=[];
 for(const e of routed){const s=placed.find(n=>n.id===e.source),t=placed.find(n=>n.id===e.target);if(!s||!t)continue;
  const start={x:s.position.x+width,y:s.position.y+height/2},end={x:t.position.x,y:t.position.y+height/2};
  const pts=[start,...e.points.slice(1,-1),end];
  const collides=pts.some((p,i)=>i>0&&placed.some(n=>n.id!==e.source&&n.id!==e.target&&segmentHits(p,pts[i-1],n.position.x+2,n.position.y+2,width-4,height-4)));
  e.points=collides||direction==='TB'||compact?router(start,end):pts;
  if(e.label){e.labelPosition=placeLabel(e.points,e.label,placed,labels);labels.push(e.labelPosition);}
 }
 return {nodes:placed,edges:routed,width:g.graph().width,height:g.graph().height};
}
function segmentHits(p,q,x,y,w,h){
 const dx=q.x-p.x,dy=q.y-p.y;let lo=0,hi=1;
 for(const [a,b]of [[-dx,p.x-x],[dx,x+w-p.x],[-dy,p.y-y],[dy,y+h-p.y]]){if(a===0){if(b<=0)return false;}else{const u=b/a;if(a<0)lo=Math.max(lo,u);else hi=Math.min(hi,u);if(lo>=hi)return false;}}
 return hi>0&&lo<1;
}
function createRouter(nodes){
 const rects=nodes.map(n=>({x:n.position.x-12,y:n.position.y-12,w:width+24,h:height+24}));
 const xs=[...new Set(nodes.flatMap(n=>[n.position.x-20,n.position.x+width+20]))].sort((a,b)=>a-b);
 const ys=[...new Set(nodes.flatMap(n=>[n.position.y-20,n.position.y+height+20,n.position.y+height/2]))].sort((a,b)=>a-b);
 xs.unshift(xs[0]-70);xs.push(xs.at(-1)+70);ys.unshift(ys[0]-70);ys.push(ys.at(-1)+70);
 const nx=xs.length,ny=ys.length,valid=new Uint8Array(nx*ny),neighbors=new Map();
 for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){const x=xs[ix],y=ys[iy];valid[iy*nx+ix]=rects.some(r=>x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h)?0:1;}
 function linked(key){if(neighbors.has(key))return neighbors.get(key);const ix=key%nx,iy=Math.floor(key/nx),p={x:xs[ix],y:ys[iy]},out=[];for(const [jx,jy]of [[ix-1,iy],[ix+1,iy],[ix,iy-1],[ix,iy+1]]){if(jx<0||jx>=nx||jy<0||jy>=ny)continue;const k=jy*nx+jx;if(!valid[k])continue;const q={x:xs[jx],y:ys[jy]};if(!rects.some(r=>segmentHits(p,q,r.x,r.y,r.w,r.h)))out.push({key:k,length:Math.abs(q.x-p.x)+Math.abs(q.y-p.y)});}neighbors.set(key,out);return out;}
 function heapPush(heap,item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;}
 function heapPop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
 return (start,end)=>{
  const p={x:start.x+20,y:start.y},q={x:end.x-20,y:end.y};const a=ys.indexOf(p.y)*nx+xs.indexOf(p.x),b=ys.indexOf(q.y)*nx+xs.indexOf(q.x);
  const cost=new Map([[a,0]]),parent=new Map(),heap=[];const heuristic=k=>Math.abs(xs[k%nx]-q.x)+Math.abs(ys[Math.floor(k/nx)]-q.y);heapPush(heap,{key:a,f:heuristic(a),cost:0});
  while(heap.length){const item=heapPop(heap),k=item.key;if(item.cost!==cost.get(k))continue;if(k===b)break;
   for(const next of linked(k)){const prev=parent.get(k),bend=prev!==undefined&&((prev%nx===k%nx)!==(k%nx===next.key%nx))?18:0;const value=item.cost+next.length+bend;if(value<(cost.get(next.key)??Infinity)){cost.set(next.key,value);parent.set(next.key,k);heapPush(heap,{key:next.key,cost:value,f:value+heuristic(next.key)});}}
  }
  if(!cost.has(b))return[start,{x:start.x+45,y:start.y},{x:start.x+45,y:end.y},end];
  const result=[];let k=b;while(k!==undefined){result.unshift({x:xs[k%nx],y:ys[Math.floor(k/nx)]});k=parent.get(k);}
  const points=[start,...result,end];return points.filter((p,i)=>i===0||i===points.length-1||!((points[i-1].x===p.x&&points[i+1].x===p.x)||(points[i-1].y===p.y&&points[i+1].y===p.y)));
 };
}
export function routePositions(nodes,edges){
 const router=createRouter(nodes),labels=[];
 return {nodes,edges:edges.map(e=>{const s=nodes.find(n=>n.id===e.source),t=nodes.find(n=>n.id===e.target);if(!s||!t)return{...e,points:[],labelPosition:null};const points=router({x:s.position.x+width,y:s.position.y+height/2},{x:t.position.x,y:t.position.y+height/2});const labelPosition=e.label?placeLabel(points,e.label,nodes,labels):null;if(labelPosition)labels.push(labelPosition);return{...e,points,labelPosition};})};
}
function placeLabel(points,text,nodes,labels){
 const lw=Math.min(170,Math.max(60,text.length*5.2)),lh=wrap(text,29,2).length*12+8;
 const segments=points.slice(1).map((p,i)=>({p:points[i],q:p,length:Math.hypot(p.x-points[i].x,p.y-points[i].y)})).sort((a,b)=>b.length-a.length);
 const free=(x,y)=>!nodes.some(n=>x-lw/2<n.position.x+width+5&&x+lw/2>n.position.x-5&&y-lh/2<n.position.y+height+5&&y+lh/2>n.position.y-5)&&!labels.some(l=>x-lw/2<l.x+l.width/2+5&&x+lw/2>l.x-l.width/2-5&&y-lh/2<l.y+l.height/2+5&&y+lh/2>l.y-l.height/2-5);
 for(const s of segments)for(const fraction of [.5,.25,.75,.1,.9])for(const offset of [-15,15,-30,30,-45,45,0]){const x=s.p.x+(s.q.x-s.p.x)*fraction,y=s.p.y+(s.q.y-s.p.y)*fraction+offset;if(free(x,y))return{x,y,width:lw,height:lh};}
 const maxY=Math.max(...nodes.map(n=>n.position.y+height));let x=points[0].x,y=maxY+40;while(!free(x,y))y+=lh+8;return{x,y,width:lw,height:lh};
}
export function wrap(text,max=29,lines=2){
 const words=String(text).split(/\s+/),result=[];let current='';
 for(let word of words){while(word.length>max){if(current){result.push(current);current='';}result.push(word.slice(0,max-1)+'-');word=word.slice(max-1);}if(current&&current.length+word.length+1>max){result.push(current);current=word;}else current+=(current?' ':'')+word;}
 if(current)result.push(current);
 if(result.length>lines){result.length=lines;result[lines-1]=result[lines-1].slice(0,max-1)+'…';}
 return result;
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function svgGraph(workflow,provided){
 const graph=provided||arrange(workflow.nodes,workflow.edges);
 const ns=graph.nodes;const es=graph.edges;const pad=34,top=94;
 const labelBoxes=es.filter(e=>e.label&&e.labelPosition).map(e=>e.labelPosition);
 const routePoints=es.flatMap(e=>e.points||[]);
 const minX=Math.min(0,...ns.map(n=>n.position.x),...routePoints.map(p=>p.x),...labelBoxes.map(l=>l.x-(l.width||170)/2)),minY=Math.min(0,...ns.map(n=>n.position.y),...routePoints.map(p=>p.y),...labelBoxes.map(l=>l.y-(l.height||24)/2));
 const maxX=Math.max(...ns.map(n=>n.position.x+width),...routePoints.map(p=>p.x),...labelBoxes.map(l=>l.x+(l.width||170)/2)),maxY=Math.max(...ns.map(n=>n.position.y+height),...routePoints.map(p=>p.y),...labelBoxes.map(l=>l.y+(l.height||24)/2));
 const canvasWidth=maxX-minX+pad*2,canvasHeight=maxY-minY+top+pad+55;
 const dx=pad-minX,dy=top-minY;
 const paths=es.map(e=>{const s=ns.find(n=>n.id===e.source),t=ns.find(n=>n.id===e.target);if(!s||!t)return'';const pts=e.points?.length?e.points:[{x:s.position.x+width,y:s.position.y+height/2},{x:t.position.x,y:t.position.y+height/2}];const color=e.failure?colors.Errors:e.proposed?'#a98a48':'#a1adb9';const label=e.labelPosition||{x:(pts[0].x+pts.at(-1).x)/2,y:(pts[0].y+pts.at(-1).y)/2-12,width:170,height:24};const labelText=wrap(e.label||'',29,2);return `<path d="M${pts.map(p=>`${p.x+dx},${p.y+dy}`).join(' L')}" fill="none" stroke="${color}" stroke-width="1.6" ${e.proposed?'stroke-dasharray="6 4"':''} marker-end="url(#arrow${e.failure?'Error':''})"/>${e.label?`<rect x="${label.x+dx-(label.width||170)/2}" y="${label.y+dy-(label.height||24)/2}" width="${label.width||170}" height="${label.height||24}" rx="4" fill="#fff"/><text text-anchor="middle" font-size="10" fill="${color}">${labelText.map((l,i)=>`<tspan x="${label.x+dx}" y="${label.y+dy-(labelText.length-1)*6+3+i*12}">${esc(l)}</tspan>`).join('')}</text>`:''}`;}).join('');
 const cards=ns.map(n=>{const x=n.position.x+dx,y=n.position.y+dy,c=colors[n.category]||colors.Backend;const title=wrap(n.label);const ev=n.evidence?.[0];return `<g><title>${esc(n.description)}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#fff" stroke="${c}" stroke-opacity=".48" ${n.status==='Planned'?'stroke-dasharray="5 4"':''}/><rect x="${x+14}" y="${y+15}" width="27" height="27" rx="7" fill="${c}" fill-opacity=".1"/><text x="${x+27.5}" y="${y+33}" text-anchor="middle" font-size="15" fill="${c}">${esc(({Frontend:'↗',Database:'▤',API:'↔',Backend:'◆',External:'◎',Errors:'!',Admin:'⌘'})[n.category]||'◆')}</text><text x="${x+51}" y="${y+31}" font-size="10" font-weight="600" fill="${c}">${esc(n.kind)}</text><text x="${x+16}" y="${y+59}" font-size="13" font-weight="600" fill="#243449">${title.map((l,i)=>`<tspan x="${x+16}" dy="${i?18:0}">${esc(l)}</tspan>`).join('')}</text><path d="M${x+16} ${y+92}H${x+width-16}" stroke="#edf0f3"/><circle cx="${x+20}" cy="${y+107}" r="3" fill="${n.status==='Planned'?'#ba8d36':c}"/><text x="${x+29}" y="${y+110}" font-size="9" fill="#64748b">${esc(n.status)}</text><text x="${x+width-16}" y="${y+110}" text-anchor="end" font-size="9" fill="#7a8898">${ev?`source :${ev.line}`:'proposed design'}</text></g>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#a1adb9"/></marker><marker id="arrowError" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#d65c65"/></marker><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#e0e6ed"/></pattern></defs><rect width="100%" height="100%" fill="#fff"/><rect y="76" width="100%" height="${canvasHeight-76}" fill="url(#grid)"/><text x="34" y="30" font-family="Arial,sans-serif" fill="#778497" font-size="10" letter-spacing="2">OVIA / WORKFLOW ATLAS</text><text x="34" y="57" font-family="Arial,sans-serif" fill="#23344b" font-size="19" font-weight="700">${esc(workflow.title)}</text><g font-family="Arial,sans-serif">${paths}${cards}</g><text x="34" y="${canvasHeight-18}" font-family="Arial,sans-serif" fill="#778497" font-size="10">Source-based documentation | Dashed edges: proposed | Runtime connectivity: Unverified | Not an executable n8n workflow</text></svg>`;
}
export function auditGraph(nodes,edges){
 const ids=new Set(nodes.map(n=>n.id)),issues=[];if(ids.size!==nodes.length)issues.push('Duplicate node IDs');
 for(const e of edges)if(!ids.has(e.source)||!ids.has(e.target))issues.push(`Dangling connection: ${e.id}`);
 const incoming=new Set(edges.map(e=>e.target)),outgoing=new Set(edges.map(e=>e.source));
 const starts=nodes.filter(n=>!incoming.has(n.id));const ends=nodes.filter(n=>!outgoing.has(n.id));
 if(!starts.length)issues.push('No start node');if(!ends.length)issues.push('No end node');
 for(const n of nodes)if(!incoming.has(n.id)&&!outgoing.has(n.id))issues.push(`Disconnected node: ${n.label}`);
 const visited=new Set(),queue=starts.map(n=>n.id);while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);queue.push(...edges.filter(e=>e.source===id).map(e=>e.target));}
 for(const n of nodes)if(!visited.has(n.id))issues.push(`Unreachable node: ${n.label}`);
 const canEnd=new Set(),reverse=ends.map(n=>n.id);while(reverse.length){const id=reverse.shift();if(canEnd.has(id))continue;canEnd.add(id);reverse.push(...edges.filter(e=>e.target===id).map(e=>e.source));}
 for(const n of nodes)if(!canEnd.has(n.id))issues.push(`No end path: ${n.label}`);
 const positioned=nodes.filter(n=>n.position);for(let i=0;i<positioned.length;i++)for(let j=i+1;j<positioned.length;j++){const a=positioned[i],b=positioned[j];if(a.position.x<b.position.x+width&&a.position.x+width>b.position.x&&a.position.y<b.position.y+height&&a.position.y+height>b.position.y)issues.push(`Overlapping nodes: ${a.label} / ${b.label}`);}
 return issues;
}
