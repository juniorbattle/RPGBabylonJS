# Backdrops

Place your generated backdrop images here.

## Wiring an image into a map

To use a backdrop image for the forest map, add the `image` key to the
backdrop section of `public/data/maps/map_forest.json` :

```json
"scenery": {
    "backdrop": {
        "image": "backdrop_forest.jpg",
        "gradient": { ... },
        "distance": 80,
        "parallaxFactor": 0.12,
        "oversize": 1.35
    }
}
```

When `image` is set, the procedural painted canvas is bypassed and the
image is stretched across the backdrop plane (sized from the camera FOV
and the `distance`).

## Specs

| Param | Value |
| --- | --- |
| Resolution | 3840 x 2160 (4K UHD) |
| Aspect ratio | 16:9 |
| Format | JPG quality 90 |
| Center | KEEP EMPTY (~20% margin) so the combat plateau + sprites occupy it |
| Top 60% | sky, canopy, light shafts |
| Bottom 40% | forest floor, ferns, mist |

## Suggested prompt (Midjourney v6 / SDXL / DALL-E 3)

```
HD-2D background painting in the style of Octopath Traveler 2 and
Triangle Strategy, mystical ancient forest scene, painterly digital art,
multiple depth layers of trees fading into teal-jade fog, warm golden
sunlight filtering down through the canopy as visible god rays, distant
silhouettes of massive twisted trees on the horizon, forest floor with
ferns and moss in the lower third, subtle bioluminescent particles
floating in the air, moody atmospheric perspective, deep shadows with
warm rim lights, cinematic composition framing a central empty
foreground area, hand-painted Squaresoft JRPG aesthetic, no characters,
no text, ultra-detailed, 4K resolution, 16:9 aspect ratio, color palette
deep teal #1a3a30, jade green #2d5e44, warm amber #c9914a, soft cream
#e8d9a8 highlights --ar 16:9 --v 6 --style raw
```
