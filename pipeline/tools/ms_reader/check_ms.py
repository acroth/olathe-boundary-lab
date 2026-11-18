import pickle, json, numpy as np, geopandas as gpd
W = '/home/claude/boundary/pipeline/work'; O = '/home/claude/olb/public/data'
R = pickle.load(open(f'{W}/ms_concepts_clean.pkl', 'rb')); cur = R['cur']
sj = json.load(open(f'{O}/schools.json')); S = sj['schools']; m = sj['meta']['homes']
buf = open(f'{O}/homes.bin', 'rb').read(); T = {'float32': np.float32, 'uint32': np.uint32, 'uint16': np.uint16, 'uint8': np.uint8}
c = {l['name']: np.frombuffer(buf, dtype=T[l['type']], count=l['length'], offset=l['offset']) for l in m['layout']}
H = gpd.GeoDataFrame(geometry=gpd.points_from_xy(c['lon'], c['lat']), crs=4326).to_crs(3419)
faces = gpd.read_parquet(f'{W}/faces.parquet')
j = gpd.sjoin(H, faces.reset_index().rename(columns={'index': 'fid'})[['fid', 'geometry']], predicate='within', how='left')
fid = j[~j.index.duplicated()].fid.values
fac = np.array([S[o]['factor'] for o in c['orig_ms']])            # per-home factor by year (from its original school)
stu = c['w_ms'][:, None] * fac
name = {s['i']: s['name'] for s in S}
DT = {1: {'California Trail': 737, 'Chisholm Trail': 760, 'Frontier Trail': 813, 'Oregon Trail': 593, 'Pioneer Trail': 673, 'Santa Fe Trail': 720},
      2: {'California Trail': 809, 'Chisholm Trail': 793, 'Frontier Trail': 780, 'Oregon Trail': 700, 'Pioneer Trail': 663, 'Santa Fe Trail': 613},
      3: {'California Trail': 754, 'Chisholm Trail': 787, 'Frontier Trail': 759, 'Oregon Trail': 700, 'Pioneer Trail': 675, 'Santa Fe Trail': 613},
      4: {'California Trail': 885, 'Chisholm Trail': 697, 'Frontier Trail': 933, 'Oregon Trail': 593, 'Pioneer Trail': 626, 'Santa Fe Trail': 720},
      5: {'California Trail': 628, 'Chisholm Trail': 841, 'Frontier Trail': 885, 'Oregon Trail': 593, 'Pioneer Trail': 621, 'Santa Fe Trail': 720}}
y = 2   # 2027-28
base = np.array([name[o] for o in c['orig_ms']], dtype=object)
for k, lab in R['final'].items():
    a = base.copy(); ok = ~np.isnan(fid)
    a[ok] = [lab[int(f)] if isinstance(lab[int(f)], str) else b for f, b in zip(fid[ok], base[ok])]
    print(f'Concept {k}  (2027-28: district / model / gap)')
    for n, d in DT[k].items():
        mo = stu[a == n, y].sum() + next(s['fixed'] for s in S if s['name'] == n and s['level'] == 'ms')
        print(f'   {n:17} {d:5d} {mo:6.0f} {mo - d:+5.0f}')
    print('   left at Indian Trail:', round(stu[a == 'Indian Trail', y].sum()))
