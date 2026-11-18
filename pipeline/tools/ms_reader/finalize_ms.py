import pickle, numpy as np, geopandas as gpd, json
from collections import Counter
W = '/home/claude/boundary/pipeline/work'
R = pickle.load(open(f'{W}/ms_concepts_raw.pkl', 'rb')); cur = R['cur']
faces = gpd.read_parquet(f'{W}/faces.parquet')
# neighbours: blocks that share an edge (touch with length) – via a small buffer
sidx = faces.sindex; nb = [[] for _ in range(len(faces))]
B = faces.geometry.buffer(40)
for i, g in enumerate(B):
    for j in sidx.query(g, predicate='intersects'):
        if j != i: nb[i].append(int(j))
area = faces.area.values
F = {}
for c, new in R['new'].items():
    colored = {n for n in new if n}
    lab = np.array([new[i] if new[i] else (cur[i] if isinstance(cur[i], str) else None) for i in range(len(new))], dtype=object)
    # uncolored blocks of a changing/closing school can't stay there: take the neighbours' answer
    bad = lambda i: (not new[i]) and isinstance(cur[i], str) and (cur[i] in colored or cur[i] == 'Indian Trail')
    for _ in range(8):
        ch = 0
        for i in range(len(lab)):
            if bad(i) and lab[i] in (cur[i],) :
                v = Counter(lab[j] for j in nb[i] if lab[j] and not bad(j) or (new[j]))
                v.pop(None, None)
                if v: lab[i] = v.most_common(1)[0][0]; ch += 1
        if not ch: break
    # lone specks: a block unlike every neighbour, under 15 acres -> neighbours' majority
    for _ in range(3):
        for i in range(len(lab)):
            if not isinstance(cur[i], str) or area[i] > 15 * 43560: continue
            v = Counter(lab[j] for j in nb[i] if isinstance(cur[j], str))
            if v and lab[i] not in v: lab[i] = v.most_common(1)[0][0]
    F[c] = lab
    moves = Counter((cur[i], lab[i]) for i in range(len(lab)) if isinstance(cur[i], str) and lab[i] != cur[i])
    left = sum(1 for i in range(len(lab)) if lab[i] == 'Indian Trail')
    print(f'Concept {c}: Indian Trail blocks left {left}')
    for (a, b), n in sorted(moves.items(), key=lambda x: -x[1]): print(f'   {a:16} -> {b:16} {n:4d} blocks')
pickle.dump({'cur': cur, 'final': F}, open(f'{W}/ms_concepts.pkl', 'wb'))
