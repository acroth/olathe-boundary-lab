import json, numpy as np
from PIL import Image
X=json.load(open('/tmp/claude-0/-home-claude/7cfcc73c-d82a-5783-9f98-8f5dacf4d733/scratchpad/xings.json'))
X={k:v for k,v in X.items() if k!='Pflumm&135'}
def refine(a, pts, r=34):
    out={}
    for k,(x,y) in pts.items():
        x,y=int(round(x)),int(round(y))
        if not (r<x<a.shape[1]-r and r<y<a.shape[0]-r): continue
        c=a[y-r:y+r+1,x-r:x+r+1]; R,G,B=c[...,0],c[...,1],c[...,2]
        m=((R<100)&(B>100)&(G<130)) | ((R>170)&(G<70)&(B<70))      # navy arterial, or red boundary drawn over it
        col=np.convolve(m.sum(0).astype(float),np.ones(3)/3,'same'); row=np.convolve(m.sum(1).astype(float),np.ones(3)/3,'same')
        if col.max()<r*0.8 or row.max()<r*0.8: continue
        out[k]=(x+int(np.argmax(col))-r, y+int(np.argmax(row))-r)
    return out
def fit_affine(src,dst):
    A=np.c_[src,np.ones(len(src))]; M,_,_,_=np.linalg.lstsq(A,dst,rcond=None); return M   # 3x2
def georef(path, rough, tol=40, verbose=True):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int)
    use={k:v for k,v in refine(a,{k:v for k,v in rough.items() if k in X}).items()}
    for _ in range(3):   # predict the rest from the current fit, refine, refit, drop outliers
        ks=list(use); s=np.array([use[k] for k in ks],float); d=np.array([X[k] for k in ks])
        Minv=fit_affine(d,s)
        pred={k:tuple(np.r_[X[k],1]@Minv) for k in X}
        use=refine(a,pred)
        while True:
            ks=list(use); s=np.array([use[k] for k in ks],float); d=np.array([X[k] for k in ks])
            M=fit_affine(s,d); res=np.hypot(*(np.c_[s,np.ones(len(s))]@M-d).T)
            if res.max()<tol or len(ks)<=4: break
            del use[ks[int(np.argmax(res))]]
    if verbose: print(f'{path.split("/")[-1]}: {len(use)} points, resid median {np.median(res):.0f} max {res.max():.0f} ft, ft/px {np.hypot(M[0,0],M[0,1]):.2f}')
    return M, use
def to_px(M,pts):
    A=np.r_[M[:2].T.ravel()].reshape(2,2); # dst = src@M[:2] + M[2]
    return (np.asarray(pts,float)-M[2])@np.linalg.inv(M[:2])
def to_ft(M,px): return np.c_[np.asarray(px,float),np.ones(len(px))]@M
