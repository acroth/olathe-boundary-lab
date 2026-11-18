"""Line a map picture up with state plane coordinates.

A projective transform (homography) maps picture pixels to feet. It's fitted by least squares to road crossings whose pixel
positions are known (data/map_readings/georeference_points.json). Those positions are found once per picture:
`refine_crossing` starts from a rough guess and snaps to the centre of the dark road lines around it.

To add a new picture:  python -m tools.map_reading.georeference <image> MurLen&151=1100,578 BlackBob&151=1197,572 ...
(rough pixel guesses for at least four crossings; the refined points are added to georeference_points.json).
"""
import json
import sys

import numpy as np
from PIL import Image

from boundary_lab.settings import MAP_READINGS_DIR, RAW_DIR
from .intersections import road_crossings

POINTS_FILE = MAP_READINGS_DIR / 'georeference_points.json'
SLIDES_DIR = RAW_DIR / 'district_slides'


class Georeference:
    """Pixel <-> feet for one picture."""

    def __init__(self, pixel_points: dict[str, tuple[float, float]], crossings: dict[str, tuple[float, float]]):
        names = [name for name in pixel_points if name in crossings]
        pixels = np.array([pixel_points[name] for name in names], float)
        feet = np.array([crossings[name] for name in names], float)
        self.centre = feet.mean(axis=0)               # fitting around the centre keeps the numbers well conditioned
        self.to_feet_matrix = fit_homography(pixels, feet - self.centre)
        self.to_pixel_matrix = np.linalg.inv(self.to_feet_matrix)
        misfit = np.hypot(*(self.pixels_to_feet(pixels) - feet).T)
        self.misfit_ft = dict(zip(names, misfit))

    def pixels_to_feet(self, pixels) -> np.ndarray:
        return apply_homography(self.to_feet_matrix, pixels) + self.centre

    def feet_to_pixels(self, feet) -> np.ndarray:
        return apply_homography(self.to_pixel_matrix, np.asarray(feet, float) - self.centre)


def fit_homography(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    """3x3 matrix H with target ~ H(source), by the direct linear transform (least squares via SVD)."""
    rows = []
    for (x, y), (u, v) in zip(source, target):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, right_singular_vectors = np.linalg.svd(np.array(rows, float))
    return right_singular_vectors[-1].reshape(3, 3)


def apply_homography(matrix: np.ndarray, points) -> np.ndarray:
    homogeneous = np.c_[np.asarray(points, float), np.ones(len(points))] @ matrix.T
    return homogeneous[:, :2] / homogeneous[:, 2:]


def is_road_line(window: np.ndarray) -> np.ndarray:
    """Pixels drawn as road lines on the district's maps: dark navy/blue, or the red of a boundary drawn over a road."""
    red, green, blue = window[..., 0], window[..., 1], window[..., 2]
    navy = (red < 100) & (blue > 100) & (green < 130)
    dark = (window.sum(axis=2) < 230) & (red < 110)
    boundary_red = (red > 170) & (green < 70) & (blue < 70)
    return navy | dark | boundary_red


def refine_crossing(picture: np.ndarray, guess: tuple[float, float], radius: int = 30) -> tuple[int, int] | None:
    """Snap a rough guess to the crossing of the strongest vertical and horizontal road lines within `radius` pixels."""
    x, y = int(round(guess[0])), int(round(guess[1]))
    if not (radius < x < picture.shape[1] - radius and radius < y < picture.shape[0] - radius):
        return None
    lines = is_road_line(picture[y - radius:y + radius + 1, x - radius:x + radius + 1])
    smooth = np.ones(3) / 3
    by_column = np.convolve(lines.sum(axis=0).astype(float), smooth, 'same')
    by_row = np.convolve(lines.sum(axis=1).astype(float), smooth, 'same')
    if by_column.max() < radius * 0.5 or by_row.max() < radius * 0.5:
        return None
    return x + int(np.argmax(by_column)) - radius, y + int(np.argmax(by_row)) - radius


def load_points() -> dict[str, dict[str, list[int]]]:
    return json.load(open(POINTS_FILE)) if POINTS_FILE.exists() else {}


def georeference_for(image_name: str, crossings: dict | None = None) -> Georeference:
    return Georeference({name: tuple(xy) for name, xy in load_points()[image_name].items()}, crossings or road_crossings())


def add_picture(image_name: str, guesses: dict[str, tuple[float, float]]) -> None:
    picture = np.asarray(Image.open(SLIDES_DIR / image_name).convert('RGB')).astype(int)
    refined = {name: refine_crossing(picture, guess) for name, guess in guesses.items()}
    refined = {name: list(point) for name, point in refined.items() if point}
    points = load_points()
    points[image_name] = refined
    json.dump(points, open(POINTS_FILE, 'w'), indent=1, sort_keys=True)
    fit = Georeference({name: tuple(xy) for name, xy in refined.items()}, road_crossings())
    print(image_name, {name: f'{misfit:.0f} ft' for name, misfit in fit.misfit_ft.items()})


if __name__ == '__main__':
    image, *pairs = sys.argv[1:]
    add_picture(image, {pair.split('=')[0]: tuple(float(v) for v in pair.split('=')[1].split(',')) for pair in pairs})
