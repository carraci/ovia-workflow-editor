import os,json,zipfile,hashlib
from pathlib import Path
from pypdf import PdfReader
root=Path.cwd();out=root/'public'/'exports'
data=json.loads((root/'data'/'workflows.json').read_text(encoding='utf-8'))
checks=[]
normalize=lambda s:' '.join(str(s).replace('\u2014',' - ').replace('\u2013',' - ').replace('\u2192',' -> ').replace('\u2026','...').replace('\u00b7',' / ').split())
for w in data['workflows']:
    paths={ext:out/(w['id']+'.'+ext) for ext in ['svg','png','pdf','json']}
    if any(not p.exists() for p in paths.values()):raise ValueError('Missing export '+w['id'])
    definition=json.loads(paths['json'].read_text(encoding='utf-8'))
    if definition['nodes']!=w['nodes'] or definition['edges']!=w['edges']:raise ValueError('Stale JSON '+w['id'])
    reader=PdfReader(paths['pdf']);text=normalize(' '.join(pg.extract_text() or '' for pg in reader.pages))
    missing=[n['label'] for n in w['nodes'] if normalize(n['label']) not in text]
    if missing:raise ValueError('PDF labels missing '+w['id']+': '+str(missing))
    if not paths['png'].read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('PNG signature '+w['id'])
    svg=paths['svg'].read_text(encoding='utf-8')
    if not svg.startswith('<svg') or not svg.endswith('</svg>'):raise ValueError('SVG document '+w['id'])
    checks.append({'diagram':w['id'],'formats':['svg','png','pdf','json'],'nodes':len(w['nodes']),'allNodeLabelsInPdf':True,'pages':len(reader.pages)})
json.dump({'passed':True,'diagrams':checks},open(out/'export-verification.json','w'),indent=2)
manifest=[]
for p in sorted(out.iterdir()):
    if p.is_file() and p.suffix!='.zip' and p.name!='checksums.json':manifest.append({'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
json.dump(manifest,open(out/'checksums.json','w'),indent=2)
archive=out/'ovia-deliverables.zip'
include_dirs=['app','components','lib','scripts','data']
include_files=['package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts','.gitignore','README.md','start-editor.ps1']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for folder in include_dirs:
        for p in (root/folder).rglob('*'):
            if p.is_file():z.write(p,'ovia-workflow-editor/'+p.relative_to(root).as_posix())
    for name in include_files:
        p=root/name
        if p.exists():z.write(p,'ovia-workflow-editor/'+name)
    for p in out.iterdir():
        if p.is_file() and p.suffix!='.zip':z.write(p,'ovia-workflow-editor/public/exports/'+p.name)
    for name in ['verification.json','browser-verification.json']:
        p=root/'output'/name
        if p.exists():z.write(p,'ovia-workflow-editor/output/'+name)
    for name in ['editor-overview.png','mobile.png']:
        p=root/'output'/'qa'/name
        if p.exists():z.write(p,'ovia-workflow-editor/output/qa/'+name)
with zipfile.ZipFile(archive) as z:
    if z.testzip():raise ValueError('ZIP integrity failed')
    entries=z.namelist()
    if any('node_modules/' in x or '.env' in x or '/ovia-inspection/' in x for x in entries):raise ValueError('Unwanted package entry')
print(json.dumps({'zip':str(archive),'bytes':archive.stat().st_size,'entries':len(entries),'diagrams':len(checks),'integrity':'passed'}))
