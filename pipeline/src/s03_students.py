"""Students: each home's original school per level (current zones) and per-school scale factors.
Neighborhood students at school s in year y = util[s][y] * capacity[s] (less immersion still housed at Black Bob)
spread over homes in s's current zone by age weight. A home keeps its original school's factor wherever it is assigned,
so moving a home moves its projected students.
Outputs: work/homes_assigned.parquet, work/school_factors.json"""
import geopandas as gpd, pandas as pd, numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from district_tables import K5_2026
import dotweights
from common import WORK, CRS

S = gpd.read_parquet(f"{WORK}/schools.parquet")
H = gpd.read_parquet(f"{WORK}/homes.parquet")
out = {}
# share given to 'same ages as 2020' vs 'followed forward'; set from a 2010->2020 backtest in the district (both beat either alone;
# best weights: ages 5-10 0.55-0.70 static over 10 years, ages 10-14 0.35-0.45 static)
BLEND_STATIC = {'es': 0.5, 'ms': 0.4, 'hs': 0.4}
for lv in ['es', 'ms', 'hs']:
    Z = gpd.read_file(f"{WORK}/zones_{lv}.gpkg")
    j = gpd.sjoin(H[['geometry']], Z[['school', 'geometry']], predicate='within', how='left')
    j = j[~j.index.duplicated()]
    # homes on a zone seam: nearest zone
    m = j.school.isna()
    if m.any():
        nn = gpd.sjoin_nearest(H[m][['geometry']], Z[['school', 'geometry']])
        j.loc[m, 'school'] = nn[~nn.index.duplicated()].school
    H[f'orig_{lv}'] = j.school.values
    # blend: half by each block's 2020 share of the grade's ages, half by 2020 kids followed forward to 2027-28
    o = H[f'orig_{lv}']
    ss = H[f's_{lv}'] / o.map(H.groupby(o)[f's_{lv}'].sum()).replace(0, 1)
    sa = H[f'a_{lv}'] / o.map(H.groupby(o)[f'a_{lv}'].sum()).replace(0, 1)
    H[f'w_{lv}'] = (BLEND_STATIC[lv] * ss + (1 - BLEND_STATIC[lv]) * sa) * 100
    if lv == 'es':   # closing schools: where students live, from the district's student-dot maps
        H = dotweights.apply(H, dict(zip(S.id, S.name)))
    W = H.groupby(f'orig_{lv}')[f'w_{lv}'].sum()
    for _, s in S[S.level == lv].iterrows():
        # DAA utilization = K-5 headcount / functional capacity (it matches KSDE K-5 counts, without Pre-K), so neighborhood
        # students = util x capacity, less the Spanish immersion students still counted at Black Bob in the published trajectory.
        fixed = s.immersion if s['name'] != 'Black Bob' else 0   # immersion moves to Arbor Creek in plan years; Pre-K is added in the app (toggle)
        now = s.immersion if s['name'] == 'Black Bob' else 0   # immersion counted in Black Bob's published utilization, less the in-area half that stays
        T = [max(0.0, u / 100 * s.capacity - now) for u in s.util]
        if lv == 'es' and s['name'] in K5_2026 and T[1] > 0:   # calibrate to the district's fall 2026 count, keeping the projected trend
            k = K5_2026[s['name']] / T[1]; T = [t * k for t in T]
        w = float(W.get(s.id, 0))
        out[s.id] = dict(weight=w, fixed=fixed, neighborhood=[round(t, 1) for t in T], factor=[t / w if w else 0 for t in T])
        if w == 0: print('WARN no homes for', s.id, s['name'])
    tot = sum(out[i]['neighborhood'][1] for i in S[S.level == lv].id)
    print(lv, '2026-27 neighborhood students', round(tot), 'homes', len(H))
json.dump(out, open(f"{WORK}/school_factors.json", 'w'))
H.to_parquet(f"{WORK}/homes_assigned.parquet")
