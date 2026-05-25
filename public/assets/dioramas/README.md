# Dioramas

3D environment chunks (`.glb` files) loaded as a single mega-prop behind
the combat plateau. Replaces (or complements) the procedural primitives
of `SceneryConfig.props`.

## Workflow A — Tripo3D (image → 3D)

The fastest route. Tripo3D takes a single 2D image (concept art, photo,
or AI render) and produces a textured `.glb`.

### 1. Generate a source image

Use any AI image generator (Midjourney, SDXL, DALL-E 3, Flux, Leonardo)
or hand-painted concept art. **Image requirements** :

- 16:9 aspect ratio
- Isometric or 3/4 view (NOT front-facing, NOT top-down)
- Subject : forest diorama centred in frame, empty bottom-centre area
  (this will be where the combat plateau sits)
- Resolution : at least 1024 x 1024
- No characters, no text, no UI elements

### 2. Suggested prompt

```
Isometric 3D diorama of a mystical forest clearing, hand-painted style,
ancient twisted trees framing a central empty mossy ground area, low-poly
stylized rocks and ferns on the sides, golden sunlight from upper-right,
layered depth with foreground details and distant background trees,
warm amber and deep teal color palette, painterly soft shadows, fantasy
JRPG concept art aesthetic, 3D render, detailed, no characters, no text,
4K resolution, 16:9 aspect ratio --ar 16:9 --v 6
```

### 3. Upload to Tripo3D

1. Go to https://www.tripo3d.ai
2. Use the **"Image to 3D"** mode
3. Upload your image
4. Wait for the model generation (~1-2 min)
5. **Download as `.glb`** (NOT `.fbx` — Babylon's loader handles glb best)

### 4. Place the file

Drop the downloaded `.glb` into this directory :

```
public/assets/dioramas/diorama_forest.glb
```

### 5. Reference from biome / map config

Edit `src/biomes/forestBiome.ts` (or `public/data/maps/map_forest.json`)
and add a `diorama` block to the scenery config :

```typescript
export const forestSceneryPreset: SceneryConfig = {
    biome: 'forest',
    backdrop: { /* ... */ },
    props: [],   // empty out the procedural props once the diorama looks good
    diorama: {
        file: 'diorama_forest.glb',
        position: [8, 0, 6],     // centre of the combat plateau
        rotationY: 0,            // rotate around Y if needed
        scale: 1,                // tweak until the diorama matches plateau size
        enabled: true,
        receivesLighting: true,  // set to false if the .glb already bakes lighting
    },
    postFX: { /* ... */ },
};
```

### 6. Iterate on transform

The first load will probably look too big / too small / facing the wrong
way. Tweak `position`, `rotationY`, `scale` and reload :

- **Too big** : `scale: 0.5`
- **Floating** : `position: [8, -1, 6]`
- **Wrong facing direction** : `rotationY: 180`
- **Tripo origin off-centre** : adjust X and Z to recenter

## Workflow B — Blender

For full control. Model or assemble a diorama in Blender, then export.

1. Open Blender, create or import your scene
2. Place the diorama so its visual centre is at the world origin
3. Apply all transforms (`Ctrl+A` → All Transforms)
4. `File → Export → glTF 2.0 (.glb/.gltf)`
5. **Settings** :
   - Format : `glb` (single file)
   - Include : `Selected Objects` (or `Active Collection`)
   - Transform : `+Y Up`
   - Geometry : Apply Modifiers, UVs, Normals
   - Material : `Export` (PBR)
6. Save as `public/assets/dioramas/diorama_<biome>.glb`
7. Reference from the biome config as in Workflow A step 5

## Coordinate conventions

The Babylon scene uses **+X right, +Y up, +Z forward (into the screen)**.
The combat plateau spans :

| Axis | Range |
| --- | --- |
| X | `0` to `16` (centre at `8`) |
| Z | `0` to `12` (centre at `6`) |
| Y | ground level at `0`, plateau surface at `~0.2` |

Author your diorama with its visual centre at local origin so the default
`position: [8, 0, 6]` lands the centre right on the plateau centre.

## Lighting interaction

By default the scene applies four lights to all meshes :

- `ambCombat` — hemispheric ambient
- `sunCombat` — warm directional sun
- `rimCombat` — cool blue rim-light
- `heroSpotCombat` — narrow warm spotlight on the plateau

If your `.glb` already bakes lighting into its textures (common for
Tripo3D outputs), set `receivesLighting: false` in the diorama config to
disable the scene lights on the diorama materials. The combat sprites
and primitive props are unaffected.

## Performance notes

A Tripo3D diorama is typically 5K-30K triangles, single material. That's
well within budget for the combat scene. If you stack multiple dioramas
or use a 100K+ tri Blender export, watch the GPU profiler for frame-time
regressions.

## File registry

| File | Biome | Status |
| --- | --- | --- |
| `diorama_forest.glb` | forest | TODO — generate via Tripo3D |
