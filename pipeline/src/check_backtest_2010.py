import geopandas as gpd, pandas as pd, numpy as np, json
from shapely.geometry import box
U='/mnt/user-data/uploads/Downloads/olathe-boundary-data'; W='/home/claude/boundary/pipeline/work'
D=gpd.read_file(f'{W}/district.gpkg').geometry.union_all()
# 2010
r=json.load(open(f'{U}/jocok_2010_p12_blocks.json')); P=pd.DataFrame(r[1:],columns=r[0])
P['GEOID10']=P.state+P.county+P.tract+P.block
n=lambda c: pd.to_numeric(P[c])
P['u5']=n('P012003')+n('P012027'); P['a5_9']=n('P012004')+n('P012028'); P['a10_14']=n('P012005')+n('P012029')
B10=gpd.read_file(f'zip://{U}/tl_2010_20091_tabblock10.zip').to_crs(3419).merge(P[['GEOID10','u5','a5_9','a10_14']],on='GEOID10')
# 2020
B20=gpd.read_parquet(f'{W}/blocks.parquet')
def pts(B): return gpd.GeoDataFrame(B.drop(columns='geometry'),geometry=B.geometry.representative_point(),crs=3419)
p10=pts(B10); p20=pts(B20)
p10=p10[p10.within(D)]; p20=p20[p20.within(D)]
print('2010 district kids u5/5-9/10-14', int(p10.u5.sum()), int(p10.a5_9.sum()), int(p10.a10_14.sum()))
print('2020 district kids u5/5-9/10-14', int(p20.u5.sum()), int(p20.a5_9.sum()), int(p20.a10_14.sum()))
def run(cell_ft, zones_lv, target, preds):
    x0,y0,x1,y1=D.bounds
    def cell(g): return (np.floor((g.x-x0)/cell_ft)).astype(int).astype(str)+'_'+(np.floor((g.y-y0)/cell_ft)).astype(int).astype(str)
    Z=gpd.read_file(f'{W}/zones_{zones_lv}.gpkg')[['school','geometry']]
    out={}
    def agg(p, cols):
        j=gpd.sjoin(p,Z,predicate='within'); j['cell']=cell(j.geometry); return j.groupby(['school','cell'])[cols].sum()
    a10=agg(p10,['u5','a5_9','a10_14']); a20=agg(p20,['u5','a5_9','a10_14'])
    T=pd.concat([a10.add_suffix('_10'),a20.add_suffix('_20')],axis=1).fillna(0)
    T['y']=target(T)
    for k,f in preds.items(): T[k]=f(T)
    sh=lambda c: T[c]/T.groupby(level=0)[c].transform('sum').replace(0,np.nan)
    ys=sh('y'); zw=T.groupby(level=0)['y'].sum()
    res={}
    for k in preds:
        e=(sh(k)-ys).abs().groupby(level=0).sum()/2   # share of each zone's kids put in the wrong cells
        res[k]=float((e*zw).sum()/zw.sum())
    # best blend of the first two predictors
    k1,k2=list(preds)[:2]; best=None
    for a in np.linspace(0,1,21):
        e=((a*sh(k1)+(1-a)*sh(k2))-ys).abs().groupby(level=0).sum()/2; v=float((e*zw).sum()/zw.sum())
        if best is None or v<best[1]: best=(a,v)
    return res,best,len(T)
for cell_ft in [1320,2640]:
    r,b,nc=run(cell_ft,'es',lambda T:T.a5_9_20+0.2*T.a10_14_20,{'same ages (2010 5-10)':lambda T:T.a5_9_10+0.2*T.a10_14_10,'followed forward (2010 under-5)':lambda T:T.u5_10})
    print(f'ES ages 5-10, {cell_ft} ft cells ({nc} zone-cells): misplaced share', {k:f'{v:.1%}' for k,v in r.items()}, f'best blend {b[0]:.2f} static -> {b[1]:.1%}')
    r,b,nc=run(cell_ft,'ms',lambda T:T.a10_14_20,{'same ages (2010 10-14)':lambda T:T.a10_14_10,'followed forward (2010 0-4)':lambda T:T.u5_10})
    print(f'Ages 10-14, {cell_ft} ft cells ({nc}): misplaced share', {k:f'{v:.1%}' for k,v in r.items()}, f'best blend {b[0]:.2f} static -> {b[1]:.1%}')
