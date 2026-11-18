import sys, json, pickle, numpy as np, geopandas as gpd, pandas as pd
sys.path.insert(0,'.'); sys.path.insert(0,'/home/claude/boundary/pipeline/src')
from homog import apply
from dotcount import detect
import district_tables as DT
W='/home/claude/boundary/pipeline/work'
Hs=pickle.load(open('dotH.pkl','rb'))
U=gpd.read_parquet(f'{W}/units_deck.parquet')
NM={'HT':'Heritage','SC':'Scarborough','BB':'Black Bob','TH':'Tomahawk','WG':'Walnut Grove'}
COLS={'HT':{1:'f1',2:'f2',3:'f3',4:'f4'},'SC':{1:'f1',2:'f2'},'BB':{1:'f1',2:'f2',3:'f3'},'TH':{1:'f1',2:'f2',3:'f3'},'WG':{1:'f1',2:'f2',3:'f4'}}
DOPT={'HT':{1:1,2:2,3:3,4:4},'SC':{1:1,2:2},'BB':{1:1,2:2,3:3},'TH':{1:1,2:2,3:3},'WG':{1:1,2:2,3:4}}
allD=[]; summ=[]
for s,name in NM.items():
    H,m=Hs[s]; px,_=detect(f'dots/{s}1_dots.png')
    ft=apply(H,px)+m
    G=gpd.GeoDataFrame(dict(src=[s]*len(ft)),geometry=gpd.points_from_xy(ft[:,0],ft[:,1]),crs=U.crs)
    j=gpd.sjoin(G,U[U.name==name][['geometry']],predicate='within',how='left')
    j=j[~j.index.duplicated()]
    inz=j.index_right.notna()
    k=DT.K5_2026[name]/inz.sum()
    summ.append((name,len(G),int(inz.sum()),int((~inz).sum()),DT.K5_2026[name],round(k,2)))
    G['unit']=j.index_right; G['w']=np.where(inz,k,0.0); G['name']=name
    allD.append(G)
D=pd.concat(allD); D=gpd.GeoDataFrame(D,geometry='geometry',crs=U.crs)
D.to_parquet('dots_ft.parquet')
print(pd.DataFrame(summ,columns=['school','dots','in zone','outside','district K5','scale']).to_string(index=False))
# per piece
U['dots']=D[D.unit.notna()].groupby('unit').w.sum().reindex(range(len(U))).fillna(0).values
U.to_parquet('U_dots.parquet')
dist={}
for c,rows in DT.PIECES.items():
    for f,t,n in rows: dist[(f,t,c)]=n
rows=[]
for s,name in NM.items():
    for con,col in COLS[s].items():
        g=U[U.name==name].groupby(col)[['dots','s26']].sum()
        for t,r in g.iterrows():
            if r.dots<1 and r.s26<1: continue
            rows.append((f'{s}{con}',t,dist.get((name,t,DOPT[s][con])),round(r.s26),round(r.dots)))
T=pd.DataFrame(rows,columns=['concept','to','district','census model','dot model'])
T['census gap']=T['census model']-T.district; T['dot gap']=T['dot model']-T.district
print(T.to_string(index=False))
t=T.dropna(); print('mean abs gap: census',round(t['census gap'].abs().mean(),1),' dots',round(t['dot gap'].abs().mean(),1))
