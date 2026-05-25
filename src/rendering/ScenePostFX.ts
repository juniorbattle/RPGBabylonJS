/**
 * ScenePostFX.ts — Post-processing pipeline for HD-2D diorama scenery.
 *
 * Lightweight wrapper around Babylon's DefaultRenderingPipeline configured
 * with the HD-2D signature look :
 *   - ACES tone mapping
 *   - Subtle bloom on highlights
 *   - Vignette to focus attention on the combat plateau
 *   - Light film grain for sprite/3D blending
 *
 * Designed to be composable with the legacy `_renderingPipeline` setup in
 * `CombatScene` : if a pipeline already exists, we DO NOT recreate one;
 * we only reconfigure the relevant fields.
 */

import {
    Scene,
    Camera,
    DefaultRenderingPipeline,
    Color4,
    ImageProcessingConfiguration,
} from '@babylonjs/core';

import type { ScenePostFXConfig } from './SceneryTypes';

const DEFAULTS: Required<ScenePostFXConfig> = {
    vignetteIntensity: 0.4,
    vignetteColor: [0.02, 0.02, 0.04],
    bloomThreshold: 0.9,
    bloomWeight: 0.4,
    chromaticAberration: 0,
    grain: 4,
    toneMapping: true,
    exposure: 1.0,
    contrast: 1.05,
};

export class ScenePostFX {
    private scene: Scene;
    private camera: Camera;
    private ownedPipeline: DefaultRenderingPipeline | null = null;
    private externalPipeline: DefaultRenderingPipeline | null = null;

    constructor(scene: Scene, camera: Camera) {
        this.scene = scene;
        this.camera = camera;
    }

    /**
     * Configure the post-FX pipeline.
     * @param config Partial config, merged with sensible defaults.
     * @param externalPipeline Optional pre-existing pipeline to reconfigure
     *        instead of creating a new one. Useful so we don't fight with
     *        `CombatScene._renderingPipeline`.
     */
    setup(config: ScenePostFXConfig | undefined, externalPipeline?: DefaultRenderingPipeline): void {
        const c = { ...DEFAULTS, ...(config ?? {}) };
        let pipeline: DefaultRenderingPipeline;

        if (externalPipeline) {
            this.externalPipeline = externalPipeline;
            pipeline = externalPipeline;
        } else {
            // Create our own minimal pipeline.
            this.ownedPipeline?.dispose();
            this.ownedPipeline = new DefaultRenderingPipeline(
                'sceneryPipeline',
                true, // HDR
                this.scene,
                [this.camera],
            );
            pipeline = this.ownedPipeline;
        }

        // Tone mapping (ACES) for cinematic HDR → SDR squash.
        pipeline.imageProcessing.toneMappingEnabled = c.toneMapping;
        pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
        pipeline.imageProcessing.exposure = c.exposure;
        pipeline.imageProcessing.contrast = c.contrast;

        // Vignette — focuses gaze on combat plateau.
        pipeline.imageProcessing.vignetteEnabled = c.vignetteIntensity > 0;
        pipeline.imageProcessing.vignetteWeight = c.vignetteIntensity;
        pipeline.imageProcessing.vignetteCameraFov = (this.camera as any).fov ?? 0.8;
        pipeline.imageProcessing.vignetteColor = new Color4(
            c.vignetteColor[0], c.vignetteColor[1], c.vignetteColor[2], 1,
        );
        pipeline.imageProcessing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        // Bloom — soft glow on highlights.
        pipeline.bloomEnabled = c.bloomWeight > 0;
        pipeline.bloomThreshold = c.bloomThreshold;
        pipeline.bloomWeight = c.bloomWeight;
        pipeline.bloomKernel = 64;
        pipeline.bloomScale = 0.5;

        // Grain — subtle film noise to glue 2D backdrop and 3D props.
        pipeline.grainEnabled = c.grain > 0;
        pipeline.grain.intensity = c.grain;
        pipeline.grain.animated = true;

        // Chromatic aberration — usually off in tactical view, can be cranked
        // during cinematics by SetCinematicMode().
        pipeline.chromaticAberrationEnabled = c.chromaticAberration > 0;
        pipeline.chromaticAberration.aberrationAmount = c.chromaticAberration;

        // FXAA for cleaner sprite edges.
        pipeline.fxaaEnabled = true;
        pipeline.samples = 4;
    }

    /**
     * Boost the look during a cinematic (attack / skill / death camera).
     * Pushes vignette, grain, and chromatic aberration for a dramatic frame.
     */
    setCinematicMode(enabled: boolean): void {
        const pipeline = this.externalPipeline ?? this.ownedPipeline;
        if (!pipeline) return;
        if (enabled) {
            pipeline.imageProcessing.vignetteWeight = Math.max(pipeline.imageProcessing.vignetteWeight, 0.7);
            pipeline.grain.intensity = Math.max(pipeline.grain.intensity, 6);
            pipeline.chromaticAberrationEnabled = true;
            pipeline.chromaticAberration.aberrationAmount = 6;
        } else {
            pipeline.imageProcessing.vignetteWeight = DEFAULTS.vignetteIntensity;
            pipeline.grain.intensity = DEFAULTS.grain;
            pipeline.chromaticAberrationEnabled = DEFAULTS.chromaticAberration > 0;
            pipeline.chromaticAberration.aberrationAmount = DEFAULTS.chromaticAberration;
        }
    }

    dispose(): void {
        this.ownedPipeline?.dispose();
        this.ownedPipeline = null;
        this.externalPipeline = null;
    }
}
