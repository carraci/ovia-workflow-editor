import json, os, math, re
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from textwrap import wrap

OUT='public/exports'
DATA=json.load(open('output/export-layouts.json',encoding='utf-8'))
W,H=landscape(A4)
COLORS={'Frontend':'#3979de','Backend':'#8855c6','API':'#db8a2d','Database':'#369969','External':'#219a97','Errors':'#d65c65','Admin':'#687381'}
def clean(s): return str(s).replace('\u2014',' - ').replace('\u2013',' - ').replace('\u2192',' -> ').replace('\u2026','...').replace('\u00b7',' / ')
def lines(c,text,width,font='Helvetica',size=8):
    words=clean(text).split(); result=[]; current=''
    for word in words:
        # Split code tokens that would otherwise overflow.
        while c.stringWidth(word,font,size)>width:
            n=len(word)-1
            while n>1 and c.stringWidth(word[:n]+'-',font,size)>width:n-=1
            if current:result.append(current);current=''
            result.append(word[:n]+'-');word=word[n:]
        candidate=(current+' '+word).strip()
        if current and c.stringWidth(candidate,font,size)>width:result.append(current);current=word
        else:current=candidate
    if current:result.append(current)
    return result
def text_lines(c,text,x,y,width,size=8,leading=11,font='Helvetica',limit=None,color='#78889d'):
    content=lines(c,text,width,font,size)
    if limit and len(content)>limit:content=content[:limit];content[-1]=content[-1].rstrip('.')+'...'
    c.setFillColor(HexColor(color));c.setFont(font,size)
    for i,line in enumerate(content):c.drawString(x,y-i*leading,line)
    return y-len(content)*leading
def header(c,title,sub,page):
    c.setFillColor(HexColor('#8493a7'));c.setFont('Helvetica',8);c.drawString(30,H-26,'OVIA / WORKFLOW ATLAS / SOURCE SNAPSHOT '+DATA['meta']['commit'][:7])
    text_lines(c,title,30,H-49,W-60,17,20,'Helvetica-Bold',2,'#243a54')
    c.setFont('Helvetica',8);c.setFillColor(HexColor('#8493a7'));c.drawString(30,H-74,clean(sub))
    c.setStrokeColor(HexColor('#e4eaf1'));c.line(30,31,W-30,31)
    c.setFont('Helvetica',7);c.drawString(30,19,'Source-based documentation / runtime connectivity Unverified / not executable n8n format')
    c.drawRightString(W-30,19,str(page))
def arrow(c,x1,y1,x2,y2,color='#abb7c5',dashed=False):
    c.setStrokeColor(HexColor(color));c.setFillColor(HexColor(color));c.setLineWidth(.7)
    if dashed:c.setDash(3,2)
    c.line(x1,y1,x2,y2);c.setDash()
    angle=math.atan2(y2-y1,x2-x1);length=4
    p=c.beginPath();p.moveTo(x2,y2);p.lineTo(x2-length*math.cos(angle-.45),y2-length*math.sin(angle-.45));p.lineTo(x2-length*math.cos(angle+.45),y2-length*math.sin(angle+.45));p.close();c.drawPath(p,fill=1,stroke=0)
def graph_page(c,w,page):
    header(c,w['title'],'Architecture overview. Readable node and connection sheets follow.',page)
    image=ImageReader(os.path.join(OUT,w['id']+'.png'));iw,ih=image.getSize();available_w=W-64;available_h=H-135;scale=min(available_w/iw,available_h/ih)
    c.drawImage(image,32+(available_w-iw*scale)/2,49+(available_h-ih*scale)/2,width=iw*scale,height=ih*scale,mask='auto')
    c.showPage()
def detail_page(c,w,chunk,index,total,page):
    header(c,w['title'],f'Readable detail sheet {index+1}/{total}. Node numbers and page references preserve every directed connection.',page)
    cw=(W-80)/2;ch=205;positions={}
    for j,n in enumerate(chunk):
        x=30+(j%2)*(cw+20);y=H-100-(j//2)*(ch+16)-ch;positions[n['id']]=(x,y)
        color=HexColor(COLORS.get(n['category'],'#687381'));c.setFillColor(HexColor('#ffffff'));c.setStrokeColor(Color(color.red,color.green,color.blue,alpha=.42));c.setLineWidth(.8)
        if n['status']=='Planned':c.setDash(4,3)
        c.roundRect(x,y,cw,ch,8,fill=1,stroke=1);c.setDash()
        number=w['nodes'].index(n)+1;c.setFillColor(color);c.setFont('Helvetica',8);c.drawString(x+12,y+ch-17,f"#{number:02d} / {n['kind']} / {n['status']}")
        yy=text_lines(c,n['label'],x+12,y+ch-37,cw-24,12,16,'Helvetica-Bold',2,'#243a54')
        yy=text_lines(c,n['description'],x+12,yy-7,cw-24,8.5,12,limit=6,color='#70839b')
        c.setStrokeColor(HexColor('#edf0f5'));c.line(x+12,y+64,x+cw-12,y+64)
        ev=n.get('evidence',[]);source=f"{ev[0]['file']}:{ev[0]['line']}" if ev else 'Planned design; no source implementation claimed.'
        text_lines(c,source,x+12,y+53,cw-24,6.7,9,limit=2,color='#8a9aad')
        outgoing=[e for e in w['edges'] if e['source']==n['id']]
        labels=[]
        for e in outgoing:
            target_index=next(i for i,t in enumerate(w['nodes']) if t['id']==e['target']);labels.append(f"{e.get('label') or 'Next'} -> #{target_index+1} (p{2+target_index//4})"+(' [proposed]' if e.get('proposed') else ''))
        # Short label summary; full connection register on later pages is never clipped.
        text_lines(c,'; '.join(labels) if labels else 'END: no outgoing connection',x+12,y+26,cw-24,6.5,8,limit=2,color='#657c97')
    # Arrows between adjacent cards are drawn in gutters; cross-page links use numbered references.
    for e in w['edges']:
        if e['source'] not in positions or e['target'] not in positions:continue
        x1,y1=positions[e['source']];x2,y2=positions[e['target']]
        color=COLORS['Errors'] if e.get('failure') else '#abb7c5'
        if abs(y1-y2)<1:
            arrow(c,x1+cw,y1+ch/2,x2,y2+ch/2,color,e.get('proposed',False))
        elif abs(x1-x2)<1:
            arrow(c,x1+cw/2,y1,x2+cw/2,y2+ch,color,e.get('proposed',False))
    c.showPage()
def registers(c,w,page):
    # Full unabridged edge list; every edge remains available for academic inspection.
    header(c,w['title'],'Complete directed connection register / no omitted success, failure or proposed edges',page)
    y=H-103
    for e in w['edges']:
        si=next(i for i,n in enumerate(w['nodes']) if n['id']==e['source']);ti=next(i for i,n in enumerate(w['nodes']) if n['id']==e['target'])
        label=f"#{si+1:02d} {w['nodes'][si]['label']} -> #{ti+1:02d} {w['nodes'][ti]['label']} | {e.get('label') or 'Next'}"+(' | FAILURE' if e.get('failure') else '')+(' | PLANNED' if e.get('proposed') else '')
        needed=len(lines(c,label,W-65,'Helvetica',8))*12+8
        if y-needed<50:c.showPage();page+=1;header(c,w['title'],'Directed connection register continued',page);y=H-103
        y=text_lines(c,label,32,y,W-65,8,12,color='#bb6772' if e.get('failure') else '#647b96')-8
    for note in w.get('notes',[]):
        needed=len(lines(c,note,W-65,'Helvetica',8))*12+10
        if y-needed<50:c.showPage();page+=1;header(c,w['title'],'Architecture notes continued',page);y=H-103
        y=text_lines(c,'Note: '+note,32,y,W-65,8,12,color='#8494a9')-10
    c.showPage();return page
def export(w):
    p=os.path.join(OUT,w['id']+'.pdf');c=canvas.Canvas(p,pagesize=(W,H));c.setTitle('OVIA - '+w['title']);c.setAuthor('OVIA Workflow Atlas')
    graph_page(c,w,1);chunks=[w['nodes'][i:i+4] for i in range(0,len(w['nodes']),4)]
    for i,ch in enumerate(chunks):detail_page(c,w,ch,i,len(chunks),i+2)
    registers(c,w,len(chunks)+2);c.save();return p
files=[export(w) for w in DATA['workflows']]
def combine(target,paths):
    writer=PdfWriter()
    for p in paths:
        reader=PdfReader(p);writer.append(reader,outline_item=reader.metadata.title or os.path.basename(p))
    with open(os.path.join(OUT,target),'wb') as f:writer.write(f)
combine('ovia-complete-workflow-atlas.pdf',files)
master=[p for p,w in zip(files,DATA['workflows']) if w['id'].startswith('architecture-') or w['id'] in ['20-master-commerce','database-atlas-boundary','database-entities']]
combine('ovia-master-architecture.pdf',master)
checks=[]
for p in files+[os.path.join(OUT,'ovia-complete-workflow-atlas.pdf'),os.path.join(OUT,'ovia-master-architecture.pdf')]:
    reader=PdfReader(p)
    if any(abs(float(pg.mediabox.width)-W)>1 or abs(float(pg.mediabox.height)-H)>1 for pg in reader.pages):raise ValueError('Non-A4 landscape page '+p)
    if any(len((pg.extract_text() or '').strip())<50 for pg in reader.pages):raise ValueError('Empty PDF page '+p)
    checks.append({'file':os.path.basename(p),'pages':len(reader.pages),'a4Landscape':True,'textPresent':True})
json.dump(checks,open(os.path.join(OUT,'pdf-verification.json'),'w'),indent=2)
print(f'Generated {len(checks)} PDFs; complete atlas {checks[-2]["pages"]} A4 landscape pages.')
