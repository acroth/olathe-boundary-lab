"""Backtest: how well do 2010 Census ages predict where children lived in 2020? This sets BLEND_SAME_AGES in steps/students.py.

    python -m analysis.backtest_2010                 every neighborhood
    python -m analysis.backtest_2010 --established   only neighborhoods that didn't grow or shrink much from 2010 to 2020

Reads raw/jocok_2010_p12_blocks.json and raw/tl_2010_20091_tabblock10.zip (2010 Census), and work/blocks.parquet and
work/zones_{es,ms}.gpkg from the pipeline.

Two ways to say where a school's children will live ten years later, using only the earlier census:
  same ages         each place keeps its share of children of that age   (2010 ages 5-10 -> 2020 ages 5-10)
  followed forward  each place's younger children, ten years older      (2010 ages 0-4 -> 2020 ages 5-10 and 10-14)
The district is cut into square cells within each school's area. The score is the share of a school's 2020 children the
prediction puts in the wrong cells (half the sum of absolute share differences), averaged over schools by their children.
The best blend of the two is found by trying 0, 0.05, ..., 1.
"""
import argparse
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from boundary_lab.geo import district_outline, read_zones
from boundary_lab.settings import RAW_DIR, STATE_PLANE, work_file

AGE_COLUMNS = ['u5', 'a5_9', 'a10_14']
QUARTER_MILE, HALF_MILE = 1320, 2640


def blocks_2010() -> gpd.GeoDataFrame:
    raw = json.load(open(RAW_DIR / 'jocok_2010_p12_blocks.json'))
    ages = pd.DataFrame(raw[1:], columns=raw[0])
    ages['GEOID10'] = ages.state + ages.county + ages.tract + ages.block
    count = lambda column: pd.to_numeric(ages[column])
    ages['u5'] = count('P012003') + count('P012027')      # male + female
    ages['a5_9'] = count('P012004') + count('P012028')
    ages['a10_14'] = count('P012005') + count('P012029')
    shapes = gpd.read_file(f'zip://{RAW_DIR}/tl_2010_20091_tabblock10.zip').to_crs(STATE_PLANE)
    return shapes.merge(ages[['GEOID10'] + AGE_COLUMNS], on='GEOID10')


def as_points_inside(blocks: gpd.GeoDataFrame, district_shape) -> gpd.GeoDataFrame:
    points = gpd.GeoDataFrame(blocks.drop(columns='geometry'), geometry=blocks.geometry.representative_point(), crs=STATE_PLANE)
    return points[points.within(district_shape)]


def children_by_school_and_cell(points: gpd.GeoDataFrame, zones: gpd.GeoDataFrame, cell_ft: int, origin) -> pd.DataFrame:
    joined = gpd.sjoin(points, zones, predicate='within')
    column = np.floor((joined.geometry.x - origin[0]) / cell_ft).astype(int).astype(str)
    row = np.floor((joined.geometry.y - origin[1]) / cell_ft).astype(int).astype(str)
    joined['cell'] = column + '_' + row
    return joined.groupby(['school', 'cell'])[AGE_COLUMNS].sum()


def misplaced_share(predicted: pd.Series, actual: pd.Series, children_per_school: pd.Series) -> float:
    """Share of each school's actual children the prediction puts in the wrong cells, averaged over schools by children."""
    wrong = (predicted - actual).abs().groupby(level=0).sum() / 2
    return float((wrong * children_per_school).sum() / children_per_school.sum())


def score(level: str, cell_ft: int, established_only: bool, points_2010, points_2020, district_shape) -> str:
    zones = read_zones(level)[['school', 'geometry']]
    origin = district_shape.bounds[:2]
    table = pd.concat([children_by_school_and_cell(points_2010, zones, cell_ft, origin).add_suffix('_10'),
                       children_by_school_and_cell(points_2020, zones, cell_ft, origin).add_suffix('_20')], axis=1).fillna(0)
    if established_only:
        children_2010 = table[[f'{age}_10' for age in AGE_COLUMNS]].sum(axis=1)
        growth = table[[f'{age}_20' for age in AGE_COLUMNS]].sum(axis=1) / children_2010.clip(lower=1)
        table = table[(children_2010 >= 20) & (growth < 1.6) & (growth > 0.6)]

    if level == 'es':   # elementary: ages 5-10 (5-9 plus a fifth of 10-14)
        label, actual = 'ES ages 5-10', table.a5_9_20 + 0.2 * table.a10_14_20
        same_ages, aged_forward = table.a5_9_10 + 0.2 * table.a10_14_10, table.u5_10
    else:
        label, actual = 'Ages 10-14', table.a10_14_20
        same_ages, aged_forward = table.a10_14_10, table.u5_10

    share_within_school = lambda values: values / values.groupby(level=0).transform('sum').replace(0, np.nan)
    actual_share, children = share_within_school(actual), actual.groupby(level=0).sum()
    same_share, forward_share = share_within_school(same_ages), share_within_school(aged_forward)
    blends = {weight: misplaced_share(weight * same_share + (1 - weight) * forward_share, actual_share, children) for weight in np.linspace(0, 1, 21)}
    best_weight = min(blends, key=blends.get)
    return (f'{label}, {cell_ft} ft cells ({len(table)} school-cells): wrong cells - same ages {misplaced_share(same_share, actual_share, children):.1%}, '
            f'followed forward {misplaced_share(forward_share, actual_share, children):.1%}, best blend {best_weight:.2f} same ages -> {blends[best_weight]:.1%}')


def main() -> None:
    options = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    options.add_argument('--established', action='store_true', help='only neighborhoods without big growth or decline')
    established_only = options.parse_args().established

    district_shape = district_outline()
    points_2010 = as_points_inside(blocks_2010(), district_shape)
    points_2020 = as_points_inside(gpd.read_parquet(work_file('blocks.parquet')), district_shape)
    for year, points in (('2010', points_2010), ('2020', points_2020)):
        print(f'{year} children in the district, under 5 / 5-9 / 10-14:', ' / '.join(str(int(points[age].sum())) for age in AGE_COLUMNS))
    if established_only:
        print('established neighborhoods only (no big growth 2010-2020)')
    for cell_ft in (QUARTER_MILE, HALF_MILE):
        for level in ('es', 'ms'):
            print(score(level, cell_ft, established_only, points_2010, points_2020, district_shape))


if __name__ == '__main__':
    main()
