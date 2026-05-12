/**
 * Compatibility facade for the combat/map-editor layer system.
 *
 * New code should import SceneLayerManager and SceneLayerTypes from src/rendering.
 * Existing editor/combat modules still use the historical BiomeLayer* names, so
 * this file keeps those imports stable during the migration.
 */

export {
    SceneLayerManager as BiomeLayerManager,
    SCENE_LAYER_PRESETS as BIOME_LAYER_PRESETS,
} from '../rendering/SceneLayerManager';

export type {
    SceneLayerAsset as LayerAsset,
    SceneLayerPreset as BiomeLayerPreset,
    SceneLayerBlendMode as LayerBlendMode,
    SceneLayerAlphaKey as LayerAlphaKey,
    SceneLayerCameraMode as LayerCameraMode,
} from '../rendering/SceneLayerTypes';
