"""Road distances from schools to homes, along the street network built in steps/streets.py."""
import geopandas as gpd
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from ..settings import FEET_PER_MILE, work_file


class RoadNetwork:
    """Shortest road trips from a school to every home. Each home connects to its nearest street node in a straight line."""

    def __init__(self, homes: gpd.GeoDataFrame):
        nodes = gpd.read_parquet(work_file('street_nodes.parquet'))
        edges = gpd.read_parquet(work_file('street_edges.parquet'))
        both_directions_from = np.r_[edges.u, edges.v]
        both_directions_to = np.r_[edges.v, edges.u]
        self.graph = csr_matrix((np.r_[edges.len_ft, edges.len_ft], (both_directions_from, both_directions_to)), shape=(len(nodes), len(nodes)))
        self.nearest_node = cKDTree(np.c_[nodes.x, nodes.y])
        self.home_feet_to_node, self.home_node = self.nearest_node.query(np.c_[homes.geometry.x, homes.geometry.y])
        self._feet_from_node: dict[int, np.ndarray] = {}

    def feet_from(self, node: int) -> np.ndarray:
        """Road feet from one node to every node (cached)."""
        if node not in self._feet_from_node:
            self._feet_from_node[node] = dijkstra(self.graph, indices=node)
        return self._feet_from_node[node]

    def node_near(self, x: float, y: float) -> int:
        return int(self.nearest_node.query([x, y])[1])

    def home_trip_miles(self, school_node: int, homes: np.ndarray) -> np.ndarray:
        """Road miles from the school to each of the given homes (row numbers)."""
        return (self.feet_from(school_node)[self.home_node[homes]] + self.home_feet_to_node[homes]) / FEET_PER_MILE

    def point_trip_miles(self, school_node: int, x: float, y: float) -> float:
        return float(self.feet_from(school_node)[self.node_near(x, y)] / FEET_PER_MILE)
