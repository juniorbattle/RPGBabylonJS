/**
 * SceneGroundTypes.ts — Ground (combat plateau) configuration types.
 *
 * Extracted from the now-deprecated SceneLayerTypes so the ground configuration
 * survives the SceneLayerManager → SceneBackdropManager refactor.
 */

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
