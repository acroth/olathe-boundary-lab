"""Turn optimizer results (work/opt_*.gpkg) into starting plans appended to public/data/presets.json."""
import geopandas as gpd, json, numpy as np, shapely, os, sys
from shapely.geometry import mapping
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT
P = json.load(open(f"{OUT}/presets.json")); SCH = json.load(open(f"{OUT}/schools.json"))['schools']
sid = {s['name']: s['i'] for s in SCH if s['level'] == 'es'}
base = next(p for p in P['presets'] if p['id'] == 'district')
PLANS = [
  ('d90', 'opt_se4_90.gpkg', 'District receivers: 90% cap',
   'District closures. The four southeast elementary closures go only to the district\'s listed receivers, with no receiver above 90% (Pre-K counted) in any year through 2034-35 and no islands. Trips kept under 2 miles where possible; 2 miles cannot be met for everyone at 90%. Walnut Grove and Indian Trail still unassigned.'),
  ('d2mi', 'opt_se4_2mi.gpkg', 'District receivers: 2-mile cap',
   'District closures. The four southeast elementary closures go only to the district\'s listed receivers, with every home within 2 road miles of its new school and no islands, using the lowest peak that allows it (about 111%). Walnut Grove and Indian Trail still unassigned.'),
  ('d25', 'opt_se4_25.gpkg', 'District receivers: 2.5-mile cap',
   'District closures. The four southeast elementary closures go only to the district\'s listed receivers, every home within 2.5 road miles of its new school, no islands, at the lowest peak that allows it (about 99%). Walnut Grove and Indian Trail still unassigned.'),
  ('a25', 'opt_se4_any25.gpkg', 'Any southeast school: 90%, 2.5 miles',
   'District closures. The four southeast elementary closures may go to any open southeast school (not only the listed receivers), with no school above 90% (Pre-K counted) in any year, every home within 2.5 road miles, and no islands. Walnut Grove and Indian Trail still unassigned.'),
  ('dc1', 'opt_dc1.gpkg', 'District option 1',
   'Read off the district\'s Concept 1 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Madison Place, east to Brougham. Scarborough: all to Sunnyside. Black Bob: northwest corner to Briarwood, southwest corner to Brougham, the rest to Green Springs. Tomahawk: west of Mur-Len to Havencroft, the rest to Briarwood. Walnut Grove: west of Pflumm to Heatherstone, east to Pleasant Ridge. Also Briarwood east of Black Bob Rd to Regency Place, and Pleasant Ridge\'s southeast part to Bentwood. Half of Spanish immersion (118) to Arbor Creek.'),
  ('dc2', 'opt_dc2.gpkg', 'District option 2',
   'Read off the district\'s Concept 2 map (Nov 2026 boundary presentation). Heritage: west of Ridgeview to Madison Place, Ridgeview to Indian Creek to Havencroft, east of Indian Creek to Sunnyside. Scarborough: west of Indian Creek to Madison Place, east to Sunnyside. Black Bob: west part to Brougham, the rest to Green Springs. Tomahawk: all to Briarwood. Walnut Grove: north part and a strip along Pflumm to Heatherstone, the rest to Pleasant Ridge. Also Briarwood south of 143rd to Green Springs, Green Springs by 151st to Brougham, Briarwood east of Black Bob Rd to Regency Place. Half of Spanish immersion (118) to Arbor Creek.'),
  ('dc3', 'opt_dc3.gpkg', 'District option 3',
   'Read off the district\'s Concept 3 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Havencroft, east to Sunnyside. Scarborough: west of Indian Creek to Madison Place, east to Sunnyside. Black Bob: southwest part to Brougham, the rest to Green Springs. Tomahawk: west of Mur-Len to Indian Creek, the rest to Briarwood. Walnut Grove: as option 2 (commercial land by I-35 to Countryside). Also Briarwood south of 143rd to Green Springs, Green Springs north of 143rd to Briarwood, Briarwood east of Black Bob Rd to Regency Place, Indian Creek west of Mur-Len near I-35 to Countryside, and Regency Place\'s east part to Bentwood. Half of Spanish immersion (118) to Arbor Creek.'),
  ('dc4', 'opt_dc4.gpkg', 'District option 4',
   'Read off the district\'s Concept 4 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Havencroft, east to Brougham. Scarborough: all to Sunnyside. Black Bob: southwest part to Brougham, the rest to Green Springs. Tomahawk: all to Briarwood. Walnut Grove: a wider band along I-35 to Countryside, the rest to Heatherstone and Pleasant Ridge. Also Briarwood south of 143rd to Green Springs, Green Springs north of 143rd to Regency Place, Briarwood east of Black Bob Rd to Regency Place, Regency Place\'s east part to Bentwood, and Brougham\'s south part to Arbor Creek. Half of Spanish immersion (118) to Arbor Creek.'),
]
P['presets'] = [p for p in P['presets'] if p['id'] not in {x[0] for x in PLANS} | {'hc1', 'hc2', 'hc3'}]   # hc1-3 (per-school boards) replaced by the full maps
for pid, f, name, desc in PLANS:
    U = gpd.read_file(f"{WORK}/{f}")
    edits = []
    for to, g in U.groupby('to'):
        geom = g.geometry.union_all()
        geom = gpd.GeoSeries([geom], crs=U.crs).to_crs(4326).iloc[0]
        geom = shapely.transform(geom, lambda c: np.round(c, 6))
        edits.append(dict(level='es', school=sid[to], geom=mapping(geom), label=f'{name}: to {to}'))
    if os.path.exists(f"{WORK}/swaps_{pid}.gpkg"):   # open school -> open school moves shown on the boards
        for _, r in gpd.read_file(f"{WORK}/swaps_{pid}.gpkg").iterrows():
            geom = shapely.transform(gpd.GeoSeries([r.geometry], crs=U.crs).to_crs(4326).iloc[0], lambda c: np.round(c, 6))
            edits.append(dict(level='es', school=sid[r.to], geom=mapping(geom), label=f'{name}: {r.frm} to {r.to}'))
    pre = dict(id=pid, name=name, description=desc, closures=base['closures'], edits=base['edits'] + edits)
    if pid.startswith('dc'):   # the district's own numbers for this option, shown next to the model's
        import district_tables as DT
        c = int(pid[2:])
        pre['district'] = dict(firstYear='2026-27', table=DT.TABLE[c], cap=DT.CAP, enroll2026=DT.ENROLL_2026,
                               pieces=[dict(frm=f, to=t, n=n) for f, t, n in DT.PIECES[c]])
    P['presets'].append(pre)
json.dump(P, open(f"{OUT}/presets.json", 'w'), separators=(',', ':'))
print([p['id'] for p in P['presets']])
