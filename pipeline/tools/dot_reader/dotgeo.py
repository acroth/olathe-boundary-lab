import json, numpy as np, sys
from PIL import Image
sys.path.insert(0,'.')
from homog import fit, apply, X
R={'HT':{'Ridgeview&151':(733,578),'MurLen&151':(1100,578),'Ridgeview&159':(733,963),'MurLen&159':(1100,963),'MurLen&143':(1100,192)},
 'SC':{'Ridgeview&151':(430,572),'MurLen&151':(802,572),'BlackBob&151':(1197,572),'Ridgeview&159':(430,970),'MurLen&159':(802,970),'BlackBob&159':(1197,970),'MurLen&143':(802,183),'BlackBob&143':(1197,183)},
 'BB':{'MurLen&143':(380,357),'BlackBob&143':(1015,357),'MurLen&151':(380,990),'BlackBob&151':(1015,990)},
 'TH':{'MurLen&135':(572,465),'BlackBob&135':(1128,465),'MurLen&143':(572,1022),'BlackBob&143':(1128,1022)},
 'WG':{'BlackBob&119':(482,708),'Pflumm&119':(850,708),'Quivira&119':(1213,708),'MurLen&127':(117,1075),'BlackBob&127':(482,1075),'Pflumm&127':(850,1075),'Quivira&127':(1213,1075)}}
def refine(a,pts,r=25):
    out={}
    for k,(x,y) in pts.items():
        c=a[y-r:y+r+1,x-r:x+r+1]; blue=(c[...,2]>110)&(c[...,0]<90)&(c[...,2]-c[...,0]>60)
        col=np.convolve(blue.sum(0),np.ones(3)/3,'same'); row=np.convolve(blue.sum(1),np.ones(3)/3,'same')
        dx=int(np.argmax(col))-r if col.max()>r*0.6 else 0; dy=int(np.argmax(row))-r if row.max()>r*0.6 else 0
        out[k]=(x+dx,y+dy)
    return out
def georef(s):
    a=np.asarray(Image.open(f'dots/{s}1_base.png').convert('RGB')).astype(int)
    pts=refine(a,{k:v for k,v in R[s].items() if k in X})
    ks=list(pts); src=np.array([pts[k] for k in ks],float); dst=np.array([X[k] for k in ks]); m=dst.mean(0)
    H=fit(src,dst-m); res=np.hypot(*(apply(H,src)+m-dst).T)
    print(s, {k:(R[s][k],pts[k],round(r)) for k,r in zip(ks,res)})
    return H,m
if __name__=='__main__':
    import pickle; pickle.dump({s:georef(s) for s in R},open('dotH.pkl','wb'))
