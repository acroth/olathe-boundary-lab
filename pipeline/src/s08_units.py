"""Units for optimizing a closing school's area: street blocks clipped to the closing zone (elementary + Indian Trail).
Per unit: students by year (ES or MS), max road miles from any home in it to each candidate school, neighbours.
Output: work/units_{level}.pkl"""
import geopandas as gpd, pandas as pd, numpy as np, json, os, sys, pickle
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT, CRS

SCH = json.load(open(f"{OUT}/schools.json"))['schools']
REC = json.load(open(f"{OUT}/presets.json"))['receivers']
RING = ['Arbor Creek', 'Briarwood', 'Brougham', 'Green Springs', 'Havencroft', 'Indian Creek', 'Madison Place', 'Sunnyside', 'Regency Place', 'Bentwood']
if os.environ.get('ANY_RING'):   # let southeast closures go to any open southeast school, not just the listed receivers
    _es = {s['name']: s['i'] for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level'] == 'es'}
    for c in ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk']: REC[str(_es[c])] = [_es[r] for r in RING]
S = gpd.read_parquet(f"{WORK}/schools.parquet")
F = json.load(open(f"{WORK}/school_factors.json"))
H = gpd.read_parquet(f"{WORK}/homes_assigned.parquet")
N = gpd.read_parquet(f"{WORK}/street_nodes.parquet"); E = gpd.read_parquet(f"{WORK}/street_edges.parquet")
G = csr_matrix((np.r_[E.len_ft, E.len_ft], (np.r_[E.u, E.v], np.r_[E.v, E.u])), shape=(len(N), len(N)))
tree = cKDTree(np.c_[N.x, N.y])
hd, hn = tree.query(np.c_[H.geometry.x, H.geometry.y])
faces = gpd.read_parquet(f"{WORK}/faces.parquet")
byname = {(s['level'], s['name']): s for s in SCH}

def build(level, closing, donors=()):
    Z = gpd.read_file(f"{WORK}/zones_{level}.gpkg")
    ids = {byname[(level, c)]['id'] for c in list(closing) + list(donors)}
    cz = Z[Z.school.isin(ids)][['school', 'geometry']]
    U = gpd.overlay(faces[['geometry']], cz, keep_geom_type=True).explode(index_parts=False).reset_index(drop=True)
    U = U[U.area > 200].reset_index(drop=True)
    # homes -> units
    j = gpd.sjoin(H[['geometry']], U[['geometry']], predicate='within'); j = j[~j.index.duplicated()]
    hu = j.index_right.reindex(H.index)
    stu = np.zeros((len(U), 10)); maxmi = {}
    don = {byname[(level, d)]['i']: [n for n in byname[(level, d)]['neighbors'] if SCH[n]['name'] not in closing] for d in donors}
    cands = sorted({r for c in closing for r in REC[str(byname[(level, c)]['i'])]} | set(don) | {n for v in don.values() for n in v})
    dist = {r: dijkstra(G, indices=SCH[r]['node']) for r in cands}
    w = H[f'w_{level}'].values; orig = H[f'orig_{level}'].values
    for k in range(len(U)):
        m = np.where(hu.values == k)[0]
        if len(m):
            stu[k] = sum(w[i] * np.array(F[orig[i]]['factor']) for i in m)
        for r in cands:
            maxmi[(k, r)] = float(((dist[r][hn[m]] + hd[m]) / 5280).max()) if len(m) else float(
                (dist[r][tree.query([U.geometry[k].representative_point().x, U.geometry[k].representative_point().y])[1]]) / 5280)
    U['closing'] = U.school.map({byname[(level, c)]['id']: c for c in list(closing) + list(donors)})
    # neighbours: shared edge > 30 ft between units; units touching each receiver's current zone
    sidx = U.sindex; nb = {k: set() for k in range(len(U))}; shared = {}
    for k, g in enumerate(U.geometry):
        for m in sidx.query(g.buffer(5)):
            if m <= k: continue
            L = g.buffer(5).intersection(U.geometry[m].buffer(5)).area / 10
            if L > 30: nb[k].add(m); nb[m].add(k); shared[(k, m)] = L
    touch = {}
    for r in cands:
        if r in don:   # a donor's own blocks: anchored at the block holding its building
            pt = gpd.points_from_xy([SCH[r]['lon']], [SCH[r]['lat']], crs=4326).to_crs(CRS)[0]
            touch[r] = {int(U.distance(pt).idxmin())}
            continue
        rz = Z[Z.school == SCH[r]['id']].geometry.union_all().buffer(5)
        touch[r] = {k for k, g in enumerate(U.geometry) if g.buffer(5).intersection(rz).area / 10 > 30}
    return dict(U=U, stu=stu, maxmi=maxmi, nb=nb, shared=shared, touch=touch, cands=cands, closing=closing, donors={SCH[d]['name']: v for d, v in don.items()})

DON = [d for d in os.environ.get('DONORS', '').split(',') if d]
out = {'es': build('es', ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove'], DON)}
if not DON: out['ms'] = build('ms', ['Indian Trail'])
for lv, d in out.items():
    print(lv, 'units', len(d['U']), 'students 2027-28', round(d['stu'][:, 2].sum()))
pickle.dump(out, open(f"{WORK}/units{'_d' if DON else ''}{'_any' if os.environ.get('ANY_RING') else ''}.pkl", 'wb'))
