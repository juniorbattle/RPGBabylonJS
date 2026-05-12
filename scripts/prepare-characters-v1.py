import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ROSTER_PATH = ROOT / "docs" / "art" / "characters_v1_roster.json"
SOURCE_ROOT = ROOT / "public" / "assets" / "characters" / "source"
SEED_ROOT = ROOT / "public" / "assets" / "characters" / "seeds"
PREVIEW_PATH = ROOT / "docs" / "art" / "characters_v1_seed_sheet.png"


def is_background_like(pixel):
    r, g, b, _a = pixel
    high = max(r, g, b)
    low = min(r, g, b)
    return high >= 224 and (high - low) <= 34


def remove_connected_light_background(image):
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue = deque()

    def push(x, y):
        idx = y * width + x
        if visited[idx]:
            return
        visited[idx] = 1
        if is_background_like(pixels[x, y]):
            queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        r, g, b, _a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

        if x > 0:
            push(x - 1, y)
        if x + 1 < width:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < height:
            push(x, y + 1)

    return rgba


def alpha_bbox(image):
    alpha = image.getchannel("A")
    return alpha.getbbox()


def normalize_seed(image, frame_size=256, padding=18):
    bbox = alpha_bbox(image)
    if not bbox:
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))

    cropped = image.crop(bbox)
    max_w = frame_size - padding * 2
    max_h = frame_size - padding * 2
    scale = min(max_w / cropped.width, max_h / cropped.height)
    out_w = max(1, round(cropped.width * scale))
    out_h = max(1, round(cropped.height * scale))
    resized = cropped.resize((out_w, out_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    x = (frame_size - out_w) // 2
    y = frame_size - padding - out_h
    canvas.alpha_composite(resized, (x, y))
    return canvas


def make_preview(entries, columns=4, frame_size=256, label_h=34):
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * frame_size, rows * (frame_size + label_h)), (20, 24, 28, 255))

    try:
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.load_default()
    except Exception:
        draw = None
        font = None

    for idx, (character_id, image) in enumerate(entries):
        col = idx % columns
        row = idx // columns
        x = col * frame_size
        y = row * (frame_size + label_h)

        bg = Image.new("RGBA", (frame_size, frame_size), (35, 42, 45, 255))
        for gy in range(0, frame_size, 16):
            for gx in range(0, frame_size, 16):
                if ((gx // 16) + (gy // 16)) % 2 == 0:
                    for py in range(gy, min(gy + 16, frame_size)):
                        for px in range(gx, min(gx + 16, frame_size)):
                            bg.putpixel((px, py), (43, 51, 55, 255))
        bg.alpha_composite(image)
        sheet.alpha_composite(bg, (x, y))

        if draw:
            draw.rectangle([x, y + frame_size, x + frame_size, y + frame_size + label_h], fill=(10, 14, 20, 255))
            draw.text((x + 8, y + frame_size + 10), character_id[:30], fill=(230, 236, 245, 255), font=font)

    return sheet


def main():
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    SEED_ROOT.mkdir(parents=True, exist_ok=True)

    preview_entries = []
    for character in roster["characters"]:
        source_path = SOURCE_ROOT / character["source"]
        seed_path = SEED_ROOT / f"{character['id']}_seed.png"

        source = Image.open(source_path)
        transparent = remove_connected_light_background(source)
        seed = normalize_seed(transparent, frame_size=roster["runtimeContract"]["frameSize"])
        seed.save(seed_path)
        preview_entries.append((character["id"], seed))
        character["seed"] = f"seeds/{seed_path.name}"

    ROSTER_PATH.write_text(json.dumps(roster, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    preview = make_preview(preview_entries)
    preview.save(PREVIEW_PATH)
    print(f"[characters:v1] Prepared {len(preview_entries)} seeds.")
    print(f"[characters:v1] Preview: {PREVIEW_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
