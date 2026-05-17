from __future__ import annotations

import argparse
import re
from collections import deque
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image


Color = Tuple[int, int, int]


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def corner_samples(image: Image.Image, size: int = 18) -> Iterable[Color]:
    width, height = image.size
    rgb = image.convert("RGB")
    boxes = (
        (0, 0, size, size),
        (width - size, 0, width, size),
        (0, height - size, size, height),
        (width - size, height - size, width, height),
    )
    for box in boxes:
        for r, g, b in rgb.crop(box).getdata():
            yield (r, g, b)


def average_color(samples: Iterable[Color]) -> Color:
    values = list(samples)
    if not values:
        return (255, 255, 255)
    count = len(values)
    return (
        sum(v[0] for v in values) // count,
        sum(v[1] for v in values) // count,
        sum(v[2] for v in values) // count,
    )


def color_distance(a: Color, b: Color) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def detect_key_color(image: Image.Image) -> Color | None:
    key = average_color(corner_samples(image))
    r, g, b = key
    magenta_like = r > 180 and b > 180 and g < 90
    light_like = r > 220 and g > 220 and b > 220 and max(key) - min(key) < 35
    if magenta_like or light_like:
        return key
    return None


def has_useful_alpha(image: Image.Image) -> bool:
    if image.mode != "RGBA":
        return False
    alpha_min, alpha_max = image.getchannel("A").getextrema()
    return alpha_min < 255 <= alpha_max


def cleanup_alpha(image: Image.Image, key: Color, threshold: float, softness: float) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    max_distance = threshold + softness

    def similar(x: int, y: int) -> bool:
        r, g, b, _ = pixels[x, y]
        return color_distance((r, g, b), key) <= max_distance

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def add_if_edge_bg(x: int, y: int) -> None:
        idx = y * width + x
        if visited[idx] or not similar(x, y):
            return
        visited[idx] = 1
        queue.append((x, y))

    for x in range(width):
        add_if_edge_bg(x, 0)
        add_if_edge_bg(x, height - 1)
    for y in range(height):
        add_if_edge_bg(0, y)
        add_if_edge_bg(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            idx = ny * width + nx
            if visited[idx] or not similar(nx, ny):
                continue
            visited[idx] = 1
            queue.append((nx, ny))

    for y in range(height):
        row = y * width
        for x in range(width):
            if not visited[row + x]:
                continue
            r, g, b, a = pixels[x, y]
            dist = color_distance((r, g, b), key)
            if dist <= threshold:
                new_alpha = 0
            else:
                new_alpha = int(255 * min(1.0, (dist - threshold) / max(1.0, softness)))
            pixels[x, y] = (r, g, b, min(a, new_alpha))

    return rgba


def output_path_for(path: Path) -> Path:
    stem = slugify(path.stem)
    return path.with_name(f"{stem}_alpha.png")


def process_file(path: Path, threshold: float, softness: float, force: bool) -> str:
    if path.stem.endswith("_alpha"):
        return f"skip alpha copy: {path.name}"

    image = Image.open(path)
    if has_useful_alpha(image) and not force:
        return f"skip already transparent: {path.name}"

    key = detect_key_color(image)
    if key is None:
        return f"skip no edge key color: {path.name}"

    out_path = output_path_for(path)
    if out_path.exists() and not force:
        return f"skip exists: {out_path.name}"

    cleaned = cleanup_alpha(image, key, threshold, softness)
    cleaned.save(out_path)
    alpha_min, alpha_max = cleaned.getchannel("A").getextrema()
    return f"created {out_path.name} key={key} alpha={alpha_min}-{alpha_max}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create transparent copies of background layer PNGs.")
    parser.add_argument("--root", default="public/assets/backgrounds")
    parser.add_argument("--threshold", type=float, default=18.0)
    parser.add_argument("--softness", type=float, default=54.0)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        raise SystemExit(f"Background root not found: {root}")

    for path in sorted(root.glob("*.png")):
        print(process_file(path, args.threshold, args.softness, args.force))


if __name__ == "__main__":
    main()
