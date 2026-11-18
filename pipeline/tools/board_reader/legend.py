import numpy as np
from PIL import Image
NAMES=['Arbor Creek','Bentwood','Briarwood','Brougham','Countryside','Green Springs','Havencroft','Heatherstone','Indian Creek','Madison Place','Pleasant Ridge','Regency Place','Sunnyside']
LEG={4:((1300,1322),[576,612,650,686,722,758,795,830,866,902,937,972,1008]),
     3:((1290,1308),[643,673,702,731,760,788,817,846,874,903,931,959,987]),
     2:((1203,1222),[646,676,704,732,760,788,816,843,870,897,924,951,978]),
     1:((1370,1390),[651,681,712,742,772,802,832,861,890,919,948,977,1007])}
def swatches(c):
    a=np.asarray(Image.open(f'full/c{c}.png').convert('RGB')).astype(float); s=2576/1999
    (x0,x1),ys=LEG[c]; out={}
    for n,y in zip(NAMES,ys):
        X0,X1=int(x0*s),int(x1*s); Y=int(y*s)
        out[n]=np.median(a[Y-3:Y+4,X0+3:X1-3].reshape(-1,3),axis=0)
    return out
if __name__=='__main__':
    for c in [1,2,3,4]:
        sw=swatches(c); print(c, {k:tuple(int(x) for x in v) for k,v in sw.items()})
