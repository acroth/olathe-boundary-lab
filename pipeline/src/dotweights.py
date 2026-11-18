"""Where closing-school students live, from the district's student-dot maps (parent-meeting decks, Nov 2026).
Dots are read by tools/dot_reader into work/dots/U_dots.parquet: street blocks of the closing schools with a dot count each.
Each closing school's elementary weight is redistributed so every street block holds its share of the school's dots.
The school's total weight is unchanged, so its projected totals (and factors) stay the same; within a block, homes keep
their census proportions. Dots in a block with no homes go to the nearest block with homes in the same school."""
import numpy as np, geopandas as gpd
from common import WORK
CLOSING = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove']

def apply(H, name_of):
    U = gpd.read_parquet(f"{WORK}/dots/U_dots.parquet")
    U = U[U.name.isin(CLOSING)].copy()
    j = gpd.sjoin(H[['geometry']], U[['geometry']], predicate='within'); j = j[~j.index.duplicated()]
    unit = j.index_right.reindex(H.index)
    w = H.w_es.values.copy(); orig = H.orig_es.map(name_of).values
    for n in CLOSING:
        hs = np.where(orig == n)[0]
        if not len(hs): continue
        total = w[hs].sum()
        u_of = unit.values[hs]; inu = ~np.isnan(u_of)
        keep = w[hs][~inu].sum()                         # homes outside the read blocks keep their weight
        Un = U[U.name == n]; d = Un.dots.copy()
        has = set(u_of[inu].astype(int))
        cen = {}                                          # move dots in blocks without homes to the nearest block with homes
        for k in d.index:
            if k in has or d[k] == 0: continue
            g = Un.geometry[k]; tgt = min(has, key=lambda h: U.geometry[h].distance(g))
            d[tgt] += d[k]; d[k] = 0
        share = d / d.sum()
        avail = total - keep
        for k in has:
            idx = hs[inu][u_of[inu].astype(int) == k]
            cw = w[idx]; s = cw.sum()
            w[idx] = share.get(k, 0) * avail * (cw / s if s > 0 else np.full(len(idx), 1 / len(idx)))
        print(f'  dots: {n} weight {total:.1f} kept, {len(has)} blocks')
    H['w_es'] = w
    return H
