"""Assign closing-school street blocks to the district's listed receivers.
Hard rules: every receiver at or below CAP utilization in every year 2027-28..2034-35 (Pre-K counted at the building),
no home more than MAXMI road miles from its new school, each receiver's added blocks connected to its current area (no islands).
Objective: fewest student-miles, then shortest new boundary.
Usage: python s09_optimize.py CAP MAXMI closing1,closing2,...   -> work/opt_<tag>.gpkg"""
import pickle, json, sys, os, numpy as np, geopandas as gpd
from collections import deque
from ortools.sat.python import cp_model
sys.path.insert(0, os.path.dirname(__file__))
from common import WORK, OUT

CAP = float(sys.argv[1]); MAXMI = float(sys.argv[2]); CLOSE = sys.argv[3].split(','); LV = sys.argv[4] if len(sys.argv) > 4 else 'es'
LAM = float(os.environ.get('LAM', '0.004'))   # student-miles per foot of new boundary
DON = [d for d in os.environ.get('DONORS', '').split(',') if d]
D = pickle.load(open(f"{WORK}/units{'_d' if DON else ''}{'_any' if (os.environ.get('ANY_RING') or os.environ.get('UNITS_ANY')) else ''}.pkl", 'rb'))[LV]
FIX = {int(k): v for k, v in json.load(open(os.environ['FIX'])).items()} if os.environ.get('FIX') else {}   # unit -> school index, given
CLOSE = CLOSE + DON
SCH = json.load(open(f"{OUT}/schools.json"))['schools']; REC = json.load(open(f"{OUT}/presets.json"))['receivers']
RING = ['Arbor Creek', 'Briarwood', 'Brougham', 'Green Springs', 'Havencroft', 'Indian Creek', 'Madison Place', 'Sunnyside', 'Regency Place', 'Bentwood']
if os.environ.get('ANY_RING'):   # let southeast closures go to any open southeast school, not just the listed receivers
    _es = {s['name']: s['i'] for s in json.load(open(f"{OUT}/schools.json"))['schools'] if s['level'] == 'es'}
    for c in ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk']: REC[str(_es[c])] = [_es[r] for r in RING]
byn = {(s['level'], s['name']): s for s in SCH}
U = D['U']; stu = D['stu']; mm = D['maxmi']; nb = D['nb']
K = [k for k in range(len(U)) if U.closing[k] in CLOSE]
Ks = set(K)
allowed = {}
for k in K:
    c = U.closing[k]
    rec = REC[str(byn[(LV, c)]['i'])] if c not in DON else [byn[(LV, c)]['i']] + D['donors'][c]
    allowed[k] = [r for r in rec if mm[(k, r)] <= MAXMI + 1e-9 or (c in DON and r == byn[(LV, c)]['i'])]
    if not allowed[k] and stu[k].max() < 0.05:               # empty block: any listed receiver
        allowed[k] = rec
    if k in FIX: allowed[k] = [FIX[k]]
# hop distance from each receiver's current area through blocks it may take
hop = {}
for r in {r for k in K for r in allowed[k]}:
    h = {k: 0 for k in D['touch'][r] if k in Ks and r in allowed[k]}
    q = deque(h)
    while q:
        k = q.popleft()
        for m in nb[k]:
            if m in Ks and m not in h and r in allowed[m]: h[m] = h[k] + 1; q.append(m)
    hop[r] = h
for k in K:
    if k not in FIX: allowed[k] = [r for r in allowed[k] if k in hop[r]]
stuck = [k for k in K if not allowed[k]]
if stuck: print('blocks with no allowed receiver:', len(stuck), 'students', round(sum(stu[k][2] for k in stuck)))

m = cp_model.CpModel(); x = {}
for k in K:
    for r in allowed[k]: x[k, r] = m.NewBoolVar('')
    if allowed[k]: m.AddExactlyOne(x[k, r] for r in allowed[k])
recs = sorted({r for k in K for r in allowed[k]})
MINIMAX = bool(os.environ.get('MINIMAX')); PEAK = m.NewIntVar(0, 3000, 'peak')
SOFTCAP = float(os.environ.get('SOFTCAP', '0')); PENCAP = float(os.environ.get('PENCAP', '20')); overflow = []
for r in recs:
    s = SCH[r]; fixed = s['prek'] + s['immersion'] if LV == 'es' else 0
    for y in range(2, 10):
        own = s['neighborhood'][y] - (sum(stu[k][y] for k in K if U.closing[k] == s['name']) if s['name'] in DON else 0)
        room = CAP * s['capacity'] - own - fixed
        load = sum(int(round(stu[k][y] * 10)) * x[k, r] for k in K if (k, r) in x)
        m.Add(load <= int(room * 10))
        if MINIMAX:   # peak utilization in permille
            m.Add(load * 1000 <= PEAK * int(s['capacity'] * 10) - int((own + fixed) * 10) * 1000)
        if SOFTCAP:   # students above the preferred cap cost PENCAP each (peak year counts most)
            sl = m.NewIntVar(0, 100000, '')
            m.Add(sl >= load - int((SOFTCAP * s['capacity'] - own - fixed) * 10))
            overflow.append(sl)
    for k, h in hop[r].items():
        if h > 0 and (k, r) in x and k not in FIX:
            m.Add(x[k, r] <= sum(x[j, r] for j in nb[k] if (j, r) in x and hop[r].get(j, 99) < h))
cost = []
SOFT = float(os.environ.get('SOFT', '0'))   # preferred limit; students in blocks beyond it cost PEN each
PEN = float(os.environ.get('PEN', '50'))
for (k, r), v in x.items():
    cost.append(int(round(stu[k][2] * mm[(k, r)] * 100)) * v)
    if SOFT and mm[(k, r)] > SOFT: cost.append(int(round(stu[k][2] * PEN * 100)) * v)
for (a, b), L in D['shared'].items():
    if a in Ks and b in Ks:
        z = m.NewBoolVar('')
        for r in recs:
            if (a, r) in x or (b, r) in x:
                m.Add(z >= (x[a, r] if (a, r) in x else 0) - (x[b, r] if (b, r) in x else 0))
        cost.append(int(round(LAM * L * 100)) * z)
m.Minimize(sum(cost) + sum(int(PENCAP * 10) * v for v in overflow) + (PEAK * 100000 if MINIMAX else 0))
sol = cp_model.CpSolver(); sol.parameters.max_time_in_seconds = float(os.environ.get('TL', '120')); sol.parameters.num_workers = 8
st = sol.Solve(m)
print('status', sol.StatusName(st))
if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE): sys.exit(1)
U2 = U.loc[K].copy(); U2['to'] = [next((SCH[r]['name'] for r in allowed[k] if sol.Value(x[k, r])), None) for k in K]
for r in recs:
    s = SCH[r]; fixed = s['prek'] + s['immersion'] if LV == 'es' else 0
    add = [sum(stu[k][y] for k in K if (k, r) in x and sol.Value(x[k, r])) for y in range(10)]
    util = [(s['neighborhood'][y] + fixed + add[y]) / s['capacity'] for y in range(2, 10)]
    print(f"  {s['name']}: +{add[2]:.0f} students, peak {max(util):.1%}")
tw = sum(stu[k][2] for k in K if U2.to[k]); print('avg max-home miles (student-weighted)', round(sum(stu[k][2] * mm[(k, r)] for (k, r), v in x.items() if sol.Value(v)) / tw, 2))
over = sum(stu[k][2] for (k, r), v in x.items() if sol.Value(v) and mm[(k, r)] > 2.0)
print('students in blocks with a home beyond 2 mi:', round(over), '| farthest home', round(max(mm[(k, r)] for (k, r), v in x.items() if sol.Value(v)), 2), 'mi')
tag = os.environ.get('TAG', 'opt')
U2.to_file(f"{WORK}/opt_{tag}.gpkg")
