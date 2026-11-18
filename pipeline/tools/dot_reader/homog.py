import json, numpy as np
X=json.load(open('/tmp/claude-0/-home-claude/7cfcc73c-d82a-5783-9f98-8f5dacf4d733/scratchpad/xings.json'))
def fit(src,dst):   # src pixel -> dst ft, DLT least squares
    A=[]
    for (x,y),(u,v) in zip(src,dst):
        A.append([x,y,1,0,0,0,-u*x,-u*y,-u]); A.append([0,0,0,x,y,1,-v*x,-v*y,-v])
    _,_,Vt=np.linalg.svd(np.array(A,float)); return Vt[-1].reshape(3,3)
def apply(H,p):
    p=np.c_[np.asarray(p,float),np.ones(len(p))]@H.T; return p[:,:2]/p[:,2:]
def run(pts, drop=()):
    keys=[k for k in pts if k in X and k not in drop]
    src=np.array([pts[k] for k in keys]); dst=np.array([X[k] for k in keys])
    m=dst.mean(0); H=fit(src,dst-m)
    res=apply(H,src)+m-dst
    for k,r in zip(keys,res): print(f"  {k:14} resid {np.hypot(*r):6.0f} ft")
    return H,m
from PIL import Image
def refine(path, pts, r=28):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int); out={}
    for k,(x,y) in pts.items():
        x,y=int(x),int(y); c=a[y-r:y+r+1, x-r:x+r+1]
        dark=(c.sum(axis=2)<230)&(c[...,0]<110)       # navy/black road lines, not red
        col=dark.sum(0).astype(float); row=dark.sum(1).astype(float)
        # smooth & pick strongest
        k3=np.ones(3)/3; col=np.convolve(col,k3,'same'); row=np.convolve(row,k3,'same')
        dx=int(np.argmax(col))-r if col.max()>r*0.5 else 0; dy=int(np.argmax(row))-r if row.max()>r*0.5 else 0
        out[k]=(x+dx,y+dy)
    return out
def georef(path, rough, r=30, tol=110, verbose=True):
    keys=[k for k in rough if k in X]
    src=np.array([rough[k] for k in keys]); dst=np.array([X[k] for k in keys]); m=dst.mean(0)
    Hinv=fit(dst-m, src)                       # ft -> px
    allk=[k for k in X if not k.startswith('Pflumm&135')]
    pred={k: tuple(apply(Hinv,[np.array(X[k])-m])[0]) for k in allk}
    pred={k:v for k,v in pred.items() if 40<v[0]<2500 and 40<v[1]<1890}
    ref=refine(path, pred, r)
    use=dict(ref)
    for it in range(12):
        ks=list(use); s=np.array([use[k] for k in ks]); d=np.array([X[k] for k in ks])
        H=fit(s,d-m); res=np.hypot(*(apply(H,s)+m-d).T)
        worst=np.argmax(res)
        if res[worst]<tol: break
        del use[ks[worst]]
    if verbose: print(f'{path}: {len(use)}/{len(pred)} points, resid median {np.median(res):.0f} max {res.max():.0f} ft; dropped', sorted(set(pred)-set(use)))
    return H,m,use
def px_to_ft(H,m,p): return apply(H,p)+m
def ft_to_px(H,m,p):
    return apply(np.linalg.inv(H),np.asarray(p)-m)
