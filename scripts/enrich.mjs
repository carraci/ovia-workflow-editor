import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync('data/inventory.json','utf8'));
const fileMap=new Map(d.files.map(f=>[f.file,f]));
for(const route of d.routes){
 const seen=new Set(),services=[],checks=new Set(),db=[],hosts=new Set();
 function explore(file,symbol,depth=0){
  const key=file+':'+symbol;if(seen.has(key)||depth>7)return;seen.add(key);
  const record=fileMap.get(file);if(!record)return;const fn=record.functions.find(f=>f.name===symbol);if(!fn)return;
  fn.checks.forEach(c=>checks.add(c));fn.externalHosts?.forEach(h=>hosts.add(h));
  db.push(...record.database.filter(x=>x.line>=fn.line&&x.line<=fn.endLine));
  for(const call of fn.calls){
   const local=record.functions.find(f=>f.name===call);if(local){explore(file,call,depth+1);continue;}
   const imp=record.imports.find(i=>i.file&&i.symbols.includes(call));if(!imp)continue;
   const target=fileMap.get(imp.file);const targetFn=target?.functions.find(f=>f.name===call);
   if(imp.file.startsWith('src/server')||imp.file.startsWith('src/lib'))services.push({symbol:call,file:imp.file,line:targetFn?.line||1,depth});
   explore(imp.file,call,depth+1);
  }
 }
 explore(route.file,route.method);
 route.reachableChecks=[...checks];route.callScope=[...new Map(services.map(s=>[s.file+':'+s.symbol,s])).values()];route.database=[...new Map(db.map(x=>[x.file+':'+x.line,x])).values()];route.externalHosts=[...hosts];
 route.mappingLimit='Static named-function call scope, up to 7 levels. Conditional calls are alternatives, not a guaranteed sequence. Dynamic imports, returned service factories and object methods may require manual evidence review.';
}
// Explicit dispatch endpoints reviewed against catchall branches.
const catchall='src/app/api/v1/[[...path]]/route.ts';
const specs=[
 ['GET',catchall,['products','search','products/:slug','cart','account','account/orders','orders/:id','orders/:id/tracking','shipping/serviceability','shipping/maps/auto-suggest','admin/orders','admin/orders/:id/tracking']],
 ['POST',catchall,['auth/register','auth/login','auth/resend-verification','auth/forgot-password','auth/verify-otp','auth/reset-password','auth/verify-email','auth/logout','cart/items','checkout','contact','shipping/serviceability','shipping/create','orders/:id/cancel','orders/:id/address','shipping/cancel/:id','admin/orders/:id/shipment','admin/orders/:id/tracking/refresh','admin/orders/:id/shipment/cancel','admin/orders/:id/pickup','admin/orders/:id/shipment/simulate','shipping/maps/standardize-address','shipping/maps/auto-suggest','shipping/maps/route','shipping/maps/optimize-stops']],
 ['PATCH',catchall,['cart/items/:sku']],['DELETE',catchall,['cart/items/:sku']],
 ['GET','src/app/api/v1/care/[[...path]]/route.ts',['tickets','tickets/:id','privacy','security','admin']],
 ['POST','src/app/api/v1/care/[[...path]]/route.ts',['tickets','reply','privacy','export','revoke-session','revoke-other-sessions','revoke-sessions','admin']],
 ['GET','src/app/api/v1/checkout/[[...action]]/route.ts',['session','session/:id']],
 ['POST','src/app/api/v1/checkout/[[...action]]/route.ts',['','quote','paypal','capture/:id','cancel/:id']],
 ['GET','src/app/api/v1/payments/razorpay/[[...action]]/route.ts',['config','sessions','sessions/:id']],
 ['POST','src/app/api/v1/payments/razorpay/[[...action]]/route.ts',['sessions','verify']],
 ['GET','src/app/api/v1/account/addresses/[[...id]]/route.ts',['']],
 ['POST','src/app/api/v1/account/addresses/[[...id]]/route.ts',['']],
 ['PATCH','src/app/api/v1/account/addresses/[[...id]]/route.ts',[':id']],
 ['DELETE','src/app/api/v1/account/addresses/[[...id]]/route.ts',[':id']],
];
d.dispatchEndpoints=specs.flatMap(([method,file,subpaths])=>{const r=d.routes.find(r=>r.file===file&&r.method===method);if(!r)throw Error('Missing catchall method '+file+method);const base=r.endpoint.replace(/\/\[\[\.\.\..+?\]\]$/,'');return subpaths.map(sub=>({method,endpoint:base+(sub?'/'+sub:''),file,line:r.line,dispatcherId:r.id,scope:'Explicit reviewed dispatcher branch; guards and calls must be read per branch.'}));});
d.dispatchEndpoints.push(...['google','apple'].flatMap(provider=>['start','callback'].map(action=>{const method=action==='start'||provider==='apple'?'POST':'GET',file='src/app/api/auth/social/[provider]/[action]/route.ts';return{method,endpoint:`/api/auth/social/${provider}/${action}`,file,line:d.routes.find(r=>r.file===file&&r.method===method).line,scope:'Provider start/callback allowlist in handler'};})));
fs.writeFileSync('data/inventory.json',JSON.stringify(d,null,2));
console.log(`Enriched ${d.routes.length} handlers and ${d.dispatchEndpoints.length} dispatcher endpoints.`);
