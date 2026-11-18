"""Where the district's section-line roads cross, in state plane feet. These are the control points for georeferencing:
they're easy to find on every map, and they're spread on a one-mile grid across the area being read."""
import json

import geopandas as gpd
import numpy as np
from shapely.ops import unary_union

from boundary_lab.settings import work_file

NORTH_SOUTH_ROADS = {'LoneElm': r'Lone Elm Road$', 'Ridgeview': r'Ridgeview Road$', 'MurLen': r'Mur-?Len|Renner',
                     'BlackBob': r'Black Bob|Lackman', 'Pflumm': r'Pflumm', 'Quivira': r'Quivira'}
EAST_WEST_ROADS = {'119': r'(?:^|\s)(?:W |West )?119th St', '127': r'(?:^|\s)(?:W |West )?127th St', '135': r'(?:^|\s)(?:W |West )?135th St|Santa Fe',
                   '143': r'(?:^|\s)(?:W |West )?143rd St', '151': r'(?:^|\s)(?:W |West )?151st St', '159': r'(?:^|\s)(?:W |West )?159th St'}
SKIP = {'Pflumm&135'}   # Pflumm jogs at Santa Fe, so the crossing isn't a clean point on the maps


def road_crossings() -> dict[str, tuple[float, float]]:
    """{'MurLen&151': (x, y), ...}: the middle of where each north-south road meets each east-west road."""
    edges = gpd.read_parquet(work_file('street_edges.parquet'))
    road = {key: unary_union(edges[edges.name.fillna('').str.contains(pattern, regex=True)].geometry.values)
            for key, pattern in {**NORTH_SOUTH_ROADS, **EAST_WEST_ROADS}.items()}
    crossings = {}
    for north_south in NORTH_SOUTH_ROADS:
        for east_west in EAST_WEST_ROADS:
            name = f'{north_south}&{east_west}'
            meeting = road[north_south].intersection(road[east_west])
            points = [meeting] if meeting.geom_type == 'Point' else list(getattr(meeting, 'geoms', []))
            if name in SKIP or meeting.is_empty or not points:
                continue
            crossings[name] = tuple(np.mean([[point.x, point.y] for point in points], axis=0))
    return crossings


if __name__ == '__main__':
    print(json.dumps({name: [round(x), round(y)] for name, (x, y) in road_crossings().items()}, indent=1))
