import { Vector3 } from '@babylonjs/core';

export type SceneLayerBlendMode = 'alpha' | 'additive' | 'screen' | 'multiply';
export type SceneLayerAlphaKey = 'none' | 'texture' | 'white' | 'black' | 'luminance' | 'magenta';
export type SceneLayerCameraMode = 'front' | 'overview' | 'focus';
export type SceneLayerStageFit = 'full-stage' | 'lower-stage' | 'foreground-frame' | 'fx-overlay' | 'sky-void';

/**
 * How an image texture is fitted into its plane's geometry.
 *
 * - `stretch` : image is stretched to fill the plane exactly. Distorts the
 *               image if its aspect ratio differs from the plane's.
 * - `cover`   : image fills the plane without leaving any transparent edges.
 *               Crops the overflow on the dominant axis. Recommended for
 *               background paintings where coverage matters more than
 *               showing the entire image (CSS object-fit: cover analog).
 * - `tile-x`  : image repeats horizontally. Height is stretched. Requires a
 *               horizontally seamless source.
 * - `tile-xy` : image repeats on both axes. Requires a fully seamless source.
 */
export type ImageFit = 'stretch' | 'cover' | 'tile-x' | 'tile-xy';

export type SceneLayerCompositionRole =
    | 'skyVoidFill'
    | 'backAtmosphere'
    | 'mainMidground'
    | 'groundBlend'
    | 'foregroundCorners'
    | 'upperCanopy'
    | 'fxOverlay';

/**
 * Narrative intent driving how the backdrop composes during a cinematic.
 * Used by SceneLayerManager.setCinematicIntent() to scale layer alphas
 * (and optionally hide roles) for clearer foreground readability.
 *
 * - `idle`     : no cinematic running, all layers at their base alpha.
 * - `attack`   : foreground frame fades to expose attacker / target.
 * - `skill`    : foreground further reduced, fxOverlay boosted.
 * - `aoe`      : aggressive foreground fade for wide camera frames.
 * - `death`    : groundBlend & fxOverlay boosted for dramatic mood.
 * - `dialogue`: fxOverlay hidden to keep faces legible.
 */
export type CinematicIntent = 'idle' | 'attack' | 'skill' | 'aoe' | 'death' | 'dialogue';

export interface CinematicIntentSettings {
    /** Multiplier applied to the layer's base alpha, keyed by composition role. */
    alphaScale?: Partial<Record<SceneLayerCompositionRole, number>>;
    /** Roles forcibly hidden (alpha=0) for the duration of the intent. */
    hideRoles?: SceneLayerCompositionRole[];
}

export type SceneLayerLegacyRole =
    | 'background'
    | 'midground'
    | 'platformBlendFog'
    | 'foreground';

export type SceneLayerRole = SceneLayerCompositionRole | SceneLayerLegacyRole | string;

export interface SceneLayerAsset {
    id: string;
    name: string;
    enabled: boolean;
    order: number;
    file: string | null;
    opacity: number;
    blendMode: SceneLayerBlendMode;
    emissive: [number, number, number];
    xOffset: number;
    yOffset: number;
    zOffset: number;
    widthScale: number;
    height: number;
    billboard: boolean;
    renderGroup: number;
    alphaKey?: SceneLayerAlphaKey;
    scrollSpeedX?: number;
    scrollSpeedY?: number;
    uvScaleX?: number;
    uvScaleY?: number;
    uvOffsetX?: number;
    uvOffsetY?: number;
    cameraOpacity?: Partial<Record<SceneLayerCameraMode, number>>;
    cameraYOffset?: Partial<Record<SceneLayerCameraMode, number>>;
    cameraZOffset?: Partial<Record<SceneLayerCameraMode, number>>;
    parallaxStrength?: number;
    stageFit?: SceneLayerStageFit;
    compositionRole?: SceneLayerCompositionRole;
    /**
     * When true, geometric properties (yOffset/zOffset/widthScale/height)
     * are recomputed by SceneLayerManager based on the active mainMidground
     * and the ground baseline. Currently honored on `groundBlend` to
     * guarantee a clean 2D-3D ground fusion regardless of map dimensions.
     */
    autoFit?: boolean;
    /**
     * How the texture image is mapped onto the plane. Defaults to 'cover'
     * for backdrop / midground / foreground roles and 'stretch' for the
     * solid-color skyVoidFill. See `ImageFit` for details.
     */
    imageFit?: ImageFit;
    /**
     * Native aspect ratio (width / height) of the source PNG. Used by
     * `cover` and `tile-x` to compute UV scale/offset. If omitted, the
     * image is assumed square (1:1) and `cover` may behave unexpectedly.
     */
    imageAspectRatio?: number;
}

export interface SceneLayerStack {
    id: string;
    biome?: string;
    layers: SceneLayerAsset[];
    particleColor: [number, number, number];
    particleCount: number;
    particleAlpha: [number, number];
}

export interface SceneLayerPreset extends SceneLayerStack {
    /** Legacy alias for old map exports. Prefer layers[]. */
    skyVoidFill?: SceneLayerAsset;
    backAtmosphere?: SceneLayerAsset;
    mainMidground?: SceneLayerAsset;
    groundBlend?: SceneLayerAsset;
    foregroundCorners?: SceneLayerAsset;
    upperCanopy?: SceneLayerAsset;
    fxOverlay?: SceneLayerAsset;
    background?: SceneLayerAsset;
    midground?: SceneLayerAsset;
    platformBlendFog?: SceneLayerAsset;
    foreground?: SceneLayerAsset;
}

export type SceneLayerInput = SceneLayerStack | Partial<SceneLayerPreset>;

export interface SceneLayerInstance {
    id: string;
    role: SceneLayerRole;
    basePosition: Vector3;
}

export type SceneGroundLayerMode = 'procedural' | 'texture' | 'color';

export interface SceneGroundLayerConfig {
    enabled: boolean;
    mode: SceneGroundLayerMode;
    textureFile: string | null;
    color: string;
    opacity: number;
    repeatX: number;
    repeatY: number;
    xOffset: number;
    zOffset: number;
    elevationOffset: number;
    widthScale: number;
    depthScale: number;
}
