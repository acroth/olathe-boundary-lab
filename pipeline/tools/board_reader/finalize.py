import geopandas as gpd, pickle, sys, json, numpy as np
from shapely.geometry import Point
sys.path.insert(0,'.')
from legend import NAMES
W='/home/claude/boundary/pipeline/work'
U=gpd.read_parquet('U_class.parquet'); nb=pickle.load(open('nb.pkl','rb'))
U2,near,bld=pickle.load(open('U_near.pkl','rb'))
def components(idx):
    idx=set(idx); seen=set(); comps=[]
    for i in idx:
        if i in seen: continue
        st=[i]; comp=[]; seen.add(i)
        while st:
            k=st.pop(); comp.append(k)
            for j in nb[k]:
                if j in idx and j not in seen: seen.add(j); st.append(j)
        comps.append(comp)
    return comps
for c in [1,2,3,4]:
    to=list(U[f'c{c}'])
    # 1) open->open pairs under 10 students: revert
    pairs={}
    for i,(o,t) in enumerate(zip(U.name,to)):
        if o in NAMES and t!=o: pairs.setdefault((o,t),[]).append(i)
    for (o,t),ii in pairs.items():
        if U.stu.values[ii].sum()<10:
            for i in ii: to[i]=o
    # 2) islands: pieces of a school's new area that don't hold its building and are under 40 acres -> neighbours' school
    for _ in range(3):
        for n in NAMES:
            ii=[i for i,t in enumerate(to) if t==n]
            comps=components(ii)
            if len(comps)<2: continue
            b=Point(*bld[n])
            for comp in comps:
                ar=U.geometry.values[comp].area.sum()/43560 if False else sum(U.geometry.iloc[k].area for k in comp)/43560
                if any(U.geometry.iloc[k].distance(b)<300 for k in comp) or ar>=40: continue
                w={}
                for k in comp:
                    for j,L in nb[k].items():
                        if j not in comp: w[to[j]]=w.get(to[j],0)+L
                if w:
                    new=max(w,key=w.get)
                    for k in comp: to[k]=new
    U[f'f{c}']=to
    T=U.assign(to=to)
    cl=T[~T.name.isin(NAMES)]; gpd.GeoDataFrame(cl[['name','to','stu']].rename(columns={'name':'closing'}),geometry=cl.geometry,crs=U.crs).to_file(f'{W}/opt_dc{c}.gpkg')
    sw=T[T.name.isin(NAMES)&(T.to!=T.name)].dissolve(['name','to'],aggfunc={'stu':'sum'}).reset_index().rename(columns={'name':'frm'})
    sw[['frm','to','stu','geometry']].to_file(f'{W}/swaps_dc{c}.gpkg')
    print(c, sw[['frm','to','stu']].round(0).values.tolist())
U.to_parquet('U_class.parquet')
