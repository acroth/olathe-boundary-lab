"""District proposals 1-3 from the Nov 9-10 2026 boundary-meeting boards, as fixed block assignments plus swaps between open schools.
Pairings (each proposal = one concept per closing school):
  proposal 1 (hc1) = Heritage C1 + Scarborough C1 + Black Bob C1 + Tomahawk C1 + Walnut Grove C1
  proposal 2 (hc2) = Heritage C2 + Scarborough C2 + Black Bob C2 + Tomahawk C2 + Walnut Grove C2
  proposal 3 (hc3) = Heritage C3 + Scarborough C2 + Black Bob C3 + Tomahawk C3 + Walnut Grove C3 (board legend says 'Concept 4')
Lines read off the board photos, in miles east (dx) / north (dy) of Mur-Len & 151st:
  Mur-Len dx 0, Black Bob Rd dx 1, 151st dy 0, 143rd dy 1, 135th / Santa Fe dy 2.
Writes work/fix_<p>.json (unit -> school index, for s09_optimize.py FIX=...) and work/swaps_<p>.json (open-school area moves, for s10)."""
import pickle, json, os, sys, geopandas as gpd
from shapely.geometry import Polygon, box
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT
D = pickle.load(open(f"{WORK}/units_any.pkl", 'rb'))['es']; U = D['U']
SCH = {s['name']: s['i'] for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level'] == 'es'}
X0, Y0, M = 2229262.4, 206245.6, 5280   # Mur-Len & 151st, EPSG:3419 ft
def poly(pts): return Polygon([(X0 + x * M, Y0 + y * M) for x, y in pts])
def bx(x0, y0, x1, y1): return box(X0 + x0 * M, Y0 + y0 * M, X0 + x1 * M, Y0 + y1 * M)
P = gpd.read_file(f"{WORK}/heritage_pieces.gpkg").set_index('piece')
rp = U.geometry.representative_point()
dxy = {k: ((rp[k].x - X0) / M, (rp[k].y - Y0) / M) for k in range(len(U))}
SIDE = {int(k): v for k, v in json.load(open(f"{WORK}/scarb_side.json")).items()}   # Scarborough blocks by side of Indian Creek
piece = {k: next((n for n, g in P.geometry.items() if g.contains(rp[k])), None) for k in range(len(U)) if U.closing[k] == 'Heritage'}

HERITAGE = {'hc1': {'West': 'Madison Place', 'Middle': 'Madison Place', 'East': 'Brougham'},
            'hc2': {'West': 'Madison Place', 'Middle': 'Havencroft', 'East': 'Sunnyside'},
            'hc3': {'West': 'Havencroft', 'Middle': 'Havencroft', 'East': 'Sunnyside'}}
# Black Bob pieces going to Brougham (southwest corner); the rest goes to Green Springs unless listed
BB_BROUGHAM = {'hc1': poly([(-.1, -.1), (-.1, .375), (.26, .17), (.26, -.1)]),                                  # BB C1
               'hc2': poly([(-.1, -.1), (-.1, .495), (.24, .495), (.26, .575), (.50, .33), (.505, .30), (.505, -.1)]),  # BB C2
               'hc3': poly([(-.1, -.1), (-.1, .50), (.22, .50), (.32, .25), (.51, .24), (.51, -.1)])}             # BB C3
BB_BRIARWOOD = {'hc1': poly([(-.1, .65), (.27, .70), (.27, 1.1), (-.1, 1.1)])}                                    # BB C1: northwest corner
TH_WEST = {'hc1': 'Havencroft', 'hc2': 'Briarwood', 'hc3': 'Indian Creek'}                                      # Tomahawk west of Mur-Len
# open school -> open school moves shown on the boards: (from, to, area as dx/dy box; applied to `from`'s current zone)
# (street blocks of `from`'s current zone whose centre is in the dx/dy box; Black Bob Rd is at dx ~0.97-0.99, 143rd at dy ~1.0)
PA = gpd.read_file(f"{OUT}/planning_areas.geojson").to_crs(U.crs); PA['pa'] = PA.pa.astype(str)
PA630 = PA[PA.pa == '630'].geometry.iloc[0]   # Briarwood east of Black Bob Rd: uncoloured on every Tomahawk board -> Regency Place
SWAPS = {'hc1': [('Briarwood', 'Regency Place', PA630)],
         'hc2': [('Briarwood', 'Regency Place', PA630),
                 ('Briarwood', 'Green Springs', (0, 0, .96, 1)),        # BB C2: Briarwood south of 143rd to Green Springs
                 ('Green Springs', 'Brougham', (.45, -.05, .96, .35))],  # BB C2: Green Springs west of Black Bob Rd (by 151st) to Brougham
         'hc3': [('Briarwood', 'Regency Place', PA630),
                 ('Briarwood', 'Green Springs', (0, 0, .96, 1)),        # BB C3
                 ('Green Springs', 'Briarwood', (1.0, 1.0, 1.6, 1.7))]}  # TH C3: Green Springs north of 143rd (east of Black Bob Rd) to Briarwood
import numpy as np
E = gpd.read_parquet(f"{WORK}/street_edges.parquet"); ml = E[E.name.fillna('').str.contains('Mur-?Len', regex=True)]
mlc = np.vstack([np.array(g.coords) for g in ml.geometry]); mlc = mlc[np.argsort(mlc[:, 1])]
def murlen_dx(y_ft): return (np.interp(y_ft, mlc[:, 1], mlc[:, 0]) - X0) / M          # Mur-Len's position at that latitude
FACES = gpd.read_parquet(f"{WORK}/faces.parquet")[['geometry']]
ZN = gpd.read_file(f"{WORK}/zones_es.gpkg"); SID = {s['name']: s['id'] for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level'] == 'es'}
def swap_geom(frm, b):
    z = gpd.overlay(FACES, ZN[ZN.school == SID[frm]][['geometry']], keep_geom_type=True)
    z = z[z.area > 200]; r = z.geometry.representative_point()
    area = bx(*b) if isinstance(b, tuple) else b
    return z[r.within(area)].geometry.union_all()

# Walnut Grove (boards photographed Nov 12): miles east (wx) / north (wy) of Pflumm & 119th
WX, WY = 2239104.7, 227757.9
def wg_to(c, k):
    x, y = (rp[k].x - WX) / M, (rp[k].y - WY) / M
    if y < 0: return 'Countryside' if c == 'hc3' else 'Heatherstone'       # piece south of 119th
    if c == 'hc3' and ((y > .71 and x < -.46) or (.47 < y <= .71 and x < -.67) or (y <= .47 and x < -.43)):
        return 'Countryside'                                                 # WG C3: band along I-35
    if x < 0: return 'Heatherstone'                                          # west of Pflumm
    if c != 'hc1' and ((y > 1.28 and x < .92) or (1.0 < y <= 1.28 and x < .67) or (.5 < y <= 1.0 and x < .25)):
        return 'Heatherstone'                                                # WG C2/C3: north of College Blvd east of Pflumm, and a strip along Pflumm
    return 'Pleasant Ridge'

for c in ['hc1', 'hc2', 'hc3']:
    fix = {}
    for k in range(len(U)):
        cl = U.closing[k]; x, y = dxy[k]
        if cl == 'Heritage':
            p = piece[k] if piece[k] is not None else P.distance(rp[k]).idxmin()
            fix[k] = SCH[HERITAGE[c][p]]
        elif cl == 'Scarborough':   # SC C1: all to Sunnyside; SC C2: west of Indian Creek to Madison Place, east to Sunnyside
            fix[k] = SCH['Madison Place'] if c != 'hc1' and SIDE[k] == 'West' else SCH['Sunnyside']
        elif cl == 'Black Bob':
            if BB_BROUGHAM[c].contains(rp[k]): fix[k] = SCH['Brougham']
            elif c in BB_BRIARWOOD and BB_BRIARWOOD[c].contains(rp[k]): fix[k] = SCH['Briarwood']
            else: fix[k] = SCH['Green Springs']
        elif cl == 'Walnut Grove':
            fix[k] = SCH[wg_to(c, k)]
        elif cl == 'Tomahawk':
            # west of Mur-Len varies; Mur-Len to Black Bob Rd to Briarwood in all three; east of Black Bob Rd (planning area 625,
            # not coloured on any board) to Regency Place
            fix[k] = SCH[TH_WEST[c]] if x < murlen_dx(rp[k].y) else SCH['Regency Place'] if PA[PA.pa == '625'].geometry.iloc[0].contains(rp[k]) or x > .94 else SCH['Briarwood']
    json.dump(fix, open(f"{WORK}/fix_{c}.json", 'w'))
    sw = gpd.GeoDataFrame([dict(frm=f, to=t) for f, t, b in SWAPS[c]], geometry=[swap_geom(f, b) for f, t, b in SWAPS[c]], crs=U.crs) if SWAPS[c] else gpd.GeoDataFrame(dict(frm=[], to=[]), geometry=[], crs=U.crs)
    sw.to_file(f"{WORK}/swaps_{c}.gpkg")
    stu = D['stu']
    by = {}
    for k, s in fix.items():
        key = (U.closing[k], [n for n, i in SCH.items() if i == s][0]); by[key] = by.get(key, 0) + stu[k][1]
    print(c, {f'{a}->{b}': round(v) for (a, b), v in sorted(by.items())})
