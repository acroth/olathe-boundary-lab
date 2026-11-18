import sys, json, pickle, numpy as np, geopandas as gpd
from PIL import Image
from shapely.geometry import Point
sys.path.insert(0,'/home/claude/boundary/pipeline/src'); sys.path.insert(0,'.')
from common import WORK, OUT
from homog import ft_to_px
from legend import swatches, NAMES
SCH=[s for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level']=='es']
idn={s['id']:s['name'] for s in SCH}
CLOSED=['Black Bob','Heritage','Scarborough','Tomahawk','Walnut Grove']
ALL=NAMES+CLOSED
def lab(rgb):
    rgb=np.asarray(rgb,float)/255; rgb=np.where(rgb>0.04045,((rgb+0.055)/1.055)**2.4,rgb/12.92)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]]); xyz=rgb@M.T/np.array([0.9505,1,1.089])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
def units():
    Z=gpd.read_file(f"{WORK}/zones_es.gpkg"); Z['name']=Z.school.map(idn); Z=Z[Z.name.isin(ALL)]
    F=gpd.read_parquet(f"{WORK}/faces.parquet")[['geometry']]
    U=gpd.overlay(F,Z[['name','geometry']],keep_geom_type=True).explode(index_parts=False).reset_index(drop=True)
    return U[U.area>400].reset_index(drop=True)
def sample_pts(g, step=90, cap=40):
    for b in (-70,-35,-10):
        h=g.buffer(b)
        if not h.is_empty and h.area>500: break
    else: return [g.representative_point()]
    x0,y0,x1,y1=h.bounds; xs=np.arange(x0+step/2,x1,step); ys=np.arange(y0+step/2,y1,step)
    P=[Point(x,y) for x in xs for y in ys]; P=[p for p in P if h.contains(p)]
    if not P: P=[h.representative_point()]
    if len(P)>cap: P=[P[i] for i in np.random.default_rng(0).choice(len(P),cap,replace=False)]
    return P
def classify(c, U, Hm, wL=0.4):
    H,m,_=Hm; a=np.asarray(Image.open(f'full/c{c}.png').convert('RGB')).astype(float)
    sw=swatches(c); ref=lab(np.array([sw[n] for n in NAMES])); ref[:,0]*=wL
    res=[]
    for g in U.geometry:
        P=sample_pts(g); px=ft_to_px(H,m,np.array([[p.x,p.y] for p in P]))
        cols=[]
        for x,y in px:
            x,y=int(round(x)),int(round(y))
            if 3<=x<a.shape[1]-3 and 3<=y<a.shape[0]-3: cols.append(np.median(a[y-2:y+3,x-2:x+3].reshape(-1,3),axis=0))
        if not cols: res.append((None,0,0)); continue
        L=lab(np.array(cols)); L[:,0]*=wL
        d=np.linalg.norm(L[:,None,:]-ref[None,:,:],axis=2); best=d.argmin(1); bd=d.min(1)
        ok=bd<25
        if ok.sum()==0: res.append((None,0,len(cols))); continue
        votes=np.bincount(best[ok],minlength=len(NAMES)); k=votes.argmax()
        res.append((NAMES[k], votes[k]/ok.sum(), len(cols)))
    return res
