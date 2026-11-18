"""Schools: points, current attendance zones (ES/MS/HS), 2025-26 enrollment by grade (KSDE),
DAA utilization trajectories, functional capacity (published where known, else enrollment / utilization).
Outputs: work/schools.parquet, work/zones_{es,ms,hs}.gpkg, work/district.gpkg"""
import district_tables as DT
import geopandas as gpd, pandas as pd, numpy as np, json, re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import RAW, DATA, WORK, CRS
G = f"{RAW}/School.gdb"
YRS = ['2025-26','2026-27','2027-28','2028-29','2029-30','2030-31','2031-32','2032-33','2033-34','2034-35']

dist = gpd.read_file(G, layer='SCHOOLDIST_PL').to_crs(CRS)
dist = dist[dist.DISTRICT.astype(str) == '233'][['geometry']]
dist.to_file(f"{WORK}/district.gpkg")
D = dist.geometry.union_all()

def norm(s):
    s = re.sub(r'\b(Elem(entary)?|Elementary School|Middle School|Sr High|High School|Campus)\b', '', str(s), flags=re.I)
    return re.sub(r'\s+', ' ', s).strip().lower()

# --- KSDE 2025-26 headcount by building & grade
k = pd.read_csv(f"{DATA}/ksde_2025_26_by_school_grade.csv", dtype={'bldg': str})
GMAP = {'Kindergarten':'K','1st Grade':'1','2nd Grade':'2','3rd Grade':'3','4th Grade':'4','5th Grade':'5','6th Grade':'6',
        '7th Grade':'7','8th Grade':'8','9th Grade':'9','10th Grade':'10','11th Grade':'11','12th Grade':'12'}
k['g'] = k.grade.str.strip().map(GMAP)
k.loc[k.grade.str.contains('Pre|Preschool|Special Ed 3', na=False), 'g'] = 'PK'
k = k[k.g.notna()]
K = k.pivot_table(index='bldg', columns='g', values='n', aggfunc='sum').fillna(0)
names = k.groupby('bldg').name.first()

# --- utilization trajectories (DAA report pp13-16)
U = pd.concat([pd.read_csv(f"{DATA}/util_{l}.csv").assign(level=l) for l in ['es','ms','hs']])
U['key'] = U.school.map(norm)

# --- published capacities (Facility Alignment Meeting 3 pp54-56 + back-solved; see legacy_se_data.py)
sys.path.insert(0, DATA)
import legacy_se_data as L
PUB = {norm(s): v[3] for s, v in L.ES.items()}
PUB.update({norm(s): v[1] for s, v in L.MS.items()})
PUB[norm('Pleasant Ridge')] = 522
PUBSRC = 'district published / back-solved (Facility Alignment Meeting 3)'
NP = pd.read_csv(f"{DATA}/nces_prek_2024_25.csv")
NP = {norm(re.sub(r'\b(ELEM(ENTARY)?)\b', '', n, flags=re.I)).replace('  ', ' '): v for n, v in zip(NP.name, NP.prek)}
# Spanish immersion: 236 at Black Bob in 2026-27 (Black Bob meeting, Nov 10: 132 live in Black Bob's area, 105 transfer in).
# The district expects about half to follow the program to Arbor Creek when Black Bob closes: 118 at Arbor Creek.
# Of the half that stays, the 66 living in Black Bob's area are counted as Black Bob neighborhood students (they go to the
# receiving schools); the ~52 transfers return to schools outside this area and are not modelled.
# Black Bob's entry is the immersion still in the building while it is open, beyond those 66: 236 - 66 = 170.
IMMERSION = {'arbor creek': 118, 'black bob': 170}

# --- points
P = gpd.read_file(G, layer='SCHOOL_PT').to_crs(CRS)
P = P[(P.DISTRICT.astype(str) == '233') & P.SCHTYPE.isin(['Elementary','Middle','High'])].copy()
P['bldg'] = P.BLDGNUMBER.fillna(0).astype(int).astype(str).str.zfill(4)
P['level'] = P.SCHTYPE.map({'Elementary':'es','Middle':'ms','High':'hs'})

rows = []
GR = {'es': ['K','1','2','3','4','5'], 'ms': ['6','7','8'], 'hs': ['9','10','11','12']}
for _, p in P.iterrows():
    nm = re.sub(r'\s+(Elementary|Middle|High)$', '', p.SCHNAME).strip()
    key = norm(nm)
    u = U[(U.key == key) & (U.level == p.level)]
    grades = {g: float(K.loc[p.bldg, g]) if p.bldg in K.index and g in K.columns else 0.0 for g in GR[p.level]}
    prek = float(NP.get(key, 0.0)) if p.level == 'es' else 0.0   # NCES 2024-25 Pre-K headcount (program-placed)
    if p.level == 'es' and nm in DT.EC_2026: prek = float(DT.EC_2026[nm])   # district fall 2026 Early Childhood, where known
    enr = sum(grades.values())
    traj = [int(x) for x in u.iloc[0][YRS]] if len(u) else None
    if key in PUB:
        cap, src = PUB[key], PUBSRC
    elif traj and enr > 0:
        cap, src = round(enr / (traj[0] / 100)), 'estimated: KSDE 2025-26 headcount / DAA 2025-26 utilization'
    else:
        cap, src = None, 'unknown'
    if p.level == 'es' and nm in DT.CAP: cap, src = float(DT.CAP[nm]), 'district 2026 functional capacity (Nov 2026 boundary presentations)'
    rows.append(dict(id=f"{p.level}-{p.bldg}", bldg=p.bldg, name=nm, level=p.level, code=(u.iloc[0].code if len(u) else None),
                     grades=grades, prek=prek, immersion=IMMERSION.get(key, 0), enroll2025=enr, capacity=cap, capSource=src, util=traj,
                     address=p.ADDRESS, geometry=p.geometry))
S = gpd.GeoDataFrame(rows, crs=CRS)
# Westview closed end of 2025-26 (students to Rolling Ridge); drop it as a school
S = S[(S.name.str.lower() != 'westview') & S.util.notna()]
missing = S[S.util.isna()]
print('schools', S.groupby('level').size().to_dict(), 'no trajectory:', missing.name.tolist())
S.to_parquet(f"{WORK}/schools.parquet")

# --- zones
LAY = {'es': ('SCHOOLATTENDBNDELEM_PL', 'Elem_Name'), 'ms': ('SCHOOLATTENDBNDMID_PL', 'Mid_Name'), 'hs': ('SCHOOLATTENDBNDHIGH_PL', 'High_Name')}
for lv, (layer, col) in LAY.items():
    z = gpd.read_file(G, layer=layer).to_crs(CRS)
    z = z[z.District.astype(str) == '233'].copy()
    z['bldg'] = z.BldgNum.astype(int).astype(str).str.zfill(4)
    z['name'] = z[col]
    # Westview -> Rolling Ridge
    rr = S[(S.level == 'es') & (S.name == 'Rolling Ridge')]
    if lv == 'es' and len(rr):
        z.loc[z.name.str.lower() == 'westview', 'bldg'] = rr.iloc[0].bldg
    z = z.dissolve('bldg').reset_index()[['bldg', 'geometry']]
    z['school'] = f"{lv}-" + z.bldg
    unk = set(z.school) - set(S.id)
    print(lv, 'zones', len(z), 'unmatched', unk)
    z.geometry = z.geometry.intersection(D).buffer(0)
    z.to_file(f"{WORK}/zones_{lv}.gpkg")
print(S[['name','level','enroll2025','prek','capacity','capSource']].assign(u25=S.util.map(lambda t: t[0] if t else None)).to_string())
