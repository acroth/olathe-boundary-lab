"""Per-school elementary concepts for the Option Builder (mix and match), cut from the district's four full options.
Source: work/units_deck.parquet (street blocks of the 18 southeast/northeast schools, read off the deck maps by
tools/board_reader; f1..f4 = school each block goes to in district option 1..4).
Writes public/data/combos.json: concepts per closing school, open-school moves, district counts and capacities."""
import json, os, sys, numpy as np, geopandas as gpd, shapely
from shapely.geometry import mapping
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT
import district_tables as DT
U = gpd.read_parquet(f"{WORK}/units_deck.parquet")
SCH = [s for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level'] == 'es']
sid = {s['name']: s['i'] for s in SCH}; idn = {s['id']: s['name'] for s in SCH}
F = json.load(open(f"{WORK}/school_factors.json")); H = gpd.read_parquet(f"{WORK}/homes_assigned.parquet")
j = gpd.sjoin(H[['geometry']], U[['geometry']], predicate='within'); j = j[~j.index.duplicated()]
w26 = H.w_es.values * np.array([F[o]['factor'][1] for o in H.orig_es])
U['s26'] = np.bincount(j.index_right.values, weights=w26[j.index.values], minlength=len(U))   # model students, 2026-27

def geo(sel):
    g = gpd.GeoSeries([U.geometry[sel].union_all()], crs=U.crs).to_crs(4326).iloc[0]
    return mapping(shapely.transform(g, lambda c: np.round(c, 6)))

# concept k of a school = what that school's blocks do in district option `col`
CONCEPTS = {
  'Heritage': [(1, 'f1', 'West of Lindenwood to Madison Place; east of Lindenwood to Brougham'),
               (2, 'f2', 'West of Ridgeview to Madison Place; Ridgeview to Indian Creek to Havencroft; east of Indian Creek to Sunnyside'),
               (3, 'f3', 'West of Indian Creek to Havencroft; east to Sunnyside'),
               (4, 'f4', 'Only in district-wide option 4, not in the Heritage deck: west of Lindenwood to Havencroft; east to Brougham')],
  'Scarborough': [(1, 'f1', 'All to Sunnyside'), (2, 'f2', 'West of Indian Creek to Madison Place; east to Sunnyside')],
  'Black Bob': [(1, 'f1', 'Northwest corner to Briarwood; southwest corner to Brougham; the rest to Green Springs'),
                (2, 'f2', 'West part to Brougham; the rest to Green Springs'),
                (3, 'f3', 'Southwest part to Brougham; the rest to Green Springs')],
  'Tomahawk': [(1, 'f1', 'West of Mur-Len to Havencroft; the rest to Briarwood'), (2, 'f2', 'All to Briarwood'),
               (3, 'f3', 'West of Mur-Len to Indian Creek; the rest to Briarwood')],
  'Walnut Grove': [(1, 'f1', 'West of Pflumm to Heatherstone; east of Pflumm to Pleasant Ridge'),
                   (2, 'f2', 'North part and a strip along Pflumm to Heatherstone; the rest to Pleasant Ridge'),
                   (3, 'f4', 'Band along I-35 to Countryside; otherwise as concept 2')],
}
DCOUNT = {}   # district 2026-27 K-5 counts by (school, concept, receiver), from the parent-meeting decks
for c, rows in DT.PIECES.items():
    for f, t, n in rows: DCOUNT.setdefault((f, t), {})[c] = n
CMAP = {'Heritage': {1: 1, 2: 2, 3: 3, 4: 4}, 'Scarborough': {1: 1, 2: 2}, 'Black Bob': {1: 1, 2: 2, 3: 3}, 'Tomahawk': {1: 1, 2: 2, 3: 3}, 'Walnut Grove': {1: 1, 2: 2, 3: 4}}
schools = []
for name, cs in CONCEPTS.items():
    out = []
    for k, col, summ in cs:
        sel0 = U.name == name; pieces = []
        for to, g in U[sel0].groupby(col):
            n = DCOUNT.get((name, to), {}).get(CMAP[name][k])
            pieces.append(dict(to=to, school=sid[to], geom=geo(sel0 & (U[col] == to)), model26=round(float(g.s26.sum())), district=n))
        out.append(dict(id=k, summary=summ, pieces=pieces))
    schools.append(dict(name=name, i=sid[name], concepts=out))
# moves between open schools that come with some concepts
MOVES = [  # id, from, to, column, label, rule (default on when ...)
  ('630', 'Briarwood', 'Regency Place', 'f1', 'Briarwood east of Black Bob Rd (planning area 630) to Regency Place', 'always'),
  ('PR-BE', 'Pleasant Ridge', 'Bentwood', 'f1', 'Pleasant Ridge southeast part to Bentwood (district option 1)', 'WG1'),
  ('BW-GS', 'Briarwood', 'Green Springs', 'f2', 'Briarwood south of 143rd to Green Springs (Black Bob concepts 2 and 3)', 'BB2|BB3'),
  ('GS-BR', 'Green Springs', 'Brougham', 'f2', 'Green Springs west of Black Bob Rd by 151st to Brougham (Black Bob concept 2)', 'BB2'),
  ('GSN-BW', 'Green Springs', 'Briarwood', 'f3', 'Green Springs north of 143rd to Briarwood (district option 3)', 'BB3&!TH2'),
  ('GSN-RP', 'Green Springs', 'Regency Place', 'f4', 'Green Springs north of 143rd to Regency Place (district option 4)', 'BB3&TH2'),
  ('RP-BE', 'Regency Place', 'Bentwood', 'f4', 'Regency Place east part to Bentwood (district options 3 and 4)', 'BB3'),
  ('IC-CS', 'Indian Creek', 'Countryside', 'f3', 'Indian Creek northwest corner to Countryside (with Tomahawk concept 3)', 'TH3'),
  ('BR-AC', 'Brougham', 'Arbor Creek', 'f4', 'Brougham south part to Arbor Creek (district option 4)', '(HT1|HT4)&BB3'),
]
moves = []
for mid, f, t, col, label, rule in MOVES:
    sel = (U.name == f) & (U[col] == t)
    moves.append(dict(id=mid, frm=f, to=t, school=sid[t], label=label, rule=rule, geom=geo(sel), model26=round(float(U.s26[sel].sum()))))
excl = [['GSN-BW', 'GSN-RP']]   # the same area: only one at a time
base = dict(enroll2026={k: v for k, v in DT.ENROLL_2026.items()}, cap=DT.CAP)
base['enroll2026']['Arbor Creek'] = 466   # district's 2027-28 Arbor Creek, with half of immersion arriving
json.dump(dict(basePreset='district', schools=schools, moves=moves, exclusive=excl, district=base,
               options={'1': [1, 1, 1, 1, 1], '2': [2, 2, 2, 2, 2], '3': [3, 2, 3, 3, 2], '4': [4, 1, 3, 2, 3]}),
          open(f"{OUT}/combos.json", 'w'), separators=(',', ':'))
for s in schools: print(s['name'], [(c['id'], [(p['to'], p['model26'], p['district']) for p in c['pieces']]) for c in s['concepts']])
print([(m['id'], m['model26']) for m in moves]); print(os.path.getsize(f"{OUT}/combos.json") // 1024, 'KB')
