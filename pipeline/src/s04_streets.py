"""Street network from Overture (OpenStreetMap) segments, split at connectors.
Outputs: work/street_nodes.parquet, work/street_edges.parquet (u, v, len_ft, cls, name, geometry),
work/faces.parquet (street-bounded polygons inside the district), road distances home->school for checks."""
import geopandas as gpd, pandas as pd, numpy as np, os, sys
from shapely.geometry import LineString, Point
from shapely.ops import substring, polygonize, unary_union
import networkx as nx
sys.path.insert(0, os.path.dirname(__file__))
from common import RAW, WORK, CRS

D = gpd.read_file(f"{WORK}/district.gpkg").geometry.union_all()
REACH = D.buffer(5280 * 1.5)
seg = gpd.read_parquet(f"{RAW}/overture_segment.parquet")
seg = seg[seg.subtype == 'road'].to_crs(CRS)
seg = seg[seg.intersects(REACH)]
CLS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']
seg = seg[seg['class'].isin(CLS)]
RANK = {c: i for i, c in enumerate(CLS)}

nodes = {}
def nid(cid, pt):
    if cid not in nodes: nodes[cid] = (len(nodes), pt.x, pt.y)
    return nodes[cid][0]

E = []
for _, r in seg.iterrows():
    g = r.geometry; L = g.length
    con = sorted([(c['at'], c['connector_id']) for c in (r.connectors if r.connectors is not None else [])])
    if len(con) < 2: continue
    nm = r.names.get('primary') if isinstance(r.names, dict) else None
    for (a0, c0), (a1, c1) in zip(con[:-1], con[1:]):
        if a1 <= a0: continue
        part = substring(g, a0 * L, a1 * L)
        if part.length < 1: continue
        u = nid(c0, Point(part.coords[0])); v = nid(c1, Point(part.coords[-1]))
        E.append((u, v, part.length, RANK[r['class']], nm, part))
E = gpd.GeoDataFrame(pd.DataFrame(E, columns=['u', 'v', 'len_ft', 'cls', 'name', 'geometry']), geometry='geometry', crs=CRS)
N = pd.DataFrame(sorted(nodes.values()), columns=['i', 'x', 'y']).set_index('i')
# keep largest connected component
G = nx.Graph(); G.add_weighted_edges_from(zip(E.u, E.v, E.len_ft))
cc = max(nx.connected_components(G), key=len)
E = E[E.u.isin(cc) & E.v.isin(cc)].reset_index(drop=True)
keep = sorted(cc); remap = {o: i for i, o in enumerate(keep)}
N = N.loc[keep].reset_index(drop=True)
E['u'] = E.u.map(remap); E['v'] = E.v.map(remap)
print('nodes', len(N), 'edges', len(E), 'miles', round(E.len_ft.sum() / 5280))
gpd.GeoDataFrame(N, geometry=gpd.points_from_xy(N.x, N.y), crs=CRS).to_parquet(f"{WORK}/street_nodes.parquet")
E.to_parquet(f"{WORK}/street_edges.parquet")

# ---------- street faces: polygons bounded by public streets (no service drives) and the district edge
pub = E[E.cls < RANK['service']]
lines = list(pub.geometry.intersection(D.buffer(10))) + [D.boundary]
F = gpd.GeoDataFrame(geometry=list(polygonize(unary_union([l for l in lines if not l.is_empty]))), crs=CRS)
F = F[F.geometry.representative_point().within(D)]
F['geometry'] = F.geometry.intersection(D)
F = F[F.area > 2000].reset_index(drop=True)
print('faces', len(F), 'median acres', round(F.area.median() / 43560, 1))
F.to_parquet(f"{WORK}/faces.parquet")
