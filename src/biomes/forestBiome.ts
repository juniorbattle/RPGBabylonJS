/**
 * forestBiome.ts — Default scenery preset for the forest biome.
 *
 * COMBAT SAFE ZONE — STRICT
 * Default 8x6 tile grid, tileSize=2 → plateau spans world coords :
 *   x ∈ [0..16]   z ∈ [0..12]
 *
 * Props MUST NOT be placed inside x ∈ [-3..19], z ∈ [-3..15] (3-unit
 * buffer all around). Anything inside this zone will collide with the
 * combat grid, sprites and selection feedback.
 *
 *               z = +28 ──────────────── deep background
 *                       ●  ●  ●  ●  ●  ●          (BACK)
 *               z = +20
 *                       ●            ●            (MID)
 *               z = +15 ━━━━━━━━━━━━━━━━━━━━━━━━━ ← top buffer line
 *               z = +12 ┌─────────────────────┐
 *                       │                     │
 *                       │  COMBAT PLATEAU     │   ←── SAFE ZONE
 *                       │  [0..16, 0..12]     │       (no props)
 *                       │                     │
 *               z =  0  └─────────────────────┘
 *               z = -3  ━━━━━━━━━━━━━━━━━━━━━━━━━ ← bottom buffer line
 *                       ●  ●  ●  ●  ●  ●          (FOREGROUND)
 *               z = -8
 *
 *  x = -8   x = -3 │ SAFE │ x = 19   x = 24
 *  side-L   buffer │      │ buffer   side-R
 */

import type { SceneryConfig } from '../rendering/SceneryTypes';

/* -------------------------------------------------------------------------- */
/* Forest                                                                      */
/* -------------------------------------------------------------------------- */

// Procedural prop placements have been stripped from every biome preset.
// The diorama `.glb` (see public/assets/dioramas/README.md) is now the
// canonical source of mid decor. The combat scene without a diorama renders
// just the plateau + lights + fog + particles + backdrop — a clean canvas
// for the new Tripo3D / Blender authored environments.
//
// To reintroduce a few primitives for a specific biome, push entries of type
// `Prop3DPlacement` into the `props` array of that biome preset below. They
// will be skipped automatically when a diorama is active (see
// DioramaConfig.keepProceduralProps).

export const forestSceneryPreset: SceneryConfig = {
    biome: 'forest',
    backdrop: {
        // Magical teal-jade gradient. Brighter midtones to lift the scene
        // out of the previous "black soup" look.
        gradient: {
            top:    [0.040, 0.090, 0.110],   // deep teal-jade night
            bottom: [0.140, 0.280, 0.220],   // luminous forest mist
        },
        distance: 80,
        parallaxFactor: 0.12,
        oversize: 1.35,
    },
    props: [],
    postFX: {
        // Stronger vignette frames the action, bloom boosted so the warm
        // sun rim-light pops on the trees, exposure up to lift the global
        // darkness, contrast up for HD-2D punch.
        vignetteIntensity: 0.55,
        vignetteColor:     [0.005, 0.015, 0.020],
        bloomThreshold:    0.70,
        bloomWeight:       0.55,
        grain:             4,
        toneMapping:       true,
        exposure:          1.15,
        contrast:          1.18,
    },
    ambient: {
        color: [0.45, 1.00, 0.40],
        count: 28,
        alpha: [0.12, 0.34],
    },
};

/* -------------------------------------------------------------------------- */
/* Other biomes — minimal procedural fallbacks                                */
/* -------------------------------------------------------------------------- */

const plainsSceneryPreset: SceneryConfig = {
    biome: 'plains',
    backdrop: {
        gradient: { top: [0.42, 0.62, 0.85], bottom: [0.72, 0.82, 0.65] },
        distance: 80, parallaxFactor: 0.12, oversize: 1.35,
    },
    props: [],
    postFX: { vignetteIntensity: 0.30, bloomWeight: 0.35 },
    ambient: { color: [1, 0.95, 0.6], count: 14, alpha: [0.05, 0.18] },
};

const mountainSceneryPreset: SceneryConfig = {
    biome: 'mountain',
    backdrop: {
        gradient: { top: [0.55, 0.65, 0.78], bottom: [0.78, 0.82, 0.88] },
        distance: 90, parallaxFactor: 0.10, oversize: 1.4,
    },
    props: [],
    postFX: { vignetteIntensity: 0.35, bloomWeight: 0.30 },
    ambient: { color: [0.85, 0.92, 1], count: 18, alpha: [0.06, 0.20] },
};

const swampSceneryPreset: SceneryConfig = {
    biome: 'swamp',
    backdrop: {
        gradient: { top: [0.06, 0.10, 0.06], bottom: [0.18, 0.22, 0.10] },
        distance: 80, parallaxFactor: 0.13, oversize: 1.35,
    },
    props: [],
    postFX: { vignetteIntensity: 0.50, bloomWeight: 0.50 },
    ambient: { color: [0.4, 0.8, 0.3], count: 26, alpha: [0.08, 0.25] },
};

const ruinsSceneryPreset: SceneryConfig = {
    biome: 'ruins',
    backdrop: {
        gradient: { top: [0.25, 0.20, 0.18], bottom: [0.55, 0.45, 0.32] },
        distance: 80, parallaxFactor: 0.11, oversize: 1.35,
    },
    props: [],
    postFX: { vignetteIntensity: 0.45, bloomWeight: 0.40 },
    ambient: { color: [0.8, 0.6, 0.4], count: 18, alpha: [0.06, 0.20] },
};

const citySceneryPreset: SceneryConfig = {
    biome: 'city',
    backdrop: {
        gradient: { top: [0.04, 0.06, 0.12], bottom: [0.35, 0.20, 0.10] },
        distance: 80, parallaxFactor: 0.10, oversize: 1.35,
    },
    props: [],
    postFX: { vignetteIntensity: 0.50, bloomWeight: 0.65 },
    ambient: { color: [1, 0.7, 0.4], count: 22, alpha: [0.08, 0.30] },
};

/* -------------------------------------------------------------------------- */
/* Registry + helpers                                                          */
/* -------------------------------------------------------------------------- */

export const BIOME_SCENERY_PRESETS: Record<string, SceneryConfig> = {
    forest:   forestSceneryPreset,
    plains:   plainsSceneryPreset,
    mountain: mountainSceneryPreset,
    swamp:    swampSceneryPreset,
    ruins:    ruinsSceneryPreset,
    city:     citySceneryPreset,
};

export function getDefaultScenery(biome: string): SceneryConfig {
    return BIOME_SCENERY_PRESETS[biome] ?? BIOME_SCENERY_PRESETS.forest;
}
