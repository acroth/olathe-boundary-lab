"""Step 4 - Streets: the road network for distances, and street blocks (areas bounded by public streets).

Reads   raw/overture_segment.parquet (Overture Maps transportation, from OpenStreetMap), work/district.gpkg
Writes  work/street_nodes.parquet  intersections and road ends (x, y in state plane feet)
        work/street_edges.parquet  road pieces between nodes: u, v (node numbers), len_ft, cls (road class rank), name
        work/faces.parquet         street blocks: polygons bounded by public streets and the district edge

Overture splits each road at "connectors" (intersections). Every piece between two connectors becomes an edge. Only the largest
connected network is kept, so every home can reach every school.
"""
import geopandas as gpd
import networkx as nx
import pandas as pd
from shapely.geometry import Point
from shapely.ops import polygonize, substring, unary_union

from ..geo import district_outline
from ..settings import FEET_PER_MILE, RAW_DIR, SQUARE_FEET_PER_ACRE, STATE_PLANE, work_file

# Road classes from busiest to quietest; an edge's `cls` is its position in this list
ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']
CLASS_RANK = {road_class: rank for rank, road_class in enumerate(ROAD_CLASSES)}
SERVICE_RANK = CLASS_RANK['service']   # driveways and parking aisles: used for distances, not for street blocks


class NodeNumbers:
    """Gives each Overture connector a node number the first time it's seen, remembering its position."""

    def __init__(self):
        self.by_connector: dict[str, tuple[int, float, float]] = {}

    def number(self, connector_id: str, position: Point) -> int:
        if connector_id not in self.by_connector:
            self.by_connector[connector_id] = (len(self.by_connector), position.x, position.y)
        return self.by_connector[connector_id][0]

    def table(self) -> pd.DataFrame:
        return pd.DataFrame(sorted(self.by_connector.values()), columns=['i', 'x', 'y']).set_index('i')


def read_road_segments(reach) -> gpd.GeoDataFrame:
    segments = gpd.read_parquet(RAW_DIR / 'overture_segment.parquet')
    segments = segments[segments.subtype == 'road'].to_crs(STATE_PLANE)
    segments = segments[segments.intersects(reach)]
    return segments[segments['class'].isin(ROAD_CLASSES)]


def split_segments_at_connectors(segments: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    """Cut every road at its connectors. Returns (edges, nodes)."""
    nodes = NodeNumbers()
    edges = []
    for segment in segments.itertuples():
        line, length = segment.geometry, segment.geometry.length
        connectors = sorted((connector['at'], connector['connector_id']) for connector in (segment.connectors if segment.connectors is not None else []))
        if len(connectors) < 2:
            continue
        name = segment.names.get('primary') if isinstance(segment.names, dict) else None
        for (start_at, start_id), (end_at, end_id) in zip(connectors[:-1], connectors[1:]):
            if end_at <= start_at:
                continue
            piece = substring(line, start_at * length, end_at * length)
            if piece.length < 1:
                continue
            start = nodes.number(start_id, Point(piece.coords[0]))
            end = nodes.number(end_id, Point(piece.coords[-1]))
            edges.append((start, end, piece.length, CLASS_RANK[segment.road_class], name, piece))
    edges = gpd.GeoDataFrame(pd.DataFrame(edges, columns=['u', 'v', 'len_ft', 'cls', 'name', 'geometry']), geometry='geometry', crs=STATE_PLANE)
    return edges, nodes.table()


def keep_largest_network(edges: gpd.GeoDataFrame, nodes: pd.DataFrame) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    """Drop road pieces not connected to the main network, and renumber nodes 0..n-1."""
    graph = nx.Graph()
    graph.add_weighted_edges_from(zip(edges.u, edges.v, edges.len_ft))
    main_network = max(nx.connected_components(graph), key=len)
    edges = edges[edges.u.isin(main_network) & edges.v.isin(main_network)].reset_index(drop=True)
    kept_nodes = sorted(main_network)
    new_number = {old: new for new, old in enumerate(kept_nodes)}
    nodes = nodes.loc[kept_nodes].reset_index(drop=True)
    edges['u'] = edges.u.map(new_number)
    edges['v'] = edges.v.map(new_number)
    return edges, nodes


def street_blocks(edges: gpd.GeoDataFrame, district_shape) -> gpd.GeoDataFrame:
    """Polygons bounded by public streets (no service drives) and the district edge, inside the district."""
    public_streets = edges[edges.cls < SERVICE_RANK]
    lines = list(public_streets.geometry.intersection(district_shape.buffer(10))) + [district_shape.boundary]
    blocks = gpd.GeoDataFrame(geometry=list(polygonize(unary_union([line for line in lines if not line.is_empty]))), crs=STATE_PLANE)
    blocks = blocks[blocks.geometry.representative_point().within(district_shape)]
    blocks['geometry'] = blocks.geometry.intersection(district_shape)
    return blocks[blocks.area > 2000].reset_index(drop=True)


def run() -> None:
    district_shape = district_outline()
    segments = read_road_segments(reach=district_shape.buffer(FEET_PER_MILE * 1.5))   # roads just outside count for trips too
    edges, nodes = split_segments_at_connectors(segments.rename(columns={'class': 'road_class'}))   # 'class' can't be an attribute name
    edges, nodes = keep_largest_network(edges, nodes)
    print(f'  {len(nodes)} nodes, {len(edges)} road pieces, {edges.len_ft.sum() / FEET_PER_MILE:.0f} miles')
    gpd.GeoDataFrame(nodes, geometry=gpd.points_from_xy(nodes.x, nodes.y), crs=STATE_PLANE).to_parquet(work_file('street_nodes.parquet'))
    edges.to_parquet(work_file('street_edges.parquet'))

    blocks = street_blocks(edges, district_shape)
    print(f'  {len(blocks)} street blocks, median {blocks.area.median() / SQUARE_FEET_PER_ACRE:.1f} acres')
    blocks.to_parquet(work_file('faces.parquet'))
