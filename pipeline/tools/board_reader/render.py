import sys,pickle,numpy as np, geopandas as gpd
from PIL import Image, ImageDraw
sys.path.insert(0,'.')
from homog import ft_to_px
COL={'Arbor Creek':(214,90,70),'Bentwood':(30,60,110),'Briarwood':(240,170,70),'Brougham':(225,225,160),'Countryside':(140,80,160),'Green Springs':(40,120,40),'Havencroft':(160,205,210),'Heatherstone':(225,200,150),'Indian Creek':(110,170,80),'Madison Place':(160,160,160),'Pleasant Ridge':(235,190,215),'Regency Place':(240,235,120),'Sunnyside':(170,160,215),'none':(255,255,255),None:(255,0,255)}
def render(c,U,col,box=(500,500,1700,1900),scale=0.6,out=None):
    H,m,_=pickle.load(open('H.pkl','rb'))[c]
    photo=Image.open(f'full/c{c}.png').convert('RGB')
    syn=Image.new('RGB',photo.size,(255,255,255)); d=ImageDraw.Draw(syn)
    for g,n,o in zip(U.geometry,U[col],U.name):
        for p in getattr(g,'geoms',[g]):
            xy=ft_to_px(H,m,np.array(p.exterior.coords)); d.polygon([tuple(v) for v in xy],fill=COL.get(n,(255,0,255)),outline=(120,120,120))
    a=photo.crop(box); b=syn.crop(box); w,h=a.size
    im=Image.new('RGB',(w*2+10,h),(0,0,0)); im.paste(a,(0,0)); im.paste(b,(w+10,0))
    im=im.resize((int(im.width*scale),int(im.height*scale))); im.save(out)
