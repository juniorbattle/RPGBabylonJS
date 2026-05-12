import { Vector3 } from '@babylonjs/core';

export type SceneLayerBlendMode = 'alpha' | 'additive' | 'screen' | 'multiply';
export type SceneLayerAlphaKey = 'none' | 'texture' | 'white' | 'black' | 'luminance' | 'magenta';
export type SceneLayerCameraMode = 'front' | 'overview';
export type SceneLayerStageFit = 'full-stage' | 'lower-stage' | 'foreground-frame' | 'fx-overlay';

export interface SceneLayerAsset {
    file: string | null;
    opacity: number;
    blendMode: SceneLayerBlendMode;
    emissive: [number, number, number];
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
}

export interface SceneLayerPreset {
    id: string;
    background: SceneLayerAsset;
    midground: SceneLayerAsset;
    platformBlendFog: SceneLayerAsset;
    foreground: SceneLayerAsset;
    fxOverlay: SceneLayerAsset;
    particleColor: [number, number, number];
    particleCount: number;
    particleAlpha: [number, number];
}

export interface SceneLayerInstance {
    id: string;
    role: keyof Pick<SceneLayerPreset, 'background' | 'midground' | 'platformBlendFog' | 'foreground' | 'fxOverlay'>;
    basePosition: Vector3;
}
