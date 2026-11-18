"""Read the district's five middle school boundary concepts (Nov 2026 MS deck) onto street blocks.
Each concept map colors the full new area of every middle school that changes; uncolored land keeps today's middle school."""
import sys, json, pickle, numpy as np, geopandas as gpd
from PIL import Image
from shapely.geometry import Point
sys.path.insert(0, '/home/claude/boundary/pipeline/tools/board_reader')
from homog import fit, apply, refine, X
W = '/home/claude/boundary/pipeline/work'
D = '/tmp/claude-0/-home-claude/7cfcc73c-d82a-5783-9f98-8f5dacf4d733/scratchpad/ms/'
# rough intersections read off a 1400-px-wide copy (x, y), scale s = 1400 / image width
C = {
 1: dict(img='img8-002.jpg', s=0.5409582689335394, x={'Ridgeview': 365, 'MurLen': 478, 'BlackBob': 590, 'Pflumm': 705, 'Quivira': 822, 'LoneElm': 135},
         y={'119': 290, '127': 403, '135': 518, '143': 630, '151': 745, '159': 858},
         leg=(1050, {'California Trail': 440, 'Chisholm Trail': 481, 'Frontier Trail': 522, 'Pioneer Trail': 563, 'Santa Fe Trail': 646})),
 2: dict(img='img12-002.jpg', s=0.4579653254824992, x={'Ridgeview': 565, 'MurLen': 655, 'BlackBob': 757, 'Pflumm': 855, 'Quivira': 950, 'LoneElm': 368},
         y={'119': 203, '127': 300, '135': 398, '143': 487, '151': 590, '159': 688},
         leg=(1145, {'California Trail': 332, 'Chisholm Trail': 367, 'Frontier Trail': 402, 'Pioneer Trail': 437, 'Oregon Trail': 507})),
 3: dict(img='img18-002.jpg', s=0.4657351962741184, x={'Ridgeview': 510, 'MurLen': 602, 'BlackBob': 700, 'Pflumm': 800, 'Quivira': 903, 'LoneElm': 308},
         y={'119': 226, '127': 325, '135': 425, '143': 520, '151': 620, '159': 718},
         leg=(1100, {'California Trail': 356, 'Chisholm Trail': 392, 'Frontier Trail': 427, 'Pioneer Trail': 463, 'Oregon Trail': 534})),
 4: dict(img='img24-002.jpg', s=0.5190952910641453, x={'Ridgeview': 455, 'MurLen': 567, 'BlackBob': 675, 'Pflumm': 787, 'Quivira': 893, 'LoneElm': 238},
         y={'119': 293, '127': 402, '135': 512, '143': 622, '151': 733, '159': 843},
         leg=(1108, {'California Trail': 491, 'Chisholm Trail': 520, 'Frontier Trail': 550, 'Pioneer Trail': 580, 'Santa Fe Trail': 640})),
 5: dict(img='img31-002.jpg', s=0.42424242424242425, x={'Ridgeview': 593, 'MurLen': 678, 'BlackBob': 766, 'Pflumm': 857, 'Quivira': 948, 'LoneElm': 410},
         y={'119': 465, '127': 557, '135': 648, '143': 738, '151': 828, '159': 918},
         leg=(1122, {'California Trail': 598, 'Chisholm Trail': 624, 'Frontier Trail': 649, 'Pioneer Trail': 675, 'Santa Fe Trail': 700})),
}

def georef(path, rough, tol=160):
    a = Image.open(path); w, h = a.size
    keys = [k for k in rough if k in X]
    src = np.array([rough[k] for k in keys]); dst = np.array([X[k] for k in keys]); m = dst.mean(0)
    Hinv = fit(dst - m, src)
    pred = {k: tuple(apply(Hinv, [np.array(X[k]) - m])[0]) for k in X}
    pred = {k: v for k, v in pred.items() if 40 < v[0] < w - 40 and 40 < v[1] < h - 40}
    use = refine(path, pred, 30)
    for _ in range(12):
        ks = list(use); s_ = np.array([use[k] for k in ks]); d = np.array([X[k] for k in ks])
        H = fit(s_, d - m); res = np.hypot(*(apply(H, s_) + m - d).T); worst = np.argmax(res)
        if res[worst] < tol: break
        del use[ks[worst]]
    print(f'  georef {len(use)}/{len(pred)} pts, residual median {np.median(res):.0f} ft, max {res.max():.0f} ft')
    return H, m

faces = gpd.read_parquet(f'{W}/faces.parquet')
Z = gpd.read_file(f'{W}/zones_ms.gpkg')
S = gpd.read_parquet(f'{W}/schools.parquet'); MSN = dict(zip(S[S.level == 'ms'].index if 'i' not in S else S[S.level == 'ms'].i, S[S.level == 'ms'].name))
print(Z.columns.tolist(), faces.columns.tolist(), len(faces))

name_of = dict(zip(S.bldg, S.name))
Z['name'] = Z.bldg.map(name_of)
# current middle school of each street block (largest overlap)
inter = gpd.overlay(faces.reset_index().rename(columns={'index': 'fid'}), Z[['name', 'geometry']], how='intersection', keep_geom_type=True)
inter['a'] = inter.area
cur = inter.sort_values('a').groupby('fid').name.last().reindex(range(len(faces)))
rng = np.random.default_rng(0)
def sample_pts(g, n=9):
    pts = [g.representative_point()]
    x0, y0, x1, y1 = g.bounds; tries = 0
    while len(pts) < n and tries < 200:
        p = Point(rng.uniform(x0, x1), rng.uniform(y0, y1)); tries += 1
        if g.buffer(-60).contains(p): pts.append(p)
    return pts
PTS = [sample_pts(g) for g in faces.geometry]

out = {}
for c, cfg in C.items():
    print(f'MS concept {c}')
    path = D + cfg['img']; a = np.asarray(Image.open(path).convert('RGB')).astype(float); h, w, _ = a.shape; s = cfg['s']
    rough = {f'{xn}&{yn}': (xv / s, yv / s) for xn, xv in cfg['x'].items() for yn, yv in cfg['y'].items() if f'{xn}&{yn}' in X}
    H, m = georef(path, rough)
    Hi = np.linalg.inv(H)
    lx, legs = cfg['leg']
    pal = {}
    for n, ly in legs.items():
        x, y = int((lx + 15) / s), int(ly / s); pal[n] = np.median(a[y - 6:y + 7, x - 6:x + 7].reshape(-1, 3), axis=0)
    names = list(pal); P = np.array([pal[n] for n in names])
    print('  palette', {n: tuple(int(v) for v in pal[n]) for n in names})
    new = []
    for i, pts in enumerate(PTS):
        xy = apply(Hi, np.array([[p.x, p.y] for p in pts]) - m)
        votes = {}
        for x, y in xy:
            if not (8 < x < w - 8 and 8 < y < h - 8): continue
            px = a[int(y) - 3:int(y) + 4, int(x) - 3:int(x) + 4].reshape(-1, 3)
            col = np.median(px, axis=0)
            d = np.hypot.reduce(P - col, axis=1) if hasattr(np.hypot, 'reduce') else np.sqrt(((P - col) ** 2).sum(1))
            k = int(np.argmin(d))
            if d[k] < 60: votes[names[k]] = votes.get(names[k], 0) + 1
            else: votes[None] = votes.get(None, 0) + 1
        best = max(votes, key=votes.get) if votes else None
        colored = sum(v for k, v in votes.items() if k)
        new.append(best if best and colored >= max(2, 0.4 * sum(votes.values())) else None)
    new = np.array(new, dtype=object)
    out[c] = new
    print('  colored blocks:', {n: int((new == n).sum()) for n in names}, 'uncolored', int((new == None).sum()))
pickle.dump({'cur': cur.values, 'new': out}, open(f'{W}/ms_concepts_raw.pkl', 'wb'))
