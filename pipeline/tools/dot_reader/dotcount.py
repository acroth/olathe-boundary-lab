import numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage
def detect(path, out=None):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]
    m=(r>90)&(r<170)&(g>40)&(g<110)&(b>110)&(b<190)&(b-g>45)&(r-g>25)   # purple fill
    lab,n=ndimage.label(m); sizes=ndimage.sum(m,lab,range(1,n+1)); com=ndimage.center_of_mass(m,lab,range(1,n+1))
    sizes=np.array(sizes); keep=sizes>=12
    single=np.median(sizes[keep&(sizes<80)])
    pts=[];
    for s,c in zip(sizes,com):
        if s<12: continue
        k=max(1,int(round(s/single)))
        pts += [(c[1],c[0])]*k
    if out:
        im=Image.open(path).convert('RGB'); d=ImageDraw.Draw(im)
        for x,y in pts: d.ellipse((x-6,y-6,x+6,y+6),outline=(0,255,0),width=2)
        im.save(out)
    return np.array(pts), single
if __name__=='__main__':
    for f in sys.argv[1:]:
        p,s=detect(f'dots/{f}_dots.png', f'dots/{f}_det.png'); print(f, len(p), 'single px', s)
