"""Export compact files the app loads from public/data/.
schools.json  zones_{es,ms,hs}.geojson  faces.geojson  district.geojson  homes.bin  streets.bin  meta.json"""
import geopandas as gpd, pandas as pd, numpy as np, json, os, sys
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT, CRS

YRS = ['2025-26','2026-27','2027-28','2028-29','2029-30','2030-31','2031-32','2032-33','2033-34','2034-35']
S = gpd.read_parquet(f"{WORK}/schools.parquet").sort_values(['level', 'name']).reset_index(drop=True)
F = json.load(open(f"{WORK}/school_factors.json"))
idx = {sid: i for i, sid in enumerate(S.id)}
N = gpd.read_parquet(f"{WORK}/street_nodes.parquet")
tree = cKDTree(np.c_[N.x, N.y])
ll = S.to_crs(4326)
schools = []
for i, s in S.iterrows():
    g = {k: v for k, v in s.grades.items() if v is not None}; tot = sum(g.values()) or 1
    _, ni = tree.query([s.geometry.x, s.geometry.y])
    schools.append(dict(i=i, id=s.id, name=s['name'], level=s.level, code=s.code, lon=round(ll.geometry[i].x, 6), lat=round(ll.geometry[i].y, 6),
        node=int(ni), address=s.address, capacity=float(s.capacity), capSource=s.capSource, util=[int(u) for u in s.util],
        fixed=F[s.id]['fixed'], neighborhood=F[s.id]['neighborhood'], factor=F[s.id]['factor'],
        gradeShare={k: round(v / tot, 4) for k, v in g.items()}, enroll2025=s.enroll2025, prek=s.prek, immersion=int(s.immersion)))

# greedy map coloring per level so neighbouring zones never share a color
color = {}
for lv in ['es', 'ms', 'hs']:
    z = gpd.read_file(f"{WORK}/zones_{lv}.gpkg").set_index('school')
    order = sorted(z.index, key=lambda k: -z.loc[k].geometry.buffer(300).intersects(z.geometry).sum())
    for k in order:
        nb = z[z.geometry.intersects(z.loc[k].geometry.buffer(300))].index
        used = {color.get(n) for n in nb}
        cnt = {c: sum(1 for v in color.values() if v == c) for c in range(10)}
        color[k] = min((c for c in range(10) if c not in used), key=lambda c: (cnt[c], c))
for sc in schools: sc['color'] = color.get(sc['id'], 0)
# area = the high school attendance area the school sits in (used to show one part of the district at a time)
HSZ = gpd.read_file(f"{WORK}/zones_hs.gpkg")
hsname = dict(zip(S.id, S['name']))
for sc, (_, row) in zip(schools, S.iterrows()):
    hit = HSZ[HSZ.contains(row.geometry)]
    if not len(hit): hit = HSZ.iloc[[HSZ.distance(row.geometry).argmin()]]
    sc['area'] = hsname[hit.iloc[0].school].replace('Olathe ', '')
# neighbouring schools (zones touching, same level), by index
idx_of = {sc['id']: sc['i'] for sc in schools}
for lv in ['es', 'ms', 'hs']:
    z = gpd.read_file(f"{WORK}/zones_{lv}.gpkg").set_index('school')
    for k in z.index:
        nb = z[z.geometry.intersects(z.loc[k].geometry.buffer(300))].index
        schools[idx_of[k]]['neighbors'] = sorted(idx_of[n] for n in nb if n != k)
print('colors used', max(color.values()) + 1)

def gj(gdf, path, props, tol=3):
    g = gdf.copy()   # no simplification: shared edges must stay identical across files so they line up exactly
    g = g.to_crs(4326)
    g.to_file(path, driver='GeoJSON', COORDINATE_PRECISION=6)
    print(os.path.basename(path), round(os.path.getsize(path) / 1e6, 2), 'MB')

for lv in ['es', 'ms', 'hs']:
    z = gpd.read_file(f"{WORK}/zones_{lv}.gpkg"); z['school'] = z.school.map(idx)
    gj(z[['school', 'geometry']], f"{OUT}/zones_{lv}.geojson", ['school'])
d = gpd.read_file(f"{WORK}/district.gpkg"); gj(d, f"{OUT}/district.geojson", [], tol=5)
fc = gpd.read_parquet(f"{WORK}/faces.parquet"); fc['id'] = np.arange(len(fc)); gj(fc[['id', 'geometry']], f"{OUT}/faces.geojson", ['id'], tol=4)

# ---------- homes.bin
H = gpd.read_parquet(f"{WORK}/homes_assigned.parquet")
hl = H.to_crs(4326)
dist, ni = tree.query(np.c_[H.geometry.x, H.geometry.y])
cols = [('lon', np.float32, hl.geometry.x), ('lat', np.float32, hl.geometry.y),
        ('w_es', np.float32, H.w_es), ('w_ms', np.float32, H.w_ms), ('w_hs', np.float32, H.w_hs),
        ('units', np.float32, H.u), ('node', np.uint32, ni), ('offset_ft', np.float32, dist),
        ('orig_es', np.uint8, H.orig_es.map(idx)), ('orig_ms', np.uint8, H.orig_ms.map(idx)), ('orig_hs', np.uint8, H.orig_hs.map(idx)),
        ('isNew', np.uint8, (H.new > 0).astype(int))]
def write_bin(path, cols, n):
    buf = b''; layout = []
    for name, dt, v in cols:
        a = np.asarray(v, dtype=dt)
        pad = (-len(buf)) % 4; buf += b'\0' * pad
        layout.append(dict(name=name, type=np.dtype(dt).name, offset=len(buf), length=len(a)))
        buf += a.tobytes()
    open(path, 'wb').write(buf)
    print(os.path.basename(path), round(len(buf) / 1e6, 2), 'MB', n)
    return layout
homes_layout = write_bin(f"{OUT}/homes.bin", cols, len(H))

# ---------- streets.bin
E = gpd.read_parquet(f"{WORK}/street_edges.parquet")
nl = N.to_crs(4326)
names = sorted(set(E.name.dropna())); nmi = {n: i + 1 for i, n in enumerate(names)}
El = E.to_crs(4326)
coords = []; offs = [0]
for g in El.geometry:
    c = np.asarray(g.coords)[:, :2]; coords.append(c); offs.append(offs[-1] + len(c))
coords = np.vstack(coords)
scol = [('node_lon', np.float32, nl.geometry.x), ('node_lat', np.float32, nl.geometry.y),
        ('u', np.uint32, E.u), ('v', np.uint32, E.v), ('len_ft', np.float32, E.len_ft), ('cls', np.uint8, E.cls),
        ('name', np.uint16, E.name.map(nmi).fillna(0)), ('coord_off', np.uint32, offs),
        ('coord_lon', np.float32, coords[:, 0]), ('coord_lat', np.float32, coords[:, 1])]
streets_layout = write_bin(f"{OUT}/streets.bin", scol, len(E))

meta = dict(years=YRS, firstPlanYear=2, classSize={'K': 22, '1': 22, '2': 22, '3': 24, '4': 26, '5': 26},
            streetClasses=['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'],
            streetNames=names, homes=dict(count=len(H), layout=homes_layout), streets=dict(nodes=len(N), edges=len(E), layout=streets_layout),
            busMiles=2.5, target=0.85,
            sources=dict(utilization='Demographic Analytics Advisors, Enrollment Forecasting, Capacity and Utilization Analysis (July 2026), pp. 13-16',
                         enrollment='KSDE 2025-26 headcount by building and grade', prek='NCES CCD 2024-25',
                         boundaries='Johnson County AIMS School.gdb (current attendance areas; Westview merged into Rolling Ridge)',
                         homes='2020 Census blocks (housing units, DHC P12 ages) + Overture building footprints for post-2020 homes',
                         streets='Overture Maps transportation (OpenStreetMap), Nov 2026', basemap='Protomaps (OpenStreetMap)'))
json.dump(dict(meta=meta, schools=schools), open(f"{OUT}/schools.json", 'w'), separators=(',', ':'))
print('schools.json', round(os.path.getsize(f"{OUT}/schools.json") / 1e3), 'KB')
