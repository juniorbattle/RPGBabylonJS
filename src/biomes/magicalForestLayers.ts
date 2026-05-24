import type {
    SceneLayerAsset,
    SceneLayerCompositionRole,
    SceneLayerPreset,
} from '../rendering/SceneLayerTypes';

const baseLayer = (
    id: string,
    name: string,
    order: number,
    compositionRole?: SceneLayerCompositionRole,
): Omit<SceneLayerAsset, 'file'> => ({
    id,
    name,
    order,
    enabled: true,
    opacity: 1,
    blendMode: 'alpha',
    emissive: [1, 1, 1],
    xOffset: 0,
    yOffset: 0,
    zOffset: 0,
    widthScale: 1,
    height: 36,
    billboard: false,
    renderGroup: 0,
    alphaKey: 'texture',
    cameraOpacity: { front: 1, overview: 0.9 },
    parallaxStrength: 0,
    stageFit: 'full-stage',
    compositionRole,
});

const layer = (
    id: string,
    name: string,
    order: number,
    file: string | null,
    overrides: Partial<SceneLayerAsset> = {},
    role?: SceneLayerCompositionRole,
): SceneLayerAsset => ({
    ...baseLayer(id, name, order, role),
    file,
    ...overrides,
});

const aliasByRole = (preset: SceneLayerPreset): SceneLayerPreset => {
    const byRole = (role: SceneLayerCompositionRole): SceneLayerAsset | undefined =>
        preset.layers.find((entry) => entry.compositionRole === role);

    const backAtmosphere = byRole('backAtmosphere');
    const mainMidground = byRole('mainMidground');
    const groundBlend = byRole('groundBlend');
    const foregroundCorners = byRole('foregroundCorners');
    const upperCanopy = byRole('upperCanopy');
    const fxOverlay = byRole('fxOverlay');

    return {
        ...preset,
        backAtmosphere,
        mainMidground,
        groundBlend,
        foregroundCorners,
        upperCanopy,
        fxOverlay,
        background: backAtmosphere,
        midground: mainMidground,
        platformBlendFog: groundBlend,
        foreground: foregroundCorners,
    };
};

/**
 * Default solid-color sky void fill for any biome. Acts as the guaranteed
 * opaque backstop behind every other layer. SceneLayerManager will normalize
 * critical props (opacity=1, order=-100, depthWrite=true) automatically.
 */
const skyVoidLayer = (
    id: string,
    color: [number, number, number],
): SceneLayerAsset => layer(id, 'Sky void fill', -100, null, {
    opacity: 1,
    blendMode: 'alpha',
    emissive: color,
    yOffset: -10,
    zOffset: 50,
    widthScale: 10,
    height: 70,
    renderGroup: 0,
    alphaKey: 'none',
    cameraOpacity: { front: 1, overview: 1 },
    parallaxStrength: 0,
    stageFit: 'sky-void',
}, 'skyVoidFill');

export const magicalForestLayerPreset: SceneLayerPreset = aliasByRole({
    id: 'forest_dynamic_stage',
    biome: 'forest',
    layers: [
        skyVoidLayer('sky_void_fill', [0.05, 0.10, 0.07]),
        layer('back_atmosphere', 'Back atmosphere', 0, 'fx_forest_mist_alpha.png', {
            opacity: 0.26,
            blendMode: 'additive',
            emissive: [0.2, 0.55, 0.32],
            yOffset: -6.5,
            zOffset: 38,
            widthScale: 4.7,
            height: 38,
            cameraOpacity: { front: 0.28, overview: 0.2 },
            parallaxStrength: 0.03,
            scrollSpeedX: 0.0005,
        }, 'backAtmosphere'),
        layer('main_midground', 'Main midground', 10, 'mid_forest_v3_alpha.png', {
            opacity: 1,
            yOffset: -7.8,
            zOffset: 27,
            widthScale: 4.75,
            height: 38,
            cameraOpacity: { front: 1, overview: 0.88 },
            parallaxStrength: 0.07,
        }, 'mainMidground'),
        layer('ground_blend', 'Ground blend', 20, 'fx_forest_v3_alpha.png', {
            opacity: 0.42,
            blendMode: 'additive',
            emissive: [0.35, 0.9, 0.42],
            yOffset: -10.4,
            zOffset: 13,
            widthScale: 4.55,
            height: 26,
            cameraOpacity: { front: 0.48, overview: 0.28 },
            parallaxStrength: 0.04,
            stageFit: 'lower-stage',
            scrollSpeedX: 0.001,
        }, 'groundBlend'),
        layer('foreground_corners', 'Foreground corners', 30, 'fore_forest_v3_alpha.png', {
            opacity: 0.58,
            yOffset: -8.8,
            zOffset: -5.5,
            widthScale: 4.95,
            height: 40,
            renderGroup: 1,
            cameraOpacity: { front: 0.6, overview: 0.24 },
            parallaxStrength: 0.22,
            stageFit: 'foreground-frame',
        }, 'foregroundCorners'),
        layer('upper_canopy', 'Upper canopy', 40, 'fore_forest_trunks_alpha.png', {
            opacity: 0.34,
            yOffset: 8.5,
            zOffset: -3,
            widthScale: 4.4,
            height: 22,
            renderGroup: 1,
            cameraOpacity: { front: 0.36, overview: 0.16 },
            parallaxStrength: 0.18,
            stageFit: 'foreground-frame',
        }, 'upperCanopy'),
        layer('fx_overlay', 'FX overlay', 50, 'fx_forest_v3_alpha.png', {
            opacity: 0.14,
            blendMode: 'additive',
            emissive: [0.32, 0.9, 0.36],
            yOffset: -8.4,
            zOffset: -2.2,
            widthScale: 4.9,
            height: 39,
            renderGroup: 1,
            cameraOpacity: { front: 0.16, overview: 0.1 },
            parallaxStrength: 0.16,
            stageFit: 'fx-overlay',
            scrollSpeedX: 0.0015,
        }, 'fxOverlay'),
    ],
    particleColor: [0.4, 1, 0.2],
    particleCount: 22,
    particleAlpha: [0.08, 0.26],
});

const simpleBiomePreset = (
    id: string,
    files: {
        backAtmosphere: string;
        mainMidground: string;
        foregroundCorners: string;
        fxOverlay: string;
    },
    tint: [number, number, number],
): SceneLayerPreset => aliasByRole({
    id,
    biome: id,
    layers: [
        skyVoidLayer(`${id}_sky_void_fill`, [tint[0] * 0.18, tint[1] * 0.18, tint[2] * 0.18]),
        layer(`${id}_back_atmosphere`, 'Back atmosphere', 0, files.backAtmosphere, {
            opacity: 0.25,
            blendMode: 'additive',
            emissive: tint,
            yOffset: -5,
            zOffset: 38,
            widthScale: 4.4,
            height: 36,
            cameraOpacity: { front: 0.28, overview: 0.18 },
        }, 'backAtmosphere'),
        layer(`${id}_main_midground`, 'Main midground', 10, files.mainMidground, {
            opacity: 0.95,
            yOffset: -7,
            zOffset: 27,
            widthScale: 4.55,
            height: 37,
            cameraOpacity: { front: 0.95, overview: 0.8 },
            parallaxStrength: 0.06,
        }, 'mainMidground'),
        layer(`${id}_ground_blend`, 'Ground blend', 20, files.fxOverlay, {
            opacity: 0.32,
            blendMode: 'additive',
            emissive: tint,
            yOffset: -10,
            zOffset: 13,
            widthScale: 4.5,
            height: 24,
            stageFit: 'lower-stage',
            cameraOpacity: { front: 0.36, overview: 0.22 },
        }, 'groundBlend'),
        layer(`${id}_foreground_corners`, 'Foreground corners', 30, files.foregroundCorners, {
            opacity: 0.42,
            yOffset: -8,
            zOffset: -5,
            widthScale: 4.7,
            height: 38,
            renderGroup: 1,
            cameraOpacity: { front: 0.46, overview: 0.18 },
            parallaxStrength: 0.18,
            stageFit: 'foreground-frame',
        }, 'foregroundCorners'),
        layer(`${id}_fx_overlay`, 'FX overlay', 50, files.fxOverlay, {
            opacity: 0.12,
            blendMode: 'additive',
            emissive: tint,
            yOffset: -8,
            zOffset: -2,
            widthScale: 4.7,
            height: 38,
            renderGroup: 1,
            cameraOpacity: { front: 0.14, overview: 0.08 },
            scrollSpeedX: 0.001,
        }, 'fxOverlay'),
    ],
    particleColor: tint,
    particleCount: 18,
    particleAlpha: [0.06, 0.2],
});

export const SCENE_LAYER_PRESETS: Record<string, SceneLayerPreset> = {
    forest: magicalForestLayerPreset,
    plains: simpleBiomePreset('plains', {
        backAtmosphere: 'fx_plains_wind.png',
        mainMidground: 'mid_plains_hills.png',
        foregroundCorners: 'fore_plains_grass.png',
        fxOverlay: 'fx_plains_wind.png',
    }, [0.75, 0.95, 0.45]),
    mountain: simpleBiomePreset('mountain', {
        backAtmosphere: 'fx_mountain_snow.png',
        mainMidground: 'mid_mountain_cliffs.png',
        foregroundCorners: 'fore_mountain_rocks.png',
        fxOverlay: 'fx_mountain_snow.png',
    }, [0.65, 0.8, 1]),
    swamp: simpleBiomePreset('swamp', {
        backAtmosphere: 'fx_swamp_mist.png',
        mainMidground: 'mid_swamp_trees.png',
        foregroundCorners: 'fore_swamp_reeds.png',
        fxOverlay: 'fx_swamp_mist.png',
    }, [0.35, 0.9, 0.45]),
    ruins: simpleBiomePreset('ruins', {
        backAtmosphere: 'fx_ruins_dust.png',
        mainMidground: 'mid_ruins_columns.png',
        foregroundCorners: 'fore_ruins_stones.png',
        fxOverlay: 'fx_ruins_dust.png',
    }, [0.8, 0.7, 0.5]),
    city: simpleBiomePreset('city', {
        backAtmosphere: 'fx_city_lanterns.png',
        mainMidground: 'mid_city_buildings.png',
        foregroundCorners: 'fore_city_street.png',
        fxOverlay: 'fx_city_lanterns.png',
    }, [1, 0.75, 0.42]),
};
