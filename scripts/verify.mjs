import fs from 'node:fs';
import path from 'node:path';
import {arrange,auditGraph,width,height,wrap} from '../lib/graph.mjs';
const source=path.resolve('../ovia-inspection');const data=JSON.parse(fs.readFileSync('data/workflows.json','utf8'));const inventory=JSON.parse(fs.readFileSync('data/inventory.json','utf8'));
const issues=[];const checks=[];
for(const w of data.workflows){
 const graph=arrange(w.nodes,w.edges);const failures=auditGraph(graph.nodes,graph.edges);failures.forEach(i=>issues.push(w.id+': '+i));
 if(!w.nodes.some(n=>n.kind==='Trigger'))issues.push(w.id+': missing Trigger');if(!w.nodes.some(n=>n.kind==='Response'))issues.push(w.id+': missing Response');if(!w.edges.some(e=>e.failure))issues.push(w.id+': missing error branch');
 for(const n of w.nodes){if(n.status==='Implemented'&&!n.evidence.length)issues.push(w.id+': implemented without evidence '+n.id);for(const e of n.evidence){const absolute=path.join(source,e.file);if(!fs.existsSync(absolute))issues.push('Missing source '+e.file);else{const lines=fs.readFileSync(absolute,'utf8').split('\n');if(e.line<1||e.line>lines.length)issues.push('Invalid line '+e.file+':'+e.line);if(e.symbol&&!lines.slice(e.line-1,e.line+4).join('\n').includes(e.symbol)&&!['get','find','put','remove','collection','createIndex(id unique)'].includes(e.symbol))issues.push('Evidence marker mismatch '+e.file+':'+e.line+' '+e.symbol);}}if(wrap(n.label).some(l=>l.length>29))issues.push('Label wider than node '+n.id);}
 // Check edge routing does not enter unrelated node rectangles.
 let collision=0;
 for(const e of graph.edges)for(let i=1;i<e.points.length;i++){const p=e.points[i-1],q=e.points[i];for(const n of graph.nodes){if(n.id===e.source||n.id===e.target)continue;const x=n.position.x+3,y=n.position.y+3,x2=x+width-6,y2=y+height-6;const steps=Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/5);for(let k=0;k<=steps;k++){const px=p.x+(q.x-p.x)*k/steps,py=p.y+(q.y-p.y)*k/steps;if(px>x&&px<x2&&py>y&&py<y2){collision++;issues.push(`${w.id}: edge ${e.id} crosses ${n.id}`);break;}}}}
 const labels=graph.edges.filter(e=>e.label&&e.labelPosition).map(e=>({...e.labelPosition,id:e.id}));
 for(const l of labels){for(const n of graph.nodes)if(l.x-l.width/2<n.position.x+width&&l.x+l.width/2>n.position.x&&l.y-l.height/2<n.position.y+height&&l.y+l.height/2>n.position.y)issues.push(`${w.id}: label overlaps node ${l.id}`);}
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];if(a.x-a.width/2<b.x+b.width/2&&a.x+a.width/2>b.x-b.width/2&&a.y-a.height/2<b.y+b.height/2&&a.y+a.height/2>b.y-b.height/2)issues.push(`${w.id}: labels overlap ${a.id}/${b.id}`);}
 checks.push({workflow:w.id,nodes:w.nodes.length,edges:w.edges.length,graphIssues:failures.length,connectorNodeCollisions:collision,labelsChecked:labels.length});
}
if(data.workflows.filter(w=>w.group==='Business workflows').length!==20)issues.push('Expected exactly 20 business workflows');
for(const r of inventory.dispatchEndpoints)if(!fs.existsSync(path.join(source,r.file)))issues.push('Missing dispatcher source');
const text=JSON.stringify(data)+JSON.stringify(inventory);if(/mongodb(?:\+srv)?:\/\/[^\s]+|rzp_live_[A-Za-z0-9]{12}|sk_live_[A-Za-z0-9]{12}|re_[A-Za-z0-9]{20}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/.test(text))issues.push('Potential credential literal in generated data');
const report={passed:issues.length===0,verifiedAt:new Date().toISOString(),checks,issues,scope:'Graph connectivity, start/end paths, source evidence locations, node rectangles and connector/node intersections. Edge crossings can exist in dense graphs; crossings are not connections. Runtime provider operation was not tested.'};
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,diagrams:checks.length,nodes:checks.reduce((s,w)=>s+w.nodes,0),issues:issues.slice(0,20),totalIssues:issues.length},null,2));
if(issues.length)process.exitCode=1;
