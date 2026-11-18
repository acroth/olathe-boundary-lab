"""Homes: one point per residential building, carrying an estimated unit count.
- 2020 census blocks give official housing units (HU20) and child ages (DHC P12).
- Overture footprints place those units on buildings; blocks that grew after 2020 get extra units
  from new house-sized buildings.
- Each home gets age weights per level (ES 5-10, MS 11-13, HS 14-17) from its block (per unit),
  or the district median rate for comparable new single-family homes.
Outputs: work/homes.parquet, work/blocks.parquet"""
import geopandas as gpd, pandas as pd, numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import RAW, DATA, WORK, CRS

D = gpd.read_file(f"{WORK}/district.gpkg").geometry.union_all()
DB = D.buffer(200)

# ---------- blocks + ages
B = gpd.read_file(f"{RAW}/jocok_blocks.gpkg").to_crs(CRS)
B = B[B.intersects(DB)].copy()
B['frac'] = B.geometry.intersection(D).area / B.geometry.area
B = B[B.frac > 0.5].reset_index(drop=True)
raw = json.load(open(f"{RAW}/jocok_dhc_p12_age_blocks.json"))
h = raw[0]; P = pd.DataFrame(raw[1:], columns=h).loc[:, lambda d: ~d.columns.duplicated()]
P['GEOID20'] = P.GEO_ID.str[-15:]
v = lambda c: pd.to_numeric(P[c], errors='coerce').fillna(0)
P['pop'] = v('P12_001N')
P['u5'] = v('P12_003N') + v('P12_027N'); P['a5_9'] = v('P12_004N') + v('P12_028N'); P['a10_14'] = v('P12_005N') + v('P12_029N'); P['a15_17'] = v('P12_006N') + v('P12_030N')
GQ = pd.read_csv(f"{RAW}/census_age_gq_blocks.csv", dtype={'GEOID20': str})[['GEOID20', 'gq']]
B = B.merge(P[['GEOID20', 'pop', 'u5', 'a5_9', 'a10_14', 'a15_17']], on='GEOID20', how='left').merge(GQ, on='GEOID20', how='left').fillna({'gq': 0})
hh = (1 - (B.gq / B['pop'].clip(lower=1))).clip(0, 1)            # household (non-group-quarters) share
NONFAM = set(open(f"{DATA}/nonfamily_blocks.txt").read().split())
hh[B.GEOID20.isin(NONFAM)] = 0
B['k_es'] = (B.a5_9 + 0.2 * B.a10_14) * hh                      # ages 5-10
B['k_ms'] = (0.6 * B.a10_14) * hh                                # ages 11-13
B['k_hs'] = (0.2 * B.a10_14 + B.a15_17) * hh                     # ages 14-17
# the same grades in 2027-28, followed forward from their 2020 ages (kids born after 2020 placed like 2020's under-5s)
B['a_es'] = B.u5 * hh                                            # 2027 ages 5-10 = 2020 ages 0-3 + later births
B['a_ms'] = (0.2 * B.u5 + 0.4 * B.a5_9) * hh                     # 2027 ages 11-13 = 2020 ages 4-6
B['a_hs'] = (0.6 * B.a5_9 + 0.2 * B.a10_14) * hh                 # 2027 ages 14-17 = 2020 ages 7-10
B['HU20'] = B.HOUSING20.astype(float)
B['bi'] = np.arange(len(B))

# ---------- buildings
bl = gpd.read_parquet(f"{RAW}/overture_building.parquet").to_crs(CRS)
bl = bl[bl.intersects(DB)].copy()
bl['area'] = bl.geometry.area                                     # sq ft
bl['floors'] = bl.num_floors.fillna((bl.height / 3.2).round().clip(1, 12)).fillna(1).clip(lower=1)
NONRES = {'commercial', 'industrial', 'education', 'civic', 'religious', 'outbuilding', 'agricultural', 'transportation', 'medical', 'service', 'entertainment', 'military'}
bl = bl[(bl.area >= 600) & ~bl.subtype.isin(NONRES)]
lu = gpd.read_parquet(f"{RAW}/overture_land_use.parquet").to_crs(CRS)
nonres_lu = lu[lu.subtype.isin(['education', 'religious', 'medical', 'golf', 'cemetery', 'transportation', 'recreation', 'agriculture'])].geometry.union_all()
bl = bl[~bl.geometry.representative_point().within(nonres_lu)]
seg = gpd.read_parquet(f"{RAW}/overture_segment.parquet").to_crs(CRS)
resroads = seg[(seg.subtype == 'road') & seg['class'].isin(['residential', 'living_street'])].geometry.union_all().buffer(250)
bl['pt'] = bl.geometry.representative_point()
bl['near_res'] = bl.pt.within(resroads)
cls = bl['class'].fillna('')
apt = (cls.isin(['apartments', 'dormitory'])) | ((bl.area > 5000) & (cls.isin(['residential', ''])) & bl.near_res & (bl.floors >= 2))
house = (~apt) & (bl.area <= 6000) & ((bl.subtype == 'residential') | cls.isin(['house', 'detached', 'semidetached_house', 'residential', 'terrace']) | (bl.subtype.isna() & bl.near_res))
bl['units'] = np.where(apt, (bl.area * bl.floors / 1100).round().clip(lower=4), np.where(house, 1.0, 0.0))
bl['kind'] = np.where(apt, 'apt', np.where(house, 'house', 'other'))
bl = bl[bl.units > 0]
P0 = gpd.GeoDataFrame(bl[['units', 'kind', 'area']], geometry=bl.pt.values, crs=CRS)
J = gpd.sjoin(P0, B[['bi', 'geometry']], predicate='within').drop(columns='index_right')

homes = []
grew = 0; new_units = 0
for bi, g in J.groupby('bi'):
    hu = B.HU20[bi]
    est = g.units.sum()
    if hu <= 0 and (g.kind == 'house').sum() < 5:
        continue                                                    # nonresidential block, stray buildings
    if est > max(1.5 * hu, hu + 10) and (g.kind == 'house').sum() >= 5:
        # grown since 2020: keep 2020 units on the existing stock (scaled), extra units are new homes
        grew += 1; new_units += est - hu
        g = g.assign(u=g.units, new=(est - hu) / est)
    else:
        if est > 3 * hu + 5:                                        # mixed block: keep smallest buildings
            g = g[g.kind == 'house'].sort_values('area').iloc[:int(1.3 * hu) + 3]
            est = g.units.sum()
        g = g.assign(u=g.units * (hu / max(est, 1e-9)), new=0.0)
    homes.append(g.assign(bi=bi))
H = gpd.GeoDataFrame(pd.concat(homes), geometry='geometry', crs=CRS)
# blocks with 2020 homes but no buildings: one point carrying all units
miss = B[(B.HU20 > 0) & ~B.bi.isin(H.bi)]
H = pd.concat([H, gpd.GeoDataFrame({'units': miss.HU20.values, 'kind': 'block', 'area': 0, 'bi': miss.bi.values, 'u': miss.HU20.values, 'new': 0.0},
                                    geometry=miss.geometry.representative_point().values, crs=CRS)], ignore_index=True)
H = H[H.geometry.within(D)].reset_index(drop=True)

# child rates per unit: own block for 2020 stock, district median of single-family blocks for new units
# two weights per home: s_ (each block keeps its 2020 share of the grade's ages) and a_ (2020 kids followed forward);
# s03 blends them 50/50 within each school's area
for lv in ['es', 'ms', 'hs']:
    for pre, col in [('s', f'k_{lv}'), ('a', f'a_{lv}')]:
        rate = (B[col] / B.HU20.where(B.HU20 > 0)).fillna(0)
        sf = B[(B.HU20 >= 20)]
        newrate = float((sf[col] / sf.HU20).quantile(0.75))     # new subdivisions skew toward families
        H[f'{pre}_{lv}'] = H.u * ((1 - H.new) * H.bi.map(rate) + H.new * newrate)
        print(lv, pre, 'new-home rate per unit', round(newrate, 3))
print('homes', len(H), 'units', round(H.u.sum()), 'HU20 in district', int(B.HU20.sum()), 'grown blocks', grew, 'new units', round(new_units))
print(H.kind.value_counts().to_dict())
H.to_parquet(f"{WORK}/homes.parquet")
B.to_parquet(f"{WORK}/blocks.parquet")
