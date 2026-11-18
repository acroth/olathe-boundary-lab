import sys, json, numpy as np, geopandas as gpd, pandas as pd
sys.path.insert(0,'/home/claude/boundary/pipeline/src')
import district_tables as DT
W='/home/claude/boundary/pipeline/work'; O='/home/claude/boundary/app/public/data'
SCH={s['name']:s for s in json.load(open(f'{O}/schools.json'))['schools'] if s['level']=='es'}
idn={s['id']:n for n,s in SCH.items()}
F=json.load(open(f'{W}/school_factors.json')); H=gpd.read_parquet(f'{W}/homes_assigned.parquet')
U=gpd.read_parquet('U_dots.parquet')
j=gpd.sjoin(H[['geometry']],U[['geometry']],predicate='within'); j=j[~j.index.duplicated()]
ui=j.index_right.reindex(H.index).values; orig=H.orig_es.map(idn).values
fac=np.array([F[o]['factor'] for o in H.orig_es]); W1=H.w_es.values[:,None]*fac          # homes x years, calibrated census model
CL=['Black Bob','Heritage','Scarborough','Tomahawk','Walnut Grove']
ok=~np.isnan(ui); uix=np.nan_to_num(ui).astype(int)
# census per unit per year
cen=np.zeros((len(U),10)); np.add.at(cen,uix[ok],W1[ok])
U['cen26']=cen[:,1]
# dot model per unit per year: each closing school's census total for that year, spread by dot share
dots=np.zeros((len(U),10))
for n in CL:
    m=(U.name==n).values; tot=cen[m].sum(0); sh=U.dots.values[m]/U.dots.values[m].sum(); dots[m]=sh[:,None]*tot[None,:]
U['dot26']=dots[:,1]
NM={'HT':'Heritage','SC':'Scarborough','BB':'Black Bob','TH':'Tomahawk','WG':'Walnut Grove'}
COLS={'HT':{1:'f1',2:'f2',3:'f3',4:'f4'},'SC':{1:'f1',2:'f2'},'BB':{1:'f1',2:'f2',3:'f3'},'TH':{1:'f1',2:'f2',3:'f3'},'WG':{1:'f1',2:'f2',3:'f4'}}
DOPT={'HT':{1:1,2:2,3:3,4:4},'SC':{1:1,2:2},'BB':{1:1,2:2,3:3},'TH':{1:1,2:2,3:3},'WG':{1:1,2:2,3:4}}
dist={(f,t,c):n for c,rows in DT.PIECES.items() for f,t,n in rows}
rows=[]
for s,n in NM.items():
    for con,col in COLS[s].items():
        g=U[U.name==n].groupby(col)[['cen26','dot26']].sum()
        dtot=sum(v for (f,t,c),v in dist.items() if f==n and c==DOPT[s][con])
        for t,r in g.iterrows():
            if max(r.cen26,r.dot26)<1: continue
            d=dist.get((n,t,DOPT[s][con])); share=r.dot26/g.dot26.sum()
            rows.append((f'{s}{con}',t,d,round(r.cen26),round(r.dot26),round(share*dtot) if dtot else None))
T=pd.DataFrame(rows,columns=['concept','to','district','census','dots','dots@district total'])
pd.set_option('display.width',200); print(T.to_string(index=False))
t=T.dropna(subset=['district'])
for c in ['census','dots','dots@district total']: print(c,'mean abs gap',round((t[c]-t.district).abs().mean(),1))
# receiver impact, options 1-4, peak 2027-28..2034-35
res=[]
for c in [1,2,3,4]:
    to=np.where(ok, U[f'f{c}'].values[uix], orig)
    for model,pu in [('census',cen),('dots',dots)]:
        L={}
        # open-school homes (incl. open->open moves) at census
        for n in SCH:
            if n in CL: continue
            m=(to==n)&~np.isin(orig,CL); tot=W1[m].sum(0)
            mu=[k for k in range(len(U)) if U.name.iloc[k] in CL and U[f'f{c}'].iloc[k]==n]
            tot=tot+pu[mu].sum(0)
            if tot[1]==0: continue
            s=SCH[n]; tot=tot+s['prek']+(s['immersion'] if n=='Arbor Creek' else 0)
            L[n]=tot[2:10].max()/s['capacity']
        res.append((c,model,L))
recv=sorted({n for _,_,L in res for n in L if any(L2.get(n,0)!=0 for _,_,L2 in res)})
tab=pd.DataFrame({f'{c}-{m}':{n:round(L.get(n,np.nan)*100,1) for n in recv} for c,m,L in res})
keep=tab.index[(tab.filter(like='census')-tab.filter(like='dots').values).abs().max(1)>=0.5]
print(tab.loc[keep].to_string())
