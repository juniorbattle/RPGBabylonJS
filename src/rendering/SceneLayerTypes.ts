import { Vector3 } from '@babylonjs/core';

export type SceneLayerBlendMode = 'alpha' | 'additive' | 'screen' | 'multiply';
export type SceneLayerAlphaKey = 'none' | 'texture' | 'white' | 'black' | 'luminance' | 'magenta';
export type SceneLayerCameraMode = 'front' | 'overview';
export type SceneLayerStageFit = 'full-stage' | 'lower-stage' | 'foreground-frame' | 'fx-overlay';

export type SceneLayerCompositionRole =
    | 'backAtmosphere'
    | 'mainMidground'
    | 'groundBlend'
    | 'foregroundCorners'
    | 'upperCanopy'
    | 'fxOverlay';

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
