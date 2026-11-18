import sys, json, pickle, numpy as np, geopandas as gpd
from PIL import Image
sys.path.insert(0,'/home/claude/boundary/pipeline/src'); sys.path.insert(0,'.')
from common import WORK, OUT
from homog import ft_to_px
from legend import NAMES
from classify import lab, units, sample_pts, SCH, CLOSED
def patch(a,x,y,r=6):
    x,y=int(round(x)),int(round(y))
    if not (r<=x<a.shape[1]-r and r<=y<a.shape[0]-r): return None
    p=a[y-r:y+r+1,x-r:x+r+1].reshape(-1,3); L=p.sum(1)
    keep=p[L>=np.percentile(L,55)]                        # fill shows between lines/text: take the lighter pixels
    return np.median(keep,axis=0)
def refs(c,U,Hm,bld):
    H,m,_=Hm; a=np.asarray(Image.open(f'full/c{c}.png').convert('RGB')).astype(float); R={}
    for n in NAMES:
        x,y=bld[n]; sel=U[(U.name==n)&(U.geometry.centroid.distance(gpd.points_from_xy([x],[y])[0])<0.3*5280)]
        cols=[]
        for g in sel.geometry:
            for p in sample_pts(g):
                q=patch(a,*ft_to_px(H,m,[[p.x,p.y]])[0])
                if q is not None: cols.append(q)
        R[n]=np.median(np.array(cols),axis=0) if cols else None
    pass
    return R
def classify(c,U,Hm,bld,near,wL=0.5,mask=()):
    H,m,_=Hm; MK=np.array([ft_to_px(H,m,[p])[0] for p in mask]) if len(mask) else np.zeros((0,2)); a=np.asarray(Image.open(f'full/c{c}.png').convert('RGB')).astype(float)
    R=refs(c,U,Hm,bld); keys=[k for k in R if R[k] is not None]
    ref=lab(np.array([R[k] for k in keys])); ref[:,0]*=wL
    out=[]
    for i,g in enumerate(U.geometry):
        pp=[ft_to_px(H,m,[[p.x,p.y]])[0] for p in sample_pts(g)]
        pp=[v for v in pp if not len(MK) or np.hypot(*(MK-v).T).min()>44]     # skip school icons
        cols=[q for v in pp for q in [patch(a,*v)] if q is not None]
        if not cols: out.append((None,0)); continue
        L=lab(np.array(cols)); L[:,0]*=wL
        allow=np.array([k in near[i] for k in keys])
        d=np.linalg.norm(L[:,None,:]-ref[None,:,:],axis=2); d[:,~allow]=1e9
        best=d.argmin(1); v=np.bincount(best,minlength=len(keys)); k=v.argmax()
        if np.median(d.min(1))>35: out.append((None,0)); continue      # no fill colour that matches: off the board or unreadable
        out.append((keys[k], v[k]/len(cols)))
    return out, R
