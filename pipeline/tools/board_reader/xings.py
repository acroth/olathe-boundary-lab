import sys, json, geopandas as gpd, numpy as np
from shapely.ops import unary_union
sys.path.insert(0,'/home/claude/boundary/pipeline/src')
from common import WORK
E=gpd.read_parquet(f"{WORK}/street_edges.parquet")
NS={'LoneElm':r'Lone Elm Road$','Ridgeview':r'Ridgeview Road$','MurLen':r'Mur-?Len|Renner','BlackBob':r'Black Bob|Lackman','Pflumm':r'Pflumm','Quivira':r'Quivira'}
EW={'119':r'(^|\s)(W |West )?119th St','127':r'(^|\s)(W |West )?127th St','135':r'(^|\s)(W |West )?135th St|Santa Fe','143':r'(^|\s)(W |West )?143rd St','151':r'(^|\s)(W |West )?151st St','159':r'(^|\s)(W |West )?159th St'}
G={k:unary_union(E[E.name.fillna('').str.contains(p,regex=True)].geometry.values) for k,p in {**NS,**EW}.items()}
out={}
for a in NS:
    for b in EW:
        x=G[a].intersection(G[b])
        if x.is_empty: continue
        pts=[x] if x.geom_type=='Point' else list(getattr(x,'geoms',[]))
        if not pts: continue
        c=np.mean([[p.x,p.y] for p in pts],axis=0); out[f'{a}&{b}']=c.tolist()
        print(a,b,len(pts),np.round(c,0))
json.dump(out,open('/tmp/claude-0/-home-claude/7cfcc73c-d82a-5783-9f98-8f5dacf4d733/scratchpad/xings.json','w'))
