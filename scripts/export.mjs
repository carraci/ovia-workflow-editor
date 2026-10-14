import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import sharp from 'sharp';
import {arrange,svgGraph} from '../lib/graph.mjs';
const {meta,workflows,integrations,relationships}=JSON.parse(fs.readFileSync('data/workflows.json','utf8'));
const inventory=JSON.parse(fs.readFileSync('data/inventory.json','utf8'));
const out=path.resolve('public/exports');fs.mkdirSync(out,{recursive:true});
const definitions=[];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
for(const w of workflows){
 const graph=arrange(w.nodes,w.edges),svg=svgGraph(w,graph);
 if(!only||only.includes(w.id)){fs.writeFileSync(path.join(out,w.id+'.svg'),svg);fs.writeFileSync(path.join(out,w.id+'.json'),JSON.stringify({schemaVersion:1,semantics:meta.graphSemantics,...w},null,2));
 const info=await sharp(Buffer.from(svg)).metadata();
 const factor=Math.min(2,14000/info.width,14000/info.height,Math.sqrt(50000000/(info.width*info.height)));
 await sharp(Buffer.from(svg),{density:72*factor,limitInputPixels:false}).png().toFile(path.join(out,w.id+'.png'));
 }
 definitions.push({...w,layout:graph});
}
fs.writeFileSync(path.join(out,'workflow-definitions.json'),JSON.stringify({meta,workflows},null,2));fs.writeFileSync(path.join(out,'source-inventory.json'),JSON.stringify(inventory,null,2));
fs.writeFileSync('output/export-layouts.json',JSON.stringify({meta,workflows:definitions},null,2));
const md=[`# OVIA source-code mapping report`,``,`Snapshot: ${meta.commit}`,`Repository: ${meta.repository}`,``,`## Scope and evidence`,`${meta.sourceFiles} code files under src, scripts and tests scanned. ${meta.routeFiles} API route files, ${meta.operations} exported HTTP handlers, ${inventory.dispatchEndpoints.length} explicit dispatcher endpoints, ${inventory.pages.length} page files and ${meta.collections} production-code collection names.`,`${meta.scope}`,``,
 `Implemented means executable code exists for the mapped step; it does not mean deployed configuration was verified. Configured is reserved for actual configuration evidence (none inspected). Planned denotes an extension without an implementation mapping. Unverified denotes runtime state that source inspection cannot establish.`,
 `These are documentation graphs, not n8n automation exports. Branches compose business interactions and do not claim every diagram is one serial handler. Database edges describe application references, not declared MongoDB foreign-key constraints.`,
 ``,`## Findings and incomplete features`,
 `- Native MongoDB driver is used; no Mongoose schemas. TypeScript models and route runtime schemas define data shapes. Atlas hosting topology, cluster region and production collection contents are Unverified.`,
 `- Payment records, provider identifiers, paymentInfo, refunds[], shipping and logisticsOperations are embedded in orders. Wishlist is users.accountWishlist. No standalone payments, shipments or wishlist collection is invented.`,
 `- PayPal order/capture code uses a sandbox endpoint. Live PayPal settlement and automated PayPal/Stripe refund execution are Planned; they must not be presented as deployed features. Legacy Stripe checkout accepts test credentials only.`,
 `- Return/exchange request and owner decision paths exist. Approval records a review decision and cannot disburse a refund. Replacement reservation, automatic reverse pickup and replacement order issuance were not found in those reviewed paths and are Planned.`,
 `- Guards are local to route handlers and server components. Some legacy v1 routes use literal staff role checks; admin APIs normalize OWNER/ADMIN. Guard consistency is a review item, not a change made by this task.`,
 `- originCheck accepts additional hosts including localhost and vercel.app. This report describes the existing source and does not claim a restrictive universal CSRF middleware.`,
 `- db.transaction rejects missing MongoDB before the legacy local JSON adapter. The dormant adapter must not be described as a working fallback.`,
 `- Algolia writes are optional and non-blocking; persistence does not prove index freshness. Mail cron, expiry cron and support realtime readiness depend on actual deployment configuration.`,
 `- Delhivery Maps source contains a hardcoded fallback bearer token. Its value is excluded from all generated inventories and exports. Replacing this fallback with protected configuration is a source security review item.`,
 `- Cloudinary has a URL helper and a health-check UI; admin upload code writes to local public/media/uploads. Meta messaging health checks validate identities, not actual message delivery or webhooks. GA4 measurement-ID validation does not establish tracking-event collection.`,
 `- No production databases, provider transactions, environment secrets or deployed application code were modified. Source code was cloned for inspection only.`,
 ``,`## Workflow coverage`,`| Diagram | Implemented mapped steps | Planned steps | Evidence scope |`,`| --- | ---: | ---: | --- |`,
 ...workflows.map(w=>`| ${w.title} | ${w.nodes.filter(n=>n.status==='Implemented').length} | ${w.nodes.filter(n=>n.status==='Planned').length} | ${w.group} |`),
 ``,`## Integrations`,`| Provider | Code status | Runtime status | Notes |`,`| --- | --- | --- | --- |`,...integrations.map(i=>`| ${i.name} | ${i.status} | ${i.runtimeStatus} | ${i.notes} |`),
 ``,`## API handler inventory`,`Static named-function call scope is not guaranteed execution order. Dynamic imports, service factories, object methods and conditional branches need linked source review. Exported catchall handlers are listed alongside explicit reviewed endpoints in source-inventory.json.`,
 ``,`| Method | Route | Source | Direct checks | Service call scope | Database call scope |`,`| --- | --- | --- | --- | --- | --- |`,...inventory.routes.map(r=>`| ${r.method} | ${r.endpoint} | ${r.file}:${r.line} | ${r.checks.join(', ')||'Not detected / delegated'} | ${r.callScope.map(s=>s.symbol).join(', ')||'Inline / manual review'} | ${[...new Set(r.database.map(x=>x.collection))].join(', ')||'Manual / dynamic review'} |`),
 ``,`## Explicit dispatcher branches`,`| Method | Endpoint | Source |`,`| --- | --- | --- |`,...inventory.dispatchEndpoints.map(r=>`| ${r.method} | ${r.endpoint} | ${r.file}:${r.line} |`),
 ``,`## Application reference fields`,`| Source | Target | Reference | Evidence |`,`| --- | --- | --- | --- |`,...relationships.map(r=>`| ${r.source} | ${r.target} | ${r.label} | ${r.evidence.file}:${r.evidence.line} |`),
 ``,`## Node-to-source mapping`,...workflows.flatMap(w=>[``,`### ${w.title}`, ...w.nodes.map(n=>`- **${n.label}** (${n.status}; ${n.kind}): ${n.evidence.map(e=>`${e.file}:${e.line}`).join('; ')||'Proposed design - no implementation mapping'}. ${n.description}`)]),
 ``,`## Export and verification contract`,`Individual SVGs preserve vectors, PNGs use up to 2x native graph resolution, and PDFs use A4 landscape. Large graph overviews are supplemented by readable detail sheets with numbered cross-page references. Editing the canvas is local; downloads reflect current labels/connections. Static master downloads represent the inspected source snapshot.`,
 `Graph checks are recorded in verification.json. Production runtime operation remains Unverified. See browser-verification.json for interaction verification.`,``];
fs.writeFileSync(path.join(out,'source-code-mapping-report.md'),md.join('\n'));
const python=process.env.OVIA_PDF_PYTHON||'C:/Users/Adarsh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
cp.execFileSync(python,['scripts/export-pdfs.py'],{stdio:'inherit'});
if(fs.existsSync('output/verification.json'))fs.copyFileSync('output/verification.json',path.join(out,'verification.json'));
console.log(`Exported ${workflows.length} SVG, PNG, JSON and PDF diagram sets to ${out}`);
