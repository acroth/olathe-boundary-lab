"""Starting plans. A plan = closed schools + an ordered list of edits (later edits win) on top of the current zones.
- current: today's zones, nothing closed
- district: the district's recommended closures (Nov 2026 deck p.81) and the approved Fairview->Northview, Ridgeview->Central merges;
  closing schools' areas left unassigned to draw
- seA / seB: the southeast elementary plans from the earlier optimizer (district receivers 86.5% / any adjacent 85%)
Output: public/data/presets.json"""
import geopandas as gpd, pandas as pd, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT, CRS
SP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'legacy')  # earlier southeast optimizer outputs

sch = json.load(open(f"{OUT}/schools.json"))['schools']
byname = {(s['level'], s['name']): s['i'] for s in sch}
def sid(lv, n): return byname[(lv, n)]

CLOSE = {('es', 'Black Bob'): 2, ('es', 'Heritage'): 2, ('es', 'Scarborough'): 2, ('es', 'Tomahawk'): 2, ('es', 'Walnut Grove'): 2,
         ('ms', 'Indian Trail'): 2, ('es', 'Fairview'): 3, ('es', 'Ridgeview'): 3}
RECEIVERS = {('es', 'Black Bob'): ['Brougham', 'Green Springs', 'Havencroft'], ('es', 'Heritage'): ['Brougham', 'Havencroft', 'Madison Place'],
             ('es', 'Scarborough'): ['Brougham', 'Sunnyside', 'Madison Place'], ('es', 'Tomahawk'): ['Briarwood', 'Havencroft', 'Indian Creek'],
             ('es', 'Walnut Grove'): ['Countryside', 'Heatherstone', 'Pleasant Ridge'],
             ('ms', 'Indian Trail'): ['Chisholm Trail', 'Frontier Trail', 'Santa Fe Trail', 'Pioneer Trail', 'Oregon Trail'],
             ('es', 'Fairview'): ['Northview'], ('es', 'Ridgeview'): ['Central']}
closures = {str(sid(lv, n)): y for (lv, n), y in CLOSE.items()}
receivers = {str(sid(lv, n)): [sid(lv, r) for r in rs] for (lv, n), rs in RECEIVERS.items()}

Z = gpd.read_file(f"{WORK}/zones_es.gpkg").to_crs(4326)
S = gpd.read_parquet(f"{WORK}/schools.parquet")
bid = dict(zip(S.id, S['name']))
def zone_geom(n):
    b = S[(S.level == 'es') & (S['name'] == n)].id.iloc[0]
    return Z[Z.school == b].geometry.union_all()
merges = [dict(level='es', school=sid('es', 'Northview'), geom=zone_geom('Fairview').__geo_interface__, label='Fairview merges into Northview'),
          dict(level='es', school=sid('es', 'Central'), geom=zone_geom('Ridgeview').__geo_interface__, label='Ridgeview merges into Central')]

def legacy(path):
    """Re-express an earlier block-level plan on street blocks clipped to today's zones, so edges follow streets and zone lines."""
    g = gpd.read_file(f"{SP}/{path}")
    dom = pd.read_pickle(f"{SP}/domain.pkl")[['GEOID20', 'disp']]
    g = g.merge(dom, on='GEOID20', how='left')
    g['geometry'] = [d if d is not None and not d.is_empty else x for d, x in zip(g.disp, g.geometry)]
    g = gpd.GeoDataFrame(g[['to', 'geometry']], geometry='geometry', crs=CRS)
    Zc = gpd.read_file(f"{WORK}/zones_es.gpkg")
    Zc['name'] = Zc.school.map(bid)
    F = gpd.read_parquet(f"{WORK}/faces.parquet")
    area = g.geometry.union_all().buffer(50)
    P = gpd.overlay(F[F.intersects(area)], Zc[['name', 'geometry']], keep_geom_type=True)
    P = P[P.area > 500].reset_index(drop=True)
    rp = gpd.GeoDataFrame(geometry=P.geometry.representative_point(), crs=CRS)
    j = gpd.sjoin(rp, g, predicate='within', how='left'); j = j[~j.index.duplicated()]
    P['to'] = j['to'].values
    closing = {'Black Bob', 'Heritage', 'Scarborough', 'Tomahawk'}
    miss = P.to.isna() & P.name.isin(closing)
    if miss.any():
        nn = gpd.sjoin_nearest(rp[miss], g); P.loc[miss, 'to'] = nn[~nn.index.duplicated()]['to'].values
    P = P[P.to.notna() & (P.to != P.name)]
    out = []
    for to, grp in P.groupby('to'):
        geom = grp.geometry.union_all()
        geom = gpd.GeoSeries([geom], crs=CRS).to_crs(4326).iloc[0]
        out.append(dict(level='es', school=sid('es', to), geom=geom.__geo_interface__, label=f'Southeast plan: to {to}'))
    return out

presets = [
    dict(id='current', name='Current boundaries (2025-26)', description='Today\'s attendance areas. Nothing closed.', closures={}, edits=[]),
    dict(id='district', name='District closures, areas to draw',
         description='Closes the six schools the district recommended (end of 2026-27) plus Fairview and Ridgeview (approved, 2028-29). Fairview and Ridgeview areas merge into Northview and Central; the other closing areas are left unassigned for you to draw.',
         closures=closures, edits=merges),
    dict(id='seA', name='Southeast plan A: district receivers only',
         description='District closures, with the four southeast elementary closures absorbed only by the district\'s listed receivers, as drawn by the earlier optimizer (which used lower student counts). Walnut Grove and Indian Trail areas still unassigned.',
         closures=closures, edits=merges + legacy('u_district_86_l8.0_m2.0_2stage.gpkg')),
    dict(id='seB', name='Southeast plan B: any adjacent school',
         description='District closures, with the four southeast elementary closures absorbed by any adjacent open school within 2.5 miles, as drawn by the earlier optimizer (which used lower student counts). Walnut Grove and Indian Trail areas still unassigned.',
         closures=closures, edits=merges + legacy('u_any_85_l8.0_m2.0_2stage.gpkg')),
]
import shapely, numpy as np
from shapely.geometry import shape, mapping
for pr in presets:   # same 6-decimal rounding as the zone files, so shared edges match exactly
    for e in pr['edits']:
        e['geom'] = mapping(shapely.transform(shape(e['geom']), lambda c: np.round(c, 6)))
json.dump(dict(receivers=receivers, presets=presets), open(f"{OUT}/presets.json", 'w'), separators=(',', ':'))
print('presets.json', round(os.path.getsize(f"{OUT}/presets.json") / 1e3), 'KB', [len(p['edits']) for p in presets])
