/**
 * forestBiome.ts — Default scenery preset for the forest biome.
 *
 * Used by `CombatScene` whenever `map_<x>.json` does not provide a
 * `scenery` block. Acts both as a sane fallback and as the canonical
 * example of how to author a scenery preset.
 *
 * Coordinate convention (assuming default 8x6 tile grid, tileSize=2 → mapW=16, mapD=12) :
 *
 *                       z = +25 ┬───────────────────────── deep background
 *                               │   tree-cone   tree-blob
 *                       z = +15 │ tree-blob       tree-blob
 *                               │
 *                       z = +12 ┌─── PLATEAU GAMEPLAY ──┐
 *                               │                       │
 *                       z =   0 └───────────────────────┘
 *                               │  foreground props
 *                       z =  -6 │ (depth = 'foreground')
 *
 * X = 0   ──────────────────────────────────────────── X = +16
 *              plateau spans x ∈ [0..16] roughly.
 */

import type { Prop3DPlacement, SceneryConfig } from '../rendering/SceneryTypes';

/* -------------------------------------------------------------------------- */
/* Forest                                                                      */
/* -------------------------------------------------------------------------- */

const forestProps: Prop3DPlacement[] = [
    // ── Back row (z > mapD) : silhouette of distant forest ─────────────
    { primitive: 'tree-cone', position: [-6, 0, 22], scale: 1.4, tint: [0.10, 0.22, 0.14], rotationY: 12 },
    { primitive: 'tree-blob', position: [ 2, 0, 24], scale: 1.6, tint: [0.12, 0.26, 0.16], rotationY: -25 },
    { primitive: 'tree-cone', position: [ 8, 0, 23], scale: 1.5, tint: [0.10, 0.20, 0.13], rotationY: 5 },
    { primitive: 'tree-blob', position: [14, 0, 22], scale: 1.3, tint: [0.14, 0.28, 0.18], rotationY: 45 },
    { primitive: 'tree-cone', position: [20, 0, 24], scale: 1.7, tint: [0.10, 0.22, 0.14], rotationY: -10 },

    // ── Mid row (around plateau back edge) : taller hero trees ────────
    { primitive: 'tree-blob', position: [-4, 0, 16], scale: 1.2, tint: [0.18, 0.40, 0.22], rotationY: 0 },
    { primitive: 'tree-cone', position: [18, 0, 15], scale: 1.4, tint: [0.16, 0.38, 0.22], rotationY: 30 },
    { primitive: 'tree-blob', position: [22, 0, 18], scale: 1.0, tint: [0.20, 0.45, 0.24], rotationY: 90 },

    // ── Side flanks : framing trees just outside the plateau ──────────
    { primitive: 'tree-cone', position: [-7, 0,  4], scale: 1.5, tint: [0.16, 0.35, 0.20], rotationY: 15, depth: 'foreground' },
    { primitive: 'tree-blob', position: [-6, 0,  9], scale: 1.1, tint: [0.20, 0.42, 0.24], rotationY: -20 },
    { primitive: 'tree-cone', position: [23, 0,  5], scale: 1.6, tint: [0.14, 0.32, 0.18], rotationY: -25, depth: 'foreground' },
    { primitive: 'tree-blob', position: [22, 0, 10], scale: 1.2, tint: [0.18, 0.40, 0.22], rotationY: 60 },

    // ── Foreground props : intimate framing close to camera ───────────
    { primitive: 'bush',     position: [-3, 0, -2], scale: 1.6, tint: [0.22, 0.50, 0.26], depth: 'foreground' },
    { primitive: 'rock',     position: [ 2, 0, -3], scale: 1.4, tint: [0.30, 0.32, 0.28], depth: 'foreground' },
    { primitive: 'tree-blob',position: [-5, 0, -5], scale: 0.8, tint: [0.24, 0.48, 0.26], depth: 'foreground', rotationY: 30 },
    { primitive: 'bush',     position: [11, 0, -2], scale: 1.5, tint: [0.20, 0.46, 0.24], depth: 'foreground' },
    { primitive: 'tree-blob',position: [18, 0, -5], scale: 0.9, tint: [0.22, 0.46, 0.26], depth: 'foreground', rotationY: -40 },

    // ── Ground details around the plateau ─────────────────────────────
    { primitive: 'rock', position: [ 0, 0,  4], scale: 0.7, tint: [0.32, 0.34, 0.30] },
    { primitive: 'rock', position: [17, 0,  9], scale: 0.6, tint: [0.30, 0.32, 0.28] },
    { primitive: 'bush', position: [-2, 0, 11], scale: 0.9, tint: [0.20, 0.42, 0.24] },
    { primitive: 'bush', position: [20, 0,  2], scale: 1.0, tint: [0.22, 0.45, 0.26] },
];

export const forestSceneryPreset: SceneryConfig = {
    biome: 'forest',
    backdrop: {
        gradient: {
            top:    [0.025, 0.055, 0.060],   // deep teal night sky
            bottom: [0.080, 0.190, 0.140],   // foggy forest floor
        },
        distance: 80,
        parallaxFactor: 0.12,
        oversize: 1.35,
    },
    props: forestProps,
    postFX: {
        vignetteIntensity: 0.45,
        vignetteColor:     [0.01, 0.02, 0.02],
        bloomThreshold:    0.85,
        bloomWeight:       0.45,
        grain:             4,
        toneMapping:       true,
        exposure:          1.0,
        contrast:          1.08,
    },
    ambient: {
        color: [0.40, 1.00, 0.30],   // fireflies green
        count: 24,
        alpha: [0.10, 0.30],
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
