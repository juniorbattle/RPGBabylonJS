import {
    Color3,
    Engine,
    Mesh,
    MeshBuilder,
    Observer,
    Scene,
    StandardMaterial,
    Texture,
    TransformNode,
    Vector3,
} from '@babylonjs/core';
import {
    SceneLayerAsset,
    SceneLayerCameraMode,
    SceneLayerPreset,
} from './SceneLayerTypes';
import { SCENE_LAYER_PRESETS } from '../biomes/magicalForestLayers';

interface ManagedLayer {
    id: string;
    cfg: SceneLayerAsset;
    mesh: Mesh;
    mat: StandardMaterial;
    tex: Texture | null;
    observer: Observer<Scene> | null;
    basePosition: Vector3;
}

type LayerRole = 'background' | 'midground' | 'platformBlendFog' | 'foreground' | 'fxOverlay';

const LAYER_ORDER: Array<{ id: string; role: LayerRole }> = [
    { id: 'background', role: 'background' },
    { id: 'midground', role: 'midground' },
    { id: 'platform_blend_fog', role: 'platformBlendFog' },
    { id: 'foreground_frame', role: 'foreground' },
    { id: 'fx_overlay', role: 'fxOverlay' },
];

export class SceneLayerManager {
    private layers: ManagedLayer[] = [];
    private preset: SceneLayerPreset = SCENE_LAYER_PRESETS.forest;
    private mode: SceneLayerCameraMode = 'front';

    constructor(
        private scene: Scene,
        private root: TransformNode,
        private mapW: number,
        private mapD: number,
        private baseSurfaceY: number = 0
    ) {}

    buildLayers(biome: string, overrides?: Partial<SceneLayerPreset>, mode: SceneLayerCameraMode = this.mode): void {
        this.clearLayers();
        const base = SCENE_LAYER_PRESETS[biome] ?? SCENE_LAYER_PRESETS.forest;
        this.preset = this.mergePreset(base, overrides);
        this.mode = mode;

        for (const entry of LAYER_ORDER) {
            this.buildLayer(entry.id, entry.role, this.preset[entry.role]);
        }
        this.applyCameraMode(mode);
    }

    applyCameraMode(mode: SceneLayerCameraMode): void {
        this.mode = mode;
        for (const layer of this.layers) {
            const modeAlpha = layer.cfg.cameraOpacity?.[mode] ?? layer.cfg.opacity;
            const modeY = layer.cfg.cameraYOffset?.[mode] ?? 0;
            const modeZ = layer.cfg.cameraZOffset?.[mode] ?? 0;
            layer.mat.alpha = modeAlpha;
            layer.mesh.setEnabled(modeAlpha > 0.001);
            layer.mesh.position.copyFrom(layer.basePosition);
            layer.mesh.position.y += modeY;
            layer.mesh.position.z += modeZ;
        }
    }

    setCinematicMode(enabled: boolean): void {
        const factors: Partial<Record<LayerRole, number>> = {
            foreground: 0.35,
            fxOverlay: 0.5,
            platformBlendFog: 0.72,
        };
        for (const layer of this.layers) {
            const factor = factors[layer.mesh.metadata?.layerRole as LayerRole] ?? 1;
            const baseAlpha = layer.cfg.cameraOpacity?.[this.mode] ?? layer.cfg.opacity;
            layer.mat.alpha = enabled ? baseAlpha * factor : baseAlpha;
        }
    }

    getActivePreset(): SceneLayerPreset {
        return this.preset;
    }

    dispose(): void {
        this.clearLayers();
    }

    private buildLayer(id: string, role: LayerRole, cfg: SceneLayerAsset): void {
        if (!cfg.file) return;

        const planeW = this.mapW * cfg.widthScale;
        const planeH = cfg.height;
        const mesh = MeshBuilder.CreatePlane(`sceneLayer_${id}`, { width: planeW, height: planeH }, this.scene);
        const basePosition = this.computePosition(cfg, planeH);

        mesh.position.copyFrom(basePosition);
        mesh.parent = this.root;
        mesh.isPickable = false;
        mesh.renderingGroupId = cfg.renderGroup;
        mesh.metadata = { ...(mesh.metadata ?? {}), layerRole: role };
        if (cfg.billboard) mesh.billboardMode = TransformNode.BILLBOARDMODE_ALL;

        const mat = new StandardMaterial(`sceneLayerMat_${id}_${Date.now()}`, this.scene);
        mat.backFaceCulling = false;
        mat.disableLighting = true;
        mat.specularColor = new Color3(0, 0, 0);
        mat.diffuseColor = new Color3(1, 1, 1);
        mat.emissiveColor = new Color3(...cfg.emissive);
        mat.alpha = cfg.opacity;
        mat.disableDepthWrite = true;
        mat.alphaCutOff = 0.03;

        const alphaKey = cfg.alphaKey ?? 'texture';
        const usesTextureAlpha = alphaKey !== 'none';
        mat.transparencyMode = usesTextureAlpha
            ? StandardMaterial.MATERIAL_ALPHATESTANDBLEND
            : StandardMaterial.MATERIAL_ALPHABLEND;
        if (cfg.blendMode === 'additive' || cfg.blendMode === 'screen') {
            mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
            mat.alphaMode = Engine.ALPHA_ADD;
        }

        const tex = new Texture(
            `/assets/backgrounds/${cfg.file}`,
            this.scene,
            false,
            true,
            Texture.BILINEAR_SAMPLINGMODE,
            undefined,
            () => console.warn(`SceneLayerManager: texture not found - ${cfg.file}`)
        );
        tex.hasAlpha = usesTextureAlpha;
        tex.getAlphaFromRGB = alphaKey === 'black' || alphaKey === 'luminance';
        tex.wrapU = Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = Texture.CLAMP_ADDRESSMODE;
        tex.uScale = cfg.uvScaleX ?? 1;
        tex.vScale = cfg.uvScaleY ?? 1;
        tex.uOffset = cfg.uvOffsetX ?? 0;
        tex.vOffset = cfg.uvOffsetY ?? 0;

        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = usesTextureAlpha;
        mesh.material = mat;

        let observer: Observer<Scene> | null = null;
        if (cfg.scrollSpeedX || cfg.scrollSpeedY) {
            observer = this.scene.onBeforeRenderObservable.add(() => {
                if (mesh.isDisposed()) return;
                const dt = this.scene.getEngine().getDeltaTime() / 1000;
                if (cfg.scrollSpeedX) tex.uOffset += cfg.scrollSpeedX * dt;
                if (cfg.scrollSpeedY) tex.vOffset += cfg.scrollSpeedY * dt;
            });
        }

        this.layers.push({ id, cfg, mesh, mat, tex, observer, basePosition });
    }

    private computePosition(cfg: SceneLayerAsset, planeH: number): Vector3 {
        const y = this.baseSurfaceY + cfg.yOffset + planeH * 0.5;
        const z = this.mapD / 2 + cfg.zOffset;
        return new Vector3(0, y, z);
    }

    private clearLayers(): void {
        for (const layer of this.layers) {
            if (layer.observer) this.scene.onBeforeRenderObservable.remove(layer.observer);
            layer.tex?.dispose();
            layer.mat.dispose();
            layer.mesh.dispose();
        }
        this.layers = [];
    }

    private mergePreset(base: SceneLayerPreset, overrides?: Partial<SceneLayerPreset>): SceneLayerPreset {
        if (!overrides) return base;
        return {
            ...base,
            ...overrides,
            background: { ...base.background, ...(overrides.background ?? {}) },
            midground: { ...base.midground, ...(overrides.midground ?? {}) },
            platformBlendFog: { ...base.platformBlendFog, ...(overrides.platformBlendFog ?? {}) },
            foreground: { ...base.foreground, ...(overrides.foreground ?? {}) },
            fxOverlay: { ...base.fxOverlay, ...(overrides.fxOverlay ?? {}) },
        };
    }
}

export { SCENE_LAYER_PRESETS };
