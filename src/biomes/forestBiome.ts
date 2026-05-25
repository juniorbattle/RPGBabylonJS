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

import type { Prop3DPlacement, SceneryConfig } from '../rendering/SceneryTypes';

/* -------------------------------------------------------------------------- */
/* Forest                                                                      */
/* -------------------------------------------------------------------------- */

const forestProps: Prop3DPlacement[] = [
    // ── DEEP BACK ROW (z = 24..28) : far silhouette layer ─────────────
    { primitive: 'tree-cone', position: [-8, 0, 26], scale: 1.1, tint: [0.09, 0.20, 0.13], rotationY: 12 },
    { primitive: 'tree-blob', position: [-2, 0, 27], scale: 1.0, tint: [0.10, 0.22, 0.14], rotationY: -25 },
    { primitive: 'tree-cone', position: [ 5, 0, 28], scale: 1.2, tint: [0.08, 0.18, 0.11], rotationY: 5 },
    { primitive: 'tree-blob', position: [11, 0, 27], scale: 0.9, tint: [0.12, 0.24, 0.15], rotationY: 45 },
    { primitive: 'tree-cone', position: [17, 0, 28], scale: 1.3, tint: [0.09, 0.20, 0.13], rotationY: -10 },
    { primitive: 'tree-blob', position: [23, 0, 26], scale: 1.0, tint: [0.10, 0.22, 0.14], rotationY: 60 },

    // ── BACK ROW (z = 19..22) : medium silhouette layer ────────────────
    { primitive: 'tree-cone', position: [-5, 0, 21], scale: 1.3, tint: [0.13, 0.30, 0.18], rotationY: 18 },
    { primitive: 'tree-blob', position: [ 3, 0, 20], scale: 1.1, tint: [0.16, 0.34, 0.20], rotationY: -15 },
    { primitive: 'tree-cone', position: [ 9, 0, 22], scale: 1.4, tint: [0.12, 0.28, 0.16], rotationY: 8 },
    { primitive: 'tree-blob', position: [14, 0, 19], scale: 1.0, tint: [0.18, 0.36, 0.22], rotationY: 35 },
    { primitive: 'tree-cone', position: [21, 0, 21], scale: 1.3, tint: [0.13, 0.30, 0.18], rotationY: -22 },

    // ── MID ROW (z = 16..18) : closer hero trees just past the buffer ─
    { primitive: 'tree-blob', position: [-6, 0, 16], scale: 1.2, tint: [0.22, 0.46, 0.26], rotationY: 0 },
    { primitive: 'tree-cone', position: [-3, 0, 18], scale: 1.5, tint: [0.18, 0.40, 0.22], rotationY: 25 },
    { primitive: 'tree-blob', position: [20, 0, 16], scale: 1.1, tint: [0.24, 0.48, 0.28], rotationY: -30 },
    { primitive: 'tree-cone', position: [23, 0, 18], scale: 1.4, tint: [0.18, 0.40, 0.22], rotationY: -8 },

    // ── SIDE FLANKS LEFT (x = -8..-4, z = 3..11) ──────────────────────
    { primitive: 'tree-cone', position: [-7, 0,  3], scale: 1.4, tint: [0.18, 0.38, 0.22], rotationY: 15 },
    { primitive: 'tree-blob', position: [-5, 0,  7], scale: 1.0, tint: [0.24, 0.48, 0.28], rotationY: -20 },
    { primitive: 'tree-cone', position: [-8, 0, 10], scale: 1.5, tint: [0.16, 0.36, 0.20], rotationY: 40 },
    { primitive: 'bush',      position: [-4, 0,  5], scale: 1.0, tint: [0.28, 0.55, 0.32] },
    { primitive: 'rock',      position: [-4, 0,  9], scale: 0.9, tint: [0.36, 0.38, 0.34] },

    // ── SIDE FLANKS RIGHT (x = 20..24, z = 3..11) ─────────────────────
    { primitive: 'tree-cone', position: [22, 0,  3], scale: 1.5, tint: [0.16, 0.36, 0.20], rotationY: -25 },
    { primitive: 'tree-blob', position: [21, 0,  8], scale: 1.1, tint: [0.22, 0.46, 0.26], rotationY: 60 },
    { primitive: 'tree-cone', position: [24, 0, 11], scale: 1.4, tint: [0.18, 0.38, 0.22], rotationY: -10 },
    { primitive: 'bush',      position: [20, 0,  5], scale: 1.1, tint: [0.28, 0.55, 0.32] },
    { primitive: 'rock',      position: [21, 0, 11], scale: 0.8, tint: [0.36, 0.38, 0.34] },

    // ── FOREGROUND LEFT (z = -3..-7, x ≤ -3) ──────────────────────────
    { primitive: 'tree-blob', position: [-7, 0, -3], scale: 1.0, tint: [0.20, 0.42, 0.24], depth: 'foreground', rotationY: 20 },
    { primitive: 'bush',      position: [-5, 0, -5], scale: 1.3, tint: [0.30, 0.58, 0.34], depth: 'foreground' },
    { primitive: 'rock',      position: [-4, 0, -2], scale: 1.1, tint: [0.36, 0.38, 0.34], depth: 'foreground' },
    { primitive: 'bush',      position: [-8, 0, -7], scale: 1.0, tint: [0.24, 0.50, 0.28], depth: 'foreground' },

    // ── FOREGROUND RIGHT (z = -3..-7, x ≥ 19) ─────────────────────────
    { primitive: 'tree-blob', position: [22, 0, -3], scale: 1.0, tint: [0.20, 0.42, 0.24], depth: 'foreground', rotationY: -15 },
    { primitive: 'bush',      position: [20, 0, -5], scale: 1.4, tint: [0.30, 0.58, 0.34], depth: 'foreground' },
    { primitive: 'rock',      position: [19, 0, -2], scale: 1.0, tint: [0.36, 0.38, 0.34], depth: 'foreground' },
    { primitive: 'bush',      position: [24, 0, -6], scale: 1.1, tint: [0.24, 0.50, 0.28], depth: 'foreground' },
];

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
    props: forestProps,
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
    props: [
        { primitive: 'tree-blob', position: [-4, 0, 18], scale: 1.0, tint: [0.40, 0.65, 0.30] },
        { primitive: 'tree-blob', position: [20, 0, 17], scale: 1.1, tint: [0.42, 0.66, 0.32] },
        { primitive: 'bush', position: [-3, 0, -3], scale: 1.3, tint: [0.55, 0.75, 0.35], depth: 'foreground' },
        { primitive: 'bush', position: [19, 0, -3], scale: 1.4, tint: [0.55, 0.75, 0.35], depth: 'foreground' },
    ],
    postFX: { vignetteIntensity: 0.30, bloomWeight: 0.35 },
    ambient: { color: [1, 0.95, 0.6], count: 14, alpha: [0.05, 0.18] },
};

const mountainSceneryPreset: SceneryConfig = {
    biome: 'mountain',
    backdrop: {
        gradient: { top: [0.55, 0.65, 0.78], bottom: [0.78, 0.82, 0.88] },
        distance: 90, parallaxFactor: 0.10, oversize: 1.4,
    },
    props: [
        { primitive: 'rock', position: [-6, 0, 20], scale: 4.0, tint: [0.55, 0.55, 0.60] },
        { primitive: 'rock', position: [22, 0, 22], scale: 4.5, tint: [0.50, 0.50, 0.55] },
        { primitive: 'rock', position: [ 8, 0, 24], scale: 3.5, tint: [0.58, 0.58, 0.62] },
        { primitive: 'rock', position: [-2, 0, -4], scale: 1.6, depth: 'foreground' },
        { primitive: 'rock', position: [18, 0, -5], scale: 1.8, depth: 'foreground' },
    ],
    postFX: { vignetteIntensity: 0.35, bloomWeight: 0.30 },
    ambient: { color: [0.85, 0.92, 1], count: 18, alpha: [0.06, 0.20] },
};

const swampSceneryPreset: SceneryConfig = {
    biome: 'swamp',
    backdrop: {
        gradient: { top: [0.06, 0.10, 0.06], bottom: [0.18, 0.22, 0.10] },
        distance: 80, parallaxFactor: 0.13, oversize: 1.35,
    },
    props: [
        { primitive: 'tree-blob', position: [-5, 0, 20], scale: 1.4, tint: [0.18, 0.32, 0.16] },
        { primitive: 'tree-blob', position: [22, 0, 19], scale: 1.5, tint: [0.20, 0.34, 0.18] },
        { primitive: 'bush', position: [ 0, 0, -3], scale: 1.4, tint: [0.22, 0.42, 0.18], depth: 'foreground' },
        { primitive: 'bush', position: [17, 0, -4], scale: 1.5, tint: [0.22, 0.42, 0.18], depth: 'foreground' },
    ],
    postFX: { vignetteIntensity: 0.50, bloomWeight: 0.50 },
    ambient: { color: [0.4, 0.8, 0.3], count: 26, alpha: [0.08, 0.25] },
};

const ruinsSceneryPreset: SceneryConfig = {
    biome: 'ruins',
    backdrop: {
        gradient: { top: [0.25, 0.20, 0.18], bottom: [0.55, 0.45, 0.32] },
        distance: 80, parallaxFactor: 0.11, oversize: 1.35,
    },
    props: [
        { primitive: 'pillar', position: [-4, 0, 18], scale: 1.4, tint: [0.65, 0.60, 0.50] },
        { primitive: 'pillar', position: [20, 0, 19], scale: 1.6, tint: [0.65, 0.60, 0.50] },
        { primitive: 'pillar', position: [ 8, 0, 24], scale: 1.8, tint: [0.60, 0.55, 0.48] },
        { primitive: 'rock',   position: [-3, 0, -4], scale: 1.4, depth: 'foreground' },
        { primitive: 'rock',   position: [18, 0, -3], scale: 1.6, depth: 'foreground' },
    ],
    postFX: { vignetteIntensity: 0.45, bloomWeight: 0.40 },
    ambient: { color: [0.8, 0.6, 0.4], count: 18, alpha: [0.06, 0.20] },
};

const citySceneryPreset: SceneryConfig = {
    biome: 'city',
    backdrop: {
        gradient: { top: [0.04, 0.06, 0.12], bottom: [0.35, 0.20, 0.10] },
        distance: 80, parallaxFactor: 0.10, oversize: 1.35,
    },
    props: [
        { primitive: 'pillar', position: [-4, 0, 20], scale: 2.0, tint: [0.40, 0.36, 0.28] },
        { primitive: 'pillar', position: [20, 0, 21], scale: 2.2, tint: [0.42, 0.38, 0.30] },
        { primitive: 'crystal',position: [10, 0, 22], scale: 1.3, tint: [1.00, 0.70, 0.40] },
    ],
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
