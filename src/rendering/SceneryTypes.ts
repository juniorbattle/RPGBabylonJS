/**
 * SceneryTypes.ts — HD-2D Diorama Theater Scenery Schema
 *
 * This is the new (and only) scenery contract for combat maps. It replaces the
 * deprecated SceneLayerTypes "panel stack" approach with a deterministic
 * theater layout :
 *
 *   sky dome  →  backdrop painting  →  mid props 3D  →  combat plateau
 *                                   →  foreground props 3D
 *                                   →  post-FX (vignette + bloom + ACES)
 *
 * - The backdrop is ONE plane (or a procedural gradient when no image is
 *   provided). It is positioned at a fixed distance from the camera and
 *   moves only with horizontal parallax.
 * - All other depth comes from real 3D props (.glb) or primitive placeholders.
 * - Post-FX is data-driven per biome but uses sane defaults.
 *
 * Authoring contract for `map_<biome>.json` :
 *
 *   "scenery": {
 *     "backdrop": { ... BackdropConfig ... },
 *     "props":    [ ... Prop3DPlacement[] ... ],
 *     "postFX":   { ... ScenePostFXConfig ... }
 *   }
 */

export type BiomeId =
    | 'forest'
    | 'plains'
    | 'mountain'
    | 'swamp'
    | 'ruins'
    | 'city'
    | 'desert'
    | 'snow'
    | 'cave';

/* -------------------------------------------------------------------------- */
/* Backdrop                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Configuration of the single backdrop plane sitting behind every prop.
 *
 * The plane size is computed automatically from the camera's vertical FOV and
 * the `distance` field, so the backdrop ALWAYS fills the visible viewport
 * regardless of map dimensions, with `oversize` extra coverage to absorb
 * Overview FOV widening and horizontal parallax sliding.
 */
export interface BackdropConfig {
    /**
     * Optional path to a backdrop image (relative to `public/`).
     * Example : `'assets/backdrops/backdrop_forest.jpg'`.
     * When absent, a procedural vertical gradient is rendered instead.
     */
    image?: string;
    /**
     * Vertical sky gradient. Used as the rendered surface when `image` is
     * absent, and as the underlying sky color the backdrop sits against.
     * Color components are linear RGB in [0..1].
     */
    gradient: {
        top:    [number, number, number];
        bottom: [number, number, number];
    };
    /** Distance from the camera (world units). Default `80`. */
    distance?: number;
    /**
     * Horizontal parallax factor in `[0..1]` :
     * - `0`   : backdrop fully fixed to camera (no parallax).
     * - `1`   : backdrop moves 1:1 with the camera (no parallax effect either).
     * - `0.1..0.2` : pleasing slow drift. Default `0.15`.
     */
    parallaxFactor?: number;
    /**
     * Oversize factor applied to the computed backdrop dimensions to absorb
     * Overview FOV widening and parallax sliding. Default `1.3`.
     */
    oversize?: number;
    /**
     * Optional silhouette layer rendered IN FRONT of the backdrop but BEHIND
     * every 3D prop. Useful for distant tree-line silhouettes baked into the
     * environment without producing a parallax stack.
     */
    silhouette?: {
        image: string;
        tint?: [number, number, number];
        opacity?: number;
    };
}

/* -------------------------------------------------------------------------- */
/* Props 3D                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Identifiers of the built-in primitive placeholder shapes. These are
 * stand-ins for real .glb assets and are useful both for prototyping new
 * biomes and as a graceful fallback when an asset fails to load.
 */
export type PrimitiveShape =
    | 'tree-cone'   // tall cone (pine/fir silhouette)
    | 'tree-blob'   // sphere on cylinder trunk (broadleaf silhouette)
    | 'rock'        // squished sphere
    | 'bush'        // small flat sphere
    | 'pillar'      // tall cylinder
    | 'crystal';    // tall pyramid

/**
 * A single prop placed in the world. Either references a `.glb` asset by key
 * (resolved by `SceneProps3DManager` via its asset registry) OR draws a
 * primitive placeholder for prototyping.
 */
export interface Prop3DPlacement {
    /**
     * Asset key to look up in the props registry, e.g. `'tree_oak_01'`. If
     * the asset is not registered or fails to load, `primitive` is used as
     * the fallback shape. If `primitive` is also absent, `'tree-blob'` is
     * the ultimate default.
     */
    asset?: string;
    /** Forces the placeholder primitive shape. Bypasses asset lookup. */
    primitive?: PrimitiveShape;
    /** World position. Y is typically `0` (ground level). */
    position: [number, number, number];
    /** Y-axis rotation in degrees. Default `0`. */
    rotationY?: number;
    /** Uniform scale multiplier. Default `1`. */
    scale?: number;
    /** Diffuse tint multiplier in linear RGB `[0..1]`. Default white. */
    tint?: [number, number, number];
    /**
     * Depth slot :
     * - `'mid'`        : behind the combat plateau (default).
     * - `'foreground'` : in front of the combat plateau. Slightly tinted darker
     *                    and rendered at a higher render-group to overlap UI
     *                    cleanly.
     */
    depth?: 'mid' | 'foreground';
}

/* -------------------------------------------------------------------------- */
/* Post-FX                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Post-process pipeline configuration. All fields are optional with safe
 * defaults applied by `ScenePostFX`.
 */
export interface ScenePostFXConfig {
    /** Vignette intensity in `[0..1]`. Default `0.4`. */
    vignetteIntensity?: number;
    /** Vignette color. Default near-black. */
    vignetteColor?: [number, number, number];
    /** Bloom luminance threshold in `[0..1]`. Default `0.9`. */
    bloomThreshold?: number;
    /** Bloom intensity weight. Default `0.4`. */
    bloomWeight?: number;
    /** Chromatic aberration intensity in `[0..30]`. Default `0` (off). */
    chromaticAberration?: number;
    /** Film grain intensity in `[0..30]`. Default `4`. */
    grain?: number;
    /**
     * Enable ACES tone mapping. Default `true`.
     * ACES is the de-facto standard for HD-2D / cinematic look.
     */
    toneMapping?: boolean;
    /** Optional exposure adjustment. Default `1`. */
    exposure?: number;
    /** Optional contrast adjustment. Default `1`. */
    contrast?: number;
}

/* -------------------------------------------------------------------------- */
/* Full scenery contract                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Complete scenery configuration for a single map / biome.
 * This is what `mapData.scenery` exports in the new JSON contract.
 */
export interface SceneryConfig {
    biome: BiomeId;
    backdrop: BackdropConfig;
    props: Prop3DPlacement[];
    postFX?: ScenePostFXConfig;
    /**
     * Optional ambient particle layer (e.g. fireflies, dust motes).
     * If omitted, the biome's default ambient is used.
     */
    ambient?: {
        color: [number, number, number];
        count: number;
        alpha: [number, number];
    };
}
