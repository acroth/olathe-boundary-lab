"""Step 2 - Homes: one point per residential building, with its number of housing units and expected children by level.

Reads
  raw/jocok_blocks.gpkg                2020 Census blocks (housing units)
  raw/jocok_dhc_p12_age_blocks.json    2020 Census DHC table P12: people by age, per block
  raw/census_age_gq_blocks.csv         group-quarters population per block (dorms, care homes)
  raw/overture_building.parquet        building footprints (Overture Maps)
  raw/overture_land_use.parquet        land use (to drop schools, churches, golf courses...)
  raw/overture_segment.parquet         streets (residential streets help tell houses from other buildings)
  data/nonfamily_blocks.txt            blocks known to hold no families (e.g. senior living)
Writes
  work/homes.parquet   points with units `u`, share of units built after 2020 `new`, and child weights per level
  work/blocks.parquet  census blocks with age counts

How units are placed: the 2020 Census says how many housing units each block had. Buildings in the block share those units
(apartment buildings by floor area, houses one each). A block whose buildings add up to well over its 2020 count has grown
since 2020; the extra units are marked as new homes.

How children are placed: each home gets two weights per level from its block's 2020 ages, per housing unit:
  s_<level>  ages that are school-age today, as in 2020   ("the block keeps its share of children")
  a_<level>  2020's younger children followed forward to 2027-28 ("the same families, older")
Step 3 blends the two. New homes get the rate of the busiest quarter of established family blocks.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from ..geo import district_outline
from ..settings import DATA_DIR, RAW_DIR, STATE_PLANE, work_file

SQUARE_FEET_PER_APARTMENT = 1100
FEET_PER_FLOOR = 3.2   # Overture heights are in metres; ~3.2 m per floor
NONRESIDENTIAL_BUILDING_TYPES = {'commercial', 'industrial', 'education', 'civic', 'religious', 'outbuilding', 'agricultural',
                                 'transportation', 'medical', 'service', 'entertainment', 'military'}
NONRESIDENTIAL_LAND_USE = ['education', 'religious', 'medical', 'golf', 'cemetery', 'transportation', 'recreation', 'agriculture']
HOUSE_CLASSES = ['house', 'detached', 'semidetached_house', 'residential', 'terrace']


def read_blocks_with_ages(district_shape) -> gpd.GeoDataFrame:
    """2020 blocks mostly inside the district, with household children by age band and the expected children per level."""
    near_district = district_shape.buffer(200)
    blocks = gpd.read_file(RAW_DIR / 'jocok_blocks.gpkg').to_crs(STATE_PLANE)
    blocks = blocks[blocks.intersects(near_district)].copy()
    share_inside = blocks.geometry.intersection(district_shape).area / blocks.geometry.area
    blocks = blocks[share_inside > 0.5].reset_index(drop=True)

    raw = json.load(open(RAW_DIR / 'jocok_dhc_p12_age_blocks.json'))
    ages = pd.DataFrame(raw[1:], columns=raw[0]).loc[:, lambda frame: ~frame.columns.duplicated()]
    ages['GEOID20'] = ages.GEO_ID.str[-15:]
    count = lambda column: pd.to_numeric(ages[column], errors='coerce').fillna(0)
    ages['pop'] = count('P12_001N')
    ages['u5'] = count('P12_003N') + count('P12_027N')        # under 5 (male + female)
    ages['a5_9'] = count('P12_004N') + count('P12_028N')
    ages['a10_14'] = count('P12_005N') + count('P12_029N')
    ages['a15_17'] = count('P12_006N') + count('P12_030N')
    group_quarters = pd.read_csv(RAW_DIR / 'census_age_gq_blocks.csv', dtype={'GEOID20': str})[['GEOID20', 'gq']]
    blocks = (blocks.merge(ages[['GEOID20', 'pop', 'u5', 'a5_9', 'a10_14', 'a15_17']], on='GEOID20', how='left')
                    .merge(group_quarters, on='GEOID20', how='left').fillna({'gq': 0}))

    household_share = (1 - (blocks.gq / blocks['pop'].clip(lower=1))).clip(0, 1)   # people not in group quarters
    nonfamily_blocks = set(open(DATA_DIR / 'nonfamily_blocks.txt').read().split())
    household_share[blocks.GEOID20.isin(nonfamily_blocks)] = 0

    # School-age children in 2020 (ages 5-10 elementary, 11-13 middle, 14-17 high; 10-14 is one census band, split 20/60/20)
    blocks['k_es'] = (blocks.a5_9 + 0.2 * blocks.a10_14) * household_share
    blocks['k_ms'] = (0.6 * blocks.a10_14) * household_share
    blocks['k_hs'] = (0.2 * blocks.a10_14 + blocks.a15_17) * household_share
    # The same grades in 2027-28, from 2020's younger children (kids born after 2020 placed like 2020's under-5s)
    blocks['a_es'] = blocks.u5 * household_share                                # 2027 ages 5-10  = 2020 ages 0-3 + later births
    blocks['a_ms'] = (0.2 * blocks.u5 + 0.4 * blocks.a5_9) * household_share    # 2027 ages 11-13 = 2020 ages 4-6
    blocks['a_hs'] = (0.6 * blocks.a5_9 + 0.2 * blocks.a10_14) * household_share  # 2027 ages 14-17 = 2020 ages 7-10
    blocks['HU20'] = blocks.HOUSING20.astype(float)
    blocks['bi'] = np.arange(len(blocks))
    return blocks


def read_residential_buildings(district_shape) -> gpd.GeoDataFrame:
    """Building footprints that may hold homes, as points, each with an estimated unit count and a kind: house or apt."""
    near_district = district_shape.buffer(200)
    buildings = gpd.read_parquet(RAW_DIR / 'overture_building.parquet').to_crs(STATE_PLANE)
    buildings = buildings[buildings.intersects(near_district)].copy()
    buildings['area'] = buildings.geometry.area
    floors_from_height = (buildings.height / FEET_PER_FLOOR).round().clip(1, 12)
    buildings['floors'] = buildings.num_floors.fillna(floors_from_height).fillna(1).clip(lower=1)
    buildings = buildings[(buildings.area >= 600) & ~buildings.subtype.isin(NONRESIDENTIAL_BUILDING_TYPES)]

    land_use = gpd.read_parquet(RAW_DIR / 'overture_land_use.parquet').to_crs(STATE_PLANE)
    nonresidential_land = land_use[land_use.subtype.isin(NONRESIDENTIAL_LAND_USE)].geometry.union_all()
    buildings = buildings[~buildings.geometry.representative_point().within(nonresidential_land)]

    segments = gpd.read_parquet(RAW_DIR / 'overture_segment.parquet').to_crs(STATE_PLANE)
    residential_streets = segments[(segments.subtype == 'road') & segments['class'].isin(['residential', 'living_street'])]
    near_residential_street = residential_streets.geometry.union_all().buffer(250)

    buildings['point'] = buildings.geometry.representative_point()
    buildings['near_residential_street'] = buildings.point.within(near_residential_street)
    building_class = buildings['class'].fillna('')
    is_apartment = (building_class.isin(['apartments', 'dormitory'])
                    | ((buildings.area > 5000) & building_class.isin(['residential', '']) & buildings.near_residential_street & (buildings.floors >= 2)))
    is_house = (~is_apartment & (buildings.area <= 6000)
                & ((buildings.subtype == 'residential') | building_class.isin(HOUSE_CLASSES)
                   | (buildings.subtype.isna() & buildings.near_residential_street)))
    apartment_units = (buildings.area * buildings.floors / SQUARE_FEET_PER_APARTMENT).round().clip(lower=4)
    buildings['units'] = np.where(is_apartment, apartment_units, np.where(is_house, 1.0, 0.0))
    buildings['kind'] = np.where(is_apartment, 'apt', np.where(is_house, 'house', 'other'))
    buildings = buildings[buildings.units > 0]
    return gpd.GeoDataFrame(buildings[['units', 'kind', 'area']], geometry=buildings.point.values, crs=STATE_PLANE)


def place_units_on_buildings(buildings_in_block: pd.DataFrame, units_2020: float) -> pd.DataFrame | None:
    """Share a block's 2020 housing units among its buildings. Returns the buildings with `u` (units) and `new` (share of
    units added since 2020), or None for a block with no homes."""
    estimated_units = buildings_in_block.units.sum()
    house_count = (buildings_in_block.kind == 'house').sum()
    if units_2020 <= 0 and house_count < 5:
        return None                                                     # nonresidential block with stray buildings
    if estimated_units > max(1.5 * units_2020, units_2020 + 10) and house_count >= 5:
        # Grown since 2020: every building keeps its estimate; the units beyond 2020's count are new homes
        return buildings_in_block.assign(u=buildings_in_block.units, new=(estimated_units - units_2020) / estimated_units)
    if estimated_units > 3 * units_2020 + 5:
        # Mixed block (homes beside shops or offices): keep the smallest buildings, about as many as 2020's units
        keep = int(1.3 * units_2020) + 3
        buildings_in_block = buildings_in_block[buildings_in_block.kind == 'house'].sort_values('area').iloc[:keep]
        estimated_units = buildings_in_block.units.sum()
    scale = units_2020 / max(estimated_units, 1e-9)
    return buildings_in_block.assign(u=buildings_in_block.units * scale, new=0.0)


def add_child_weights(homes: gpd.GeoDataFrame, blocks: gpd.GeoDataFrame) -> None:
    """Expected children per home and level (two weights each, see the module docstring)."""
    for level in ('es', 'ms', 'hs'):
        for prefix, column in (('s', f'k_{level}'), ('a', f'a_{level}')):
            per_unit = (blocks[column] / blocks.HU20.where(blocks.HU20 > 0)).fillna(0)
            established_blocks = blocks[blocks.HU20 >= 20]
            new_home_rate = float((established_blocks[column] / established_blocks.HU20).quantile(0.75))  # new subdivisions skew toward families
            homes[f'{prefix}_{level}'] = homes.u * ((1 - homes.new) * homes.bi.map(per_unit) + homes.new * new_home_rate)
            print(f'  {level} {prefix}: new-home rate per unit {new_home_rate:.3f}')


def run() -> None:
    district_shape = district_outline()
    blocks = read_blocks_with_ages(district_shape)
    buildings = read_residential_buildings(district_shape)
    buildings = gpd.sjoin(buildings, blocks[['bi', 'geometry']], predicate='within').drop(columns='index_right')

    placed = []
    for block_index, buildings_in_block in buildings.groupby('bi'):
        homes_in_block = place_units_on_buildings(buildings_in_block, blocks.HU20[block_index])
        if homes_in_block is not None:
            placed.append(homes_in_block.assign(bi=block_index))
    homes = gpd.GeoDataFrame(pd.concat(placed), geometry='geometry', crs=STATE_PLANE)

    # Blocks with 2020 homes but no buildings found: one point holding all the block's units
    unplaced = blocks[(blocks.HU20 > 0) & ~blocks.bi.isin(homes.bi)]
    block_points = gpd.GeoDataFrame(
        {'units': unplaced.HU20.values, 'kind': 'block', 'area': 0, 'bi': unplaced.bi.values, 'u': unplaced.HU20.values, 'new': 0.0},
        geometry=unplaced.geometry.representative_point().values, crs=STATE_PLANE)
    homes = pd.concat([homes, block_points], ignore_index=True)
    homes = homes[homes.geometry.within(district_shape)].reset_index(drop=True)

    add_child_weights(homes, blocks)
    print(f'  {len(homes)} homes, {homes.u.sum():.0f} units (2020 Census: {blocks.HU20.sum():.0f}); kinds {homes.kind.value_counts().to_dict()}')
    homes.to_parquet(work_file('homes.parquet'))
    blocks.to_parquet(work_file('blocks.parquet'))
