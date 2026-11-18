"""Read the four elementary concepts off the district's deck maps (clean GIS exports, NE + SE frames per concept)."""
import sys, pickle, json, numpy as np, geopandas as gpd, pandas as pd
from PIL import Image
sys.path.insert(0,'.'); sys.path.insert(0,'/home/claude/boundary/pipeline/src')
from geo2 import to_px
from legend import NAMES
from classify import lab, sample_pts
from classify2 import patch
from smooth import smooth
U,near,bld=pickle.load(open('U_near.pkl','rb')); nb=pickle.load(open('nb.pkl','rb')); G=pickle.load(open('G_es.pkl','rb'))
FR=(75,75,2545,2395)   # map frame inside the page image
def inside(p): return FR[0]<p[0]<FR[2] and FR[1]<p[1]<FR[3]
PTS=[np.array([[p.x,p.y] for p in sample_pts(g)]) for g in U.geometry]
MASK=np.array(list(bld.values()))
# candidate schools, from the deck's "Summary of Changes" slides (union over the four concepts)
CAND={'Black Bob':{'Brougham','Briarwood','Green Springs'},'Heritage':{'Madison Place','Brougham','Havencroft','Sunnyside'},
      'Scarborough':{'Sunnyside','Madison Place'},'Tomahawk':{'Briarwood','Havencroft','Indian Creek','Regency Place'},
      'Walnut Grove':{'Heatherstone','Pleasant Ridge','Countryside'},
      'Pleasant Ridge':{'Bentwood'},'Briarwood':{'Regency Place','Green Springs'},'Green Springs':{'Brougham','Briarwood','Regency Place'},
      'Regency Place':{'Bentwood'},'Indian Creek':{'Countryside'},'Brougham':{'Arbor Creek'}}
near=[CAND.get(n,set())|({n} if n in NAMES else set()) for n in U.name]
# Brougham and Regency Place have nearly the same legend colour: where both are possible, keep the one whose building is nearer
_c=U.geometry.centroid
for i in range(len(U)):
    if {'Brougham','Regency Place'}<=near[i]:
        dB=np.hypot(_c.iloc[i].x-bld['Brougham'][0],_c.iloc[i].y-bld['Brougham'][1]); dR=np.hypot(_c.iloc[i].x-bld['Regency Place'][0],_c.iloc[i].y-bld['Regency Place'][1])
        near[i]=near[i]-({'Regency Place'} if dB<dR else {'Brougham'})
PAL={'Arbor Creek':(255,127,126),'Bentwood':(0,133,168),'Briarwood':(255,212,128),'Brougham':(249,254,196),'Countryside':(223,114,255),'Green Springs':(77,230,0),
     'Havencroft':(182,254,251),'Heatherstone':(254,230,182),'Indian Creek':(163,255,116),'Madison Place':(204,204,204),'Pleasant Ridge':(253,217,242),
     'Regency Place':(254,255,179),'Sunnyside':(219,195,255)}   # legend swatches (same on every page)
def patch_mode(a,x,y,r=10):
    x,y=int(round(x)),int(round(y))
    p=a[y-r:y+r+1,x-r:x+r+1].reshape(-1,3); key=(p//16).astype(int); kk,cnt=np.unique(key,axis=0,return_counts=True)
    return p[(key==kk[cnt.argmax()]).all(1)].mean(0)            # the most common colour in the window = the fill
REF=lab(np.array([PAL[n] for n in NAMES],float)); REF[:,0]*=0.5
def votes(a,M,P,mk,allow,r=10,thr=20):
    v=np.zeros(len(NAMES)); n=0
    for x,y in to_px(M,P):
        if not inside((x,y)) or np.hypot(*(mk-(x,y)).T).min()<62: continue
        x,y=int(round(x)),int(round(y)); px=a[y-r:y+r+1,x-r:x+r+1].reshape(-1,3)
        L=lab(px); L[:,0]*=0.5; d=np.linalg.norm(L[:,None,:]-REF[None,:,:],axis=2); d[:,~allow]=1e9
        k=d.argmin(1); ok=d.min(1)<thr; b=np.bincount(k[ok],minlength=len(NAMES)); n+=1
        if b.max()>=0.3*len(px): v[b.argmax()]+=1          # one vote per sample point, only if a fill colour covers 30% of its window (lines and labels don't)
    return v,n
for c in [1,2,3,4]:
    maps={t:(np.asarray(Image.open(G[(c,t)][0]).convert('RGB')).astype(float),G[(c,t)][1]) for t in ('NE','SE')}
    mks={t:to_px(maps[t][1],MASK) for t in maps}
    raw=[]; q=[]
    for i in range(len(U)):
        allow=np.array([k in near[i] for k in NAMES]); v=np.zeros(len(NAMES)); n=0
        for t,(a,M) in maps.items():
            vv,nn=votes(a,M,PTS[i],mks[t],allow); v+=vv; n+=nn
        if n==0 or v.sum()<0.25*n: raw.append(None); q.append(0); continue
        k=v.argmax(); raw.append(NAMES[k]); q.append(v[k]/v.sum())
    U[f'r{c}']=raw; U[f'q{c}']=q
    cls=smooth(U,f'r{c}',f'q{c}',nb)
    cls=[x if isinstance(x,str) else None for x in cls]
    for _ in range(30):   # anything still unread takes the reading of neighbouring blocks from the same current school
        ch=False
        for i in range(len(U)):
            if cls[i] is not None: continue
            w={}
            for j,Lg in nb[i].items():
                if cls[j] is not None and U.name[j]==U.name[i]: w[cls[j]]=w.get(cls[j],0)+Lg
            if w: cls[i]=max(w,key=w.get); ch=True
        if not ch: break
    for i in range(len(U)):   # still nothing: open school keeps its own; closing school takes any neighbour's
        if cls[i] is None and U.name[i] in NAMES: cls[i]=U.name[i]
    for _ in range(20):
        ch=False
        for i in range(len(U)):
            if cls[i] is not None: continue
            w={}
            for j,Lg in nb[i].items():
                if cls[j] is not None and cls[j] in near[i]: w[cls[j]]=w.get(cls[j],0)+Lg
            if w: cls[i]=max(w,key=w.get); ch=True
        if not ch: break
    cls=[x if x is not None else sorted(near[i])[0] for i,x in enumerate(cls)]
    U[f'c{c}']=cls
    print(c,'unread',sum(r is None for r in raw))
old=gpd.read_parquet('U_class.parquet'); U['stu']=old.stu.values
for c in [1,2,3,4]: U[f'photo{c}']=old[f'f{c}'].values
U.to_parquet('U_deck.parquet')
