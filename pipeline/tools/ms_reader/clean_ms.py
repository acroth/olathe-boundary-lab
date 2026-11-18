"""Keep only moves the district's 'Summary of Changes' slides describe; everything from Indian Trail (closing) goes to a colored school."""
import pickle, numpy as np, geopandas as gpd
from collections import Counter
W = '/home/claude/boundary/pipeline/work'
R = pickle.load(open(f'{W}/ms_concepts.pkl', 'rb')); cur = R['cur']
faces = gpd.read_parquet(f'{W}/faces.parquet'); sidx = faces.sindex
nb = [[int(j) for j in sidx.query(g, predicate='intersects') if j != i] for i, g in enumerate(faces.geometry.buffer(40))]
CA, CH, FR, PI, SF, OR = 'California Trail', 'Chisholm Trail', 'Frontier Trail', 'Pioneer Trail', 'Santa Fe Trail', 'Oregon Trail'
# open-school moves the summaries describe, and where Indian Trail's area can go (the concept's colored schools)
ALLOW = {
  1: ({(PI, CA), (FR, CH), (FR, PI)}, {CA, CH, FR, PI, SF}),
  2: ({(CA, PI), (PI, CA), (FR, CA), (FR, CH)}, {CA, CH, FR, PI, OR}),
  3: ({(FR, CA), (FR, PI)}, {CA, CH, FR, PI, OR}),
  4: ({(CA, PI), (PI, CA), (FR, CA)}, {CA, CH, FR, PI, SF}),
  5: ({(FR, CH)}, {CH, FR, SF}),
}
OUT = {}
for c, lab in R['final'].items():
    pairs, dest = ALLOW[c]; lab = lab.copy()
    for i in range(len(lab)):
        a = cur[i]
        if not isinstance(a, str) or lab[i] == a: continue
        if a == 'Indian Trail': continue
        if (a, lab[i]) not in pairs: lab[i] = a
    for _ in range(20):
        ch = 0
        for i in range(len(lab)):
            if cur[i] == 'Indian Trail' and lab[i] not in dest:
                v = Counter(lab[j] for j in nb[i] if lab[j] in dest)
                if v: lab[i] = v.most_common(1)[0][0]; ch += 1
        if not ch: break
    OUT[c] = lab
    mv = Counter((cur[i], lab[i]) for i in range(len(lab)) if isinstance(cur[i], str) and lab[i] != cur[i])
    print(f'Concept {c}: IT left {sum(1 for x in lab if x == "Indian Trail")}  ' + ', '.join(f'{a.split()[0]}->{b.split()[0]} {n}' for (a, b), n in sorted(mv.items(), key=lambda x: -x[1])))
pickle.dump({'cur': cur, 'final': OUT}, open(f'{W}/ms_concepts_clean.pkl', 'wb'))
