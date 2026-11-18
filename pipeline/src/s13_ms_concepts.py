"""Add the district's five middle school boundary concepts (Nov 2026 MS deck) to public/data/combos.json.
Input: work/ms_concepts_clean.pkl from tools/ms_reader (read_ms -> finalize_ms -> clean_ms): each street block's middle school per concept.
Each concept becomes middle-school edits (one area per receiving school, for blocks that change) plus the district's five-year table."""
import json, pickle, sys, os
import geopandas as gpd
from shapely.geometry import mapping
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT

R = pickle.load(open(f'{WORK}/ms_concepts_clean.pkl', 'rb')); cur = R['cur']
faces = gpd.read_parquet(f'{WORK}/faces.parquet')
SCH = json.load(open(f'{OUT}/schools.json'))['schools']
ms_i = {s['name']: s['i'] for s in SCH if s['level'] == 'ms'}
CAP = {'California Trail': 1007, 'Chisholm Trail': 999, 'Frontier Trail': 1071, 'Oregon Trail': 863, 'Pioneer Trail': 925, 'Santa Fe Trail': 907}
T = {   # district five-year estimates 26-27 .. 31-32
 1: {'California Trail': [617, 737, 703, 665, 621, 633], 'Chisholm Trail': [570, 760, 702, 686, 661, 659], 'Frontier Trail': [721, 813, 818, 805, 783, 756],
     'Oregon Trail': [621, 593, 582, 574, 579, 556], 'Pioneer Trail': [646, 673, 714, 748, 776, 743], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
 2: {'California Trail': [617, 809, 775, 737, 693, 705], 'Chisholm Trail': [570, 793, 724, 711, 691, 691], 'Frontier Trail': [721, 780, 796, 780, 753, 724],
     'Oregon Trail': [621, 700, 687, 677, 674, 648], 'Pioneer Trail': [646, 663, 738, 772, 800, 767], 'Santa Fe Trail': [605, 613, 609, 610, 577, 562]},
 3: {'California Trail': [617, 754, 732, 701, 665, 676], 'Chisholm Trail': [570, 787, 764, 751, 728, 723], 'Frontier Trail': [721, 759, 764, 751, 729, 702],
     'Oregon Trail': [621, 700, 687, 677, 674, 648], 'Pioneer Trail': [646, 675, 716, 733, 756, 746], 'Santa Fe Trail': [605, 613, 609, 610, 577, 562]},
 4: {'California Trail': [617, 885, 851, 813, 769, 781], 'Chisholm Trail': [570, 697, 674, 661, 638, 633], 'Frontier Trail': [721, 933, 938, 925, 903, 876],
     'Oregon Trail': [621, 593, 582, 574, 579, 556], 'Pioneer Trail': [646, 626, 701, 735, 763, 730], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
 5: {'California Trail': [617, 628, 606, 575, 539, 550], 'Chisholm Trail': [570, 841, 818, 805, 782, 777], 'Frontier Trail': [721, 885, 890, 877, 855, 828],
     'Oregon Trail': [621, 593, 582, 574, 579, 556], 'Pioneer Trail': [646, 621, 662, 679, 702, 692], 'Santa Fe Trail': [605, 720, 714, 713, 672, 654]},
}
SUMMARY = {
 1: 'Havencroft and Heritage to Frontier Trail; Scarborough and south Brougham to Chisholm Trail; Ridgeview to Santa Fe Trail; west Heatherstone to California Trail; east Tomahawk to Pioneer Trail.',
 2: 'Indian Creek, Tomahawk and east Briarwood to California Trail; Pleasant Ridge and east Heatherstone to Pioneer Trail; Havencroft and Heritage to Frontier Trail; Scarborough and south/west Brougham to Chisholm Trail; Ridgeview to Oregon Trail.',
 3: 'East Tomahawk and east Briarwood to California Trail; Scarborough and east/west Heritage to Chisholm Trail; Havencroft and central Heritage to Frontier Trail; west Tomahawk to Pioneer Trail; Ridgeview to Oregon Trail.',
 4: 'Indian Creek, Tomahawk, east Briarwood and north Green Springs to California Trail; north Pleasant Ridge and east Heatherstone to Pioneer Trail; Havencroft and Heritage to Frontier Trail; Scarborough to Chisholm Trail; Ridgeview to Santa Fe Trail.',
 5: 'Only three schools change: Scarborough and Brougham to Chisholm Trail; Havencroft, Heritage and west Tomahawk to Frontier Trail; Ridgeview to Santa Fe Trail (the map shows Santa Fe Trail; the summary slide says Oregon Trail).',
}
Z = gpd.read_file(f'{WORK}/zones_ms.gpkg'); S0 = gpd.read_parquet(f'{WORK}/schools.parquet')
IT = Z[Z.bldg.map(dict(zip(S0.bldg, S0.name))) == 'Indian Trail'].geometry.union_all()
concepts = []
for c in sorted(R['final']):
    lab = R['final'][c]; edits = []
    G = {n: faces.geometry.iloc[[i for i, l in enumerate(lab) if l == n and l != cur[i]]].buffer(2).union_all().buffer(-2)
         for n in sorted({l for i, l in enumerate(lab) if isinstance(l, str) and l != cur[i]})}
    # parts of Indian Trail's area no street block covers (road corridors, edges): give each to the neighbour it borders most
    rest = IT.difference(gpd.GeoSeries(list(G.values())).union_all())
    for part in getattr(rest, 'geoms', [rest]):
        if part.is_empty or part.geom_type != 'Polygon': continue
        best = max(G, key=lambda n: part.buffer(25).intersection(G[n]).area)
        if part.buffer(25).intersection(G[best]).area > 0: G[best] = G[best].union(part.buffer(1))
    for n in G:
        ids = [i for i, l in enumerate(lab) if l == n and l != cur[i]]
        g = G[n].simplify(12)
        g = gpd.GeoSeries([g], crs=faces.crs).to_crs(4326).iloc[0]
        gj = json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), 6))
        edits.append({'school': ms_i[n], 'to': n, 'faces': ids, 'geom': gj})
    concepts.append({'id': c, 'summary': SUMMARY[c], 'table': T[c], 'edits': edits})
    print(c, [(e['to'], len(e['faces'])) for e in edits])
cb = json.load(open(f'{OUT}/combos.json'))
cb['ms'] = {'cap': CAP, 'firstYear': '2026-27', 'concepts': concepts,
            'source': 'Middle School Boundary Adjustments deck (Nov 2026): concept maps read onto street blocks; tables from the five-year estimate slides.'}
json.dump(cb, open(f'{OUT}/combos.json', 'w'), separators=(',', ':'))
print('combos.json', os.path.getsize(f'{OUT}/combos.json') // 1024, 'KB')
