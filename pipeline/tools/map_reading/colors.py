"""Reading fill colors off a map picture and matching them to the legend.

Colors are compared in CIE Lab (closer to how people see differences than RGB) with lightness counted at half weight, so a
fill seen through a light overlay or JPEG noise still matches its legend swatch.
"""
import numpy as np

LIGHTNESS_WEIGHT = 0.5


def rgb_to_lab(rgb) -> np.ndarray:
    """sRGB (0-255) to CIE Lab, D65 white."""
    linear = np.asarray(rgb, float) / 255
    linear = np.where(linear > 0.04045, ((linear + 0.055) / 1.055) ** 2.4, linear / 12.92)
    to_xyz = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = linear @ to_xyz.T / np.array([0.9505, 1, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def weighted_lab(rgb) -> np.ndarray:
    lab = rgb_to_lab(rgb)
    lab[..., 0] *= LIGHTNESS_WEIGHT
    return lab


class Legend:
    """The map's legend: school name -> swatch color."""

    def __init__(self, swatches: dict[str, tuple[int, int, int]]):
        self.names = list(swatches)
        self.reference = weighted_lab(np.array([swatches[name] for name in self.names], float))

    def nearest(self, pixels: np.ndarray, allowed: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
        """For each pixel: (index of the nearest swatch, distance to it). `allowed` masks out swatches that can't apply."""
        distance = np.linalg.norm(weighted_lab(pixels)[:, None, :] - self.reference[None, :, :], axis=2)
        if allowed is not None:
            distance[:, ~allowed] = 1e9
        return distance.argmin(axis=1), distance.min(axis=1)

    def dominant_fill(self, window: np.ndarray, allowed: np.ndarray, max_distance: float, min_share: float) -> int | None:
        """The swatch covering at least `min_share` of a pixel window (lines and labels don't), or None."""
        pixels = window.reshape(-1, 3)
        nearest, distance = self.nearest(pixels, allowed)
        counts = np.bincount(nearest[distance < max_distance], minlength=len(self.names))
        return int(counts.argmax()) if counts.max() >= min_share * len(pixels) else None


def sample_swatches(picture: np.ndarray, names_and_pixels: dict[str, tuple[int, int]], half_size: int = 6) -> dict[str, np.ndarray]:
    """Median color of a small square at each legend swatch's position."""
    return {name: np.median(picture[y - half_size:y + half_size + 1, x - half_size:x + half_size + 1].reshape(-1, 3), axis=0)
            for name, (x, y) in names_and_pixels.items()}
