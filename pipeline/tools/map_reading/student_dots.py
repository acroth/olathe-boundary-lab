"""Count the district's student dots for the five closing elementary schools (Nov 2026 elementary deck, "student density" slides).

Each slide shows one closing school's area with a purple dot per student. Dots are found by color and counted (touching dots
form one blob, counted as blob size / single-dot size), placed in state plane feet with the picture's georeference, and
summed per street block of that school. The dot slides have the same pixel frame as the base map slides, which carry the
georeference points.

Each school's in-area dots are scaled so they add up to the district's fall 2026 K-5 count, which is why block counts are
fractional. Writes work/student_dots_reading.parquet and compares it with the committed student_dots column.
"""
import geopandas as gpd
import numpy as np
from PIL import Image
from scipy import ndimage

from boundary_lab.district import K5_STUDENTS_FALL_2026
from boundary_lab.geo import polygon_containing_each_point
from boundary_lab.settings import MAP_READINGS_DIR, work_file
from .blocks import street_blocks_of
from .elementary_options import CLOSING_SCHOOLS, OPEN_SCHOOLS
from .georeference import SLIDES_DIR, georeference_for
from .intersections import road_crossings

MIN_BLOB_PIXELS = 12          # smaller purple specks are JPEG noise or label anti-aliasing
SINGLE_DOT_MAX_PIXELS = 80    # blobs smaller than this are single dots; their median size is one dot


def purple_dot_pixels(picture: np.ndarray) -> np.ndarray:
    red, green, blue = picture[..., 0], picture[..., 1], picture[..., 2]
    return ((90 < red) & (red < 170) & (40 < green) & (green < 110) & (110 < blue) & (blue < 190)
            & (blue - green > 45) & (red - green > 25))


def find_dots(picture: np.ndarray) -> np.ndarray:
    """Pixel position of every dot (a blob of k touching dots is repeated k times at its centre)."""
    mask = purple_dot_pixels(picture)
    blob_of_pixel, blob_count = ndimage.label(mask)
    blob_ids = range(1, blob_count + 1)
    sizes = np.array(ndimage.sum(mask, blob_of_pixel, blob_ids))
    centres = ndimage.center_of_mass(mask, blob_of_pixel, blob_ids)
    real = sizes >= MIN_BLOB_PIXELS
    single_dot_size = np.median(sizes[real & (sizes < SINGLE_DOT_MAX_PIXELS)])
    positions = []
    for size, (row, column) in zip(sizes[real], np.array(centres)[real]):
        positions += [(column, row)] * max(1, int(round(size / single_dot_size)))
    return np.array(positions)


def run() -> None:
    blocks = street_blocks_of(OPEN_SCHOOLS + CLOSING_SCHOOLS)
    blocks['student_dots'] = 0.0
    crossings = road_crossings()
    for school in CLOSING_SCHOOLS:
        slug = school.lower().replace(' ', '_')
        picture = np.asarray(Image.open(SLIDES_DIR / f'student_dots_{slug}_dots.png').convert('RGB')).astype(int)
        dots_ft = georeference_for(f'student_dots_{slug}_base.png', crossings).pixels_to_feet(find_dots(picture))
        dots = gpd.GeoDataFrame(geometry=gpd.points_from_xy(dots_ft[:, 0], dots_ft[:, 1]), crs=blocks.crs)
        school_blocks = blocks[blocks.current_school == school]
        block_of_dot = polygon_containing_each_point(dots, school_blocks).dropna()
        students_per_dot = K5_STUDENTS_FALL_2026[school] / len(block_of_dot)
        per_block = block_of_dot.value_counts() * students_per_dot
        blocks.loc[per_block.index, 'student_dots'] += per_block.values
        print(f'  {school}: {len(dots)} dots, {len(block_of_dot)} inside its area, {students_per_dot:.2f} students each')
    blocks.to_parquet(work_file('student_dots_reading.parquet'))

    committed = gpd.read_parquet(MAP_READINGS_DIR / 'elementary_blocks.parquet')
    match = polygon_containing_each_point(gpd.GeoDataFrame(geometry=blocks.geometry.representative_point(), crs=blocks.crs), committed)
    committed_dots = match.map(committed.student_dots).fillna(0).values
    for school in CLOSING_SCHOOLS:
        rows = (blocks.current_school == school).values
        gap = np.abs(blocks.student_dots.values[rows] - committed_dots[rows]).sum()
        print(f'  {school}: blocks differ from the committed counts by {gap:.1f} students in total '
              f'(of {K5_STUDENTS_FALL_2026[school]})')


if __name__ == '__main__':
    run()
