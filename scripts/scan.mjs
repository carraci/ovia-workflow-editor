import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import ts from 'typescript';
const root = path.resolve(process.argv[2] || '../ovia-inspection');
const out = path.resolve('data'); fs.mkdirSync(out,{recursive:true});
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
const files = ['src','scripts','tests'].filter(dir=>fs.existsSync(path.join(root,dir))).flatMap(dir=>walk(path.join(root,dir))).filter(f=>/\.(ts|tsx|js|jsx|mjs|css)$/.test(f));
const records=[]; const routes=[]; const collections=new Map(); const models=[];
const HTTP = new Set(['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']);
for(const absolute of files){
  const file=path.relative(root,absolute).replaceAll('\\','/');
  const content=fs.readFileSync(absolute,'utf8');
  const ast=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const line=n=>ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
  const imports=[]; const functions=[]; const database=[];
  function visit(n){
    if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
      const spec=n.moduleSpecifier.text;
      const resolved=spec.startsWith('@/')?'src/'+spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):null;
      const actual=resolved&&['.ts','.tsx','/index.ts','/index.tsx',''].map(x=>resolved+x).find(x=>fs.existsSync(path.join(root,x)));
      imports.push({module:spec,file:actual||null,line:line(n),symbols:n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)?n.importClause.namedBindings.elements.map(e=>e.name.text):[]});
    }
    if(ts.isFunctionDeclaration(n)&&n.name){
      const text=n.getText(ast);
      const calls=[];
      function called(c){if(ts.isCallExpression(c)){const name=c.expression.getText(ast); if(/^[A-Za-z_$][\w$]*$/.test(name))calls.push(name);}ts.forEachChild(c,called);}
      called(n);
      functions.push({name:n.name.text,line:line(n),endLine:ast.getLineAndCharacterOfPosition(n.end).line+1,calls:[...new Set(calls)],checks:['authorizeAdminApi','currentUser','customerOrder','originCheck','limit','jwtVerify','verifyPayPalWebhook','requireOwner'].filter(x=>new RegExp('\\b'+x+'\\s*\\(').test(text)),validation:/\.parse\(|\.safeParse\(|schema|Schema/.test(text),externalHosts:[...new Set([...text.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map(m=>m[1]))],errorCodes:[...new Set([...text.matchAll(/(?:ApiError\(|status:\s*)(\d{3})/g)].map(m=>Number(m[1])))]});
    }
    if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){
      const spec=n.arguments[0].text;const resolved=spec.startsWith('@/')?'src/'+spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):null;const actual=resolved&&['.ts','.tsx','/index.ts','/index.tsx'].map(x=>resolved+x).find(x=>fs.existsSync(path.join(root,x)));imports.push({module:spec,file:actual||null,line:line(n),symbols:[],dynamic:true});
    }
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
      const method=n.expression.name.text; const owner=n.expression.expression.getText(ast);
      const arg=n.arguments[0];
      if(arg&&ts.isStringLiteral(arg)&&((['get','find','put','remove'].includes(method)&&/repo|repository/i.test(owner))||method==='collection')){
        const name=arg.text;const evidence={file,line:line(n),method};database.push({collection:name,...evidence});
        if(file.startsWith('src/')){if(!collections.has(name))collections.set(name,[]);collections.get(name).push(evidence);}
      }
    }
    if((ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))&&n.name){
      const fields=[];const members=ts.isInterfaceDeclaration(n)?n.members:ts.isTypeLiteralNode(n.type)?n.type.members:[];
      for(const m of members)if(ts.isPropertySignature(m)&&m.name)fields.push({name:m.name.getText(ast),type:m.type?.getText(ast).replace(/\s+/g,' ').slice(0,180)||'unknown',optional:!!m.questionToken});
      if(fields.length)models.push({name:n.name.text,file,line:line(n),fields});
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
  records.push({file,lines:content.split('\n').length,sha256:crypto.createHash('sha256').update(content).digest('hex'),imports,functions,database});
  if(file.endsWith('/route.ts')){
    const endpoint=file.replace(/^src\/app/,'').replace(/\/route\.ts$/,'');
    for(const f of functions.filter(f=>HTTP.has(f.name))){
      const symbols=new Set(f.calls);
      const services=imports.flatMap(i=>i.symbols.filter(s=>symbols.has(s)).map(symbol=>({symbol,file:i.file,module:i.module})));
      routes.push({id:`${f.name} ${endpoint}`,method:f.name,endpoint,file,line:f.line,checks:f.checks,validation:f.validation,errorCodes:f.errorCodes,services,catchAll:endpoint.includes('...'),coverage:endpoint.includes('...')?'Dispatcher; see explicit subroutes':'File-based route'});
    }
  }
}
// Collections indexed by a literal loop in setupDatabase are evidence too.
const db=fs.readFileSync(path.join(root,'src/server/db.ts'),'utf8');
const start=db.indexOf('export async function setupDatabase');
const loop=db.slice(start).match(/for \(const name of \[([\s\S]*?)\]\)/);
if(loop)for(const m of loop[1].matchAll(/"([\w]+)"/g)){
  if(!collections.has(m[1]))collections.set(m[1],[]);
  const index=db.indexOf('"'+m[1]+'"',start);collections.get(m[1]).push({file:'src/server/db.ts',line:db.slice(0,index).split('\n').length,method:'createIndex(id unique)'});
}
function group(ep){
  if(/auth/.test(ep))return'Authentication';if(/admin/.test(ep)){if(/reports|dashboard|analytics/.test(ep))return'Reports';if(/notifications/.test(ep))return'Notifications';if(/marketing|coupons/.test(ep))return'Marketing';return'Admin';}
  if(/reviews/.test(ep))return'Reviews';if(/search/.test(ep))return'Search';if(/categories/.test(ep))return'Categories';if(/products/.test(ep))return'Products';if(/payments|razorpay/.test(ep))return'Payments';if(/shipping|tracking|delhivery|rates/.test(ep))return'Shipping';if(/return|refund/.test(ep))return'Returns & refunds';if(/cart|checkout/.test(ep))return'Cart & checkout';if(/orders/.test(ep))return'Orders';if(/support|care|contact/.test(ep))return'Support';if(/campaign|newsletter/.test(ep))return'Marketing';if(/account|preferences/.test(ep))return'Account';if(/cron\/mail/.test(ep))return'Notifications';return'Other';
}
routes.forEach(r=>r.group=group(r.endpoint));
const commit=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const inventory={repository:'https://github.com/carraci/ovias-shop',commit,scannedAt:new Date().toISOString(),scope:'All code files under src, scripts and tests. No environment files or credentials were read. Static source inspection; production configuration and provider connectivity were not tested.',files:records,routes,collections:[...collections].sort(([a],[b])=>a.localeCompare(b)).map(([name,evidence])=>({name,evidence})),models,pages:records.filter(r=>r.file.endsWith('/page.tsx')).map(r=>({file:r.file,line:1,route:r.file.replace(/^src\/app/,'').replace(/\/page.tsx$/,'').replace(/\/\([^/]+\)/g,'')||'/'}))};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2));
console.log(JSON.stringify({commit,sourceFiles:records.length,routeFiles:new Set(routes.map(r=>r.file)).size,operations:routes.length,collections:collections.size,models:models.length,pages:inventory.pages.length}));
