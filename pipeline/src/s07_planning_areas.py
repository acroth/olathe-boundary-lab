"""District planning areas ("neighborhoods", from the district's 2026 boundary PDF) with students living in each,
by level and year (independent of which school a plan assigns them to).
Output: public/data/planning_areas.geojson  (pa, school, units, es[], ms[], hs[], lon, lat of a label point)"""
import geopandas as gpd, numpy as np, json, os, sys
import shapely
sys.path.insert(0, os.path.dirname(__file__))
from common import DATA, WORK, OUT, CRS

A = gpd.read_file(f"{DATA}/planning_areas_2026.gpkg").to_crs(CRS)
D = gpd.read_file(f"{WORK}/district.gpkg").geometry.union_all()
A['geometry'] = A.geometry.intersection(D)
A = A[~A.geometry.is_empty].reset_index(drop=True)
H = gpd.read_parquet(f"{WORK}/homes_assigned.parquet")
F = json.load(open(f"{WORK}/school_factors.json"))
j = gpd.sjoin(H[['geometry']], A[['geometry']], predicate='within')
j = j[~j.index.duplicated()]
H['pa_i'] = j.index_right.reindex(H.index)
out = []
for i, a in A.iterrows():
    h = H[H.pa_i == i]
    row = dict(pa=int(a.pa), school=a.school, units=round(float(h.u.sum())))
    for lv in ['es', 'ms', 'hs']:
        fac = np.array([F[o]['factor'] for o in h[f'orig_{lv}']]) if len(h) else np.zeros((0, 10))
        row[lv] = [round(float(x), 1) for x in (h[f'w_{lv}'].values[:, None] * fac).sum(axis=0)] if len(h) else [0.0] * 10
    lp = gpd.GeoSeries([a.geometry.representative_point()], crs=CRS).to_crs(4326).iloc[0]
    row['lon'], row['lat'] = round(lp.x, 6), round(lp.y, 6)
    out.append(row)
G = gpd.GeoDataFrame(out, geometry=A.geometry.values, crs=CRS).to_crs(4326)
G['geometry'] = G.geometry.apply(lambda g: shapely.transform(g, lambda c: np.round(c, 6)))
fc = json.loads(G.to_json())
for f in fc['features']: f['properties'] = {k: v for k, v in f['properties'].items()}
json.dump(fc, open(f"{OUT}/planning_areas.geojson", 'w'), separators=(',', ':'))
print('planning areas', len(G), round(os.path.getsize(f"{OUT}/planning_areas.geojson") / 1e3), 'KB')
print({r['pa']: r['es'][2] for r in out if r['pa'] in (610, 620, 730, 750, 770, 840)})
