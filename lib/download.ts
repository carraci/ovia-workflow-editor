import type { Workflow } from './types';
import { svgGraph, arrange, routePositions } from './graph.mjs';
export function saveFile(name:string,blob:Blob){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function raster(svg:string,scale=2){
 const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try { const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');const factor=Math.min(scale,16000/img.width,16000/img.height,Math.sqrt(60000000/(img.width*img.height)));canvas.width=Math.ceil(img.width*factor);canvas.height=Math.ceil(img.height*factor);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas; } finally { URL.revokeObjectURL(url); }
}
export async function exportWorkflow(workflow:Workflow,format:'svg'|'png'|'pdf'|'json',positions?:Record<string,{x:number;y:number}>){
 if(format==='json'){saveFile(`${workflow.id}.json`,new Blob([JSON.stringify({schemaVersion:1,semantics:'Documentation graph; not n8n execution format',...workflow,positions},null,2)],{type:'application/json'}));return;}
 if(!workflow.nodes.length)throw Error('Add a node before exporting this diagram.');
 let graph=arrange(workflow.nodes,workflow.edges);if(positions){const routed=routePositions(graph.nodes.map(n=>({...n,position:positions[n.id]||n.position})),workflow.edges);graph={...graph,...routed};}
 const svg=svgGraph(workflow,graph);
 if(format==='svg'){saveFile(`${workflow.id}.svg`,new Blob([svg],{type:'image/svg+xml'}));return;}
 if(format==='png'){const canvas=await raster(svg);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG export failed')),'image/png'));saveFile(`${workflow.id}.png`,blob);return;}
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const overview=await raster(svg,1);const fit=Math.min(273/overview.width,175/overview.height);pdf.addImage(overview.toDataURL('image/png'),'PNG',(297-overview.width*fit)/2,14,overview.width*fit,overview.height*fit);pdf.setFontSize(8);pdf.setTextColor('#758195');pdf.text('Architecture overview. Readable detail pages follow; references use local page numbers.',12,201);
 const chunks:Workflow['nodes'][]=[];for(let i=0;i<workflow.nodes.length;i+=4)chunks.push(workflow.nodes.slice(i,i+4));
 // Printable pages keep full labels, evidence and continuation references in a 2x2 card grid.
 for(let page=0;page<chunks.length;page++){
  pdf.addPage();pdf.setFont('helvetica','bold');pdf.setFontSize(17);pdf.setTextColor('#23344b');pdf.text(workflow.title,12,17);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.setTextColor('#758195');pdf.text(`OVIA / source-based architecture / page ${page+2} of ${chunks.length+1}`,12,25);
  chunks[page].forEach((node,i)=>{const x=12+(i%2)*138,y=34+Math.floor(i/2)*78;pdf.setDrawColor('#dce3eb');pdf.roundedRect(x,y,132,72,3,3);pdf.setFontSize(9);pdf.setTextColor('#758195');pdf.text(`${node.kind} / ${node.status}`,x+5,y+8);pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.setTextColor('#23344b');pdf.text(pdf.splitTextToSize(node.label,121).slice(0,2),x+5,y+16);pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.text(pdf.splitTextToSize(node.description,121).slice(0,5),x+5,y+30);pdf.setTextColor('#758195');const ev=node.evidence[0];pdf.setFontSize(7);if(ev)pdf.text(pdf.splitTextToSize(`${ev.file}:${ev.line}`,121).slice(0,2),x+5,y+53);const targets=workflow.edges.filter(e=>e.source===node.id).map(e=>`${e.label||'Next'} -> ${workflow.nodes.findIndex(n=>n.id===e.target)+1} (p${Math.floor(workflow.nodes.findIndex(n=>n.id===e.target)/4)+2})`);pdf.text(pdf.splitTextToSize(`#${workflow.nodes.indexOf(node)+1} | ${targets.join('; ')||'End'}`,121).slice(0,2),x+5,y+63);});
  pdf.setFontSize(8);pdf.text('Documentation graph only. Planned steps are proposals. Runtime connectivity is Unverified.',12,201);
 }
 // Preserve an unabridged connection register even for large or edited diagrams.
 pdf.addPage();pdf.setFontSize(14);pdf.text('Directed connection register',12,17);pdf.setFontSize(8);let y=28;for(const edge of workflow.edges){const line=`${workflow.nodes.find(n=>n.id===edge.source)?.label||edge.source} -> ${workflow.nodes.find(n=>n.id===edge.target)?.label||edge.target} | ${edge.label||'Next'}${edge.failure?' | Failure':''}${edge.proposed?' | Planned':''}`;const rows=pdf.splitTextToSize(line,271);if(y+rows.length*4>196){pdf.addPage();y=18;}pdf.text(rows,12,y);y+=rows.length*4+3;}
 pdf.save(`${workflow.id}.pdf`);
}
