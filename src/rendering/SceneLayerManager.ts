import {
    Color3,
    DynamicTexture,
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
    SceneLayerCompositionRole,
    SceneLayerInput,
    SceneLayerPreset,
    SceneLayerStack,
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

const LEGACY_ORDER: Array<{ key: keyof SceneLayerPreset; role: SceneLayerCompositionRole; id: string; name: string; order: number }> = [
    { key: 'background', role: 'backAtmosphere', id: 'back_atmosphere', name: 'Back atmosphere', order: 0 },
    { key: 'backAtmosphere', role: 'backAtmosphere', id: 'back_atmosphere', name: 'Back atmosphere', order: 0 },
    { key: 'midground', role: 'mainMidground', id: 'main_midground', name: 'Main midground', order: 10 },
    { key: 'mainMidground', role: 'mainMidground', id: 'main_midground', name: 'Main midground', order: 10 },
    { key: 'platformBlendFog', role: 'groundBlend', id: 'ground_blend', name: 'Ground blend', order: 20 },
    { key: 'groundBlend', role: 'groundBlend', id: 'ground_blend', name: 'Ground blend', order: 20 },
    { key: 'foreground', role: 'foregroundCorners', id: 'foreground_corners', name: 'Foreground corners', order: 30 },
    { key: 'foregroundCorners', role: 'foregroundCorners', id: 'foreground_corners', name: 'Foreground corners', order: 30 },
    { key: 'upperCanopy', role: 'upperCanopy', id: 'upper_canopy', name: 'Upper canopy', order: 40 },
    { key: 'fxOverlay', role: 'fxOverlay', id: 'fx_overlay', name: 'FX overlay', order: 50 },
];

const cloneLayer = (layer: SceneLayerAsset): SceneLayerAsset => ({
    ...layer,
    emissive: [...layer.emissive] as [number, number, number],
    cameraOpacity: layer.cameraOpacity ? { ...layer.cameraOpacity } : undefined,
    cameraYOffset: layer.cameraYOffset ? { ...layer.cameraYOffset } : undefined,
    cameraZOffset: layer.cameraZOffset ? { ...layer.cameraZOffset } : undefined,
});

const mergeLayer = (base: SceneLayerAsset, override: Partial<SceneLayerAsset>): SceneLayerAsset => ({
    ...base,
    ...override,
    emissive: (override.emissive ?? base.emissive) as [number, number, number],
    cameraOpacity: { ...(base.cameraOpacity ?? {}), ...(override.cameraOpacity ?? {}) },
    cameraYOffset: { ...(base.cameraYOffset ?? {}), ...(override.cameraYOffset ?? {}) },
    cameraZOffset: { ...(base.cameraZOffset ?? {}), ...(override.cameraZOffset ?? {}) },
});

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

    buildLayers(biome: string, input?: SceneLayerInput, mode: SceneLayerCameraMode = this.mode): void {
        this.clearLayers();
        const base = SCENE_LAYER_PRESETS[biome] ?? SCENE_LAYER_PRESETS.forest;
        this.preset = this.resolvePreset(base, input, biome);
        this.mode = mode;

        const sorted = [...this.preset.layers]
            .filter((layer) => layer.enabled !== false && (!!layer.file || !!layer.proceduralTexture))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        sorted.forEach((layer, index) => this.buildLayer(layer, index));
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
        for (const layer of this.layers) {
            const baseAlpha = layer.cfg.cameraOpacity?.[this.mode] ?? layer.cfg.opacity;
            const role = layer.cfg.compositionRole;
            const factor = role === 'foregroundCorners' ? 0.35
                : role === 'upperCanopy' ? 0.45
                : role === 'fxOverlay' ? 0.5
                : role === 'groundBlend' ? 0.72
                : 1;
            layer.mat.alpha = enabled ? baseAlpha * factor : baseAlpha;
        }
    }

    getActivePreset(): SceneLayerPreset {
        return this.preset;
    }

    dispose(): void {
        this.clearLayers();
    }

    private buildLayer(cfg: SceneLayerAsset, index: number): void {
        if (!cfg.file && !cfg.proceduralTexture) return;

        const planeW = this.mapW * cfg.widthScale;
        const planeH = cfg.height;
        const safeId = cfg.id || `layer_${index}`;
        const mesh = MeshBuilder.CreatePlane(`sceneLayer_${safeId}`, { width: planeW, height: planeH }, this.scene);
        const basePosition = this.computePosition(cfg, planeH);

        mesh.position.copyFrom(basePosition);
        mesh.parent = this.root;
        mesh.isPickable = false;
        mesh.renderingGroupId = cfg.renderGroup;
        mesh.metadata = { ...(mesh.metadata ?? {}), layerId: safeId, layerRole: cfg.compositionRole ?? 'custom' };
        if (cfg.billboard) mesh.billboardMode = TransformNode.BILLBOARDMODE_ALL;

        const mat = new StandardMaterial(`sceneLayerMat_${safeId}_${Date.now()}`, this.scene);
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

        let tex: Texture;
        if (cfg.proceduralTexture === 'godrays') {
            tex = this.generateGodRayTexture(safeId);
            tex.hasAlpha = true;
        } else {
            const fileTex = new Texture(
                `/assets/backgrounds/${cfg.file}`,
                this.scene,
                false,
                true,
                Texture.BILINEAR_SAMPLINGMODE,
                undefined,
                () => console.warn(`SceneLayerManager: texture not found - ${cfg.file}`)
            );
            fileTex.hasAlpha = usesTextureAlpha;
            fileTex.getAlphaFromRGB = alphaKey === 'black' || alphaKey === 'luminance';
            tex = fileTex;
        }
        const wrap = cfg.wrapMode === 'wrap' ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
        tex.wrapU = wrap;
        tex.wrapV = wrap;
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

        this.layers.push({ id: safeId, cfg, mesh, mat, tex, observer, basePosition });
    }

    private generateGodRayTexture(id: string): DynamicTexture {
        const size = 512;
        const tex = new DynamicTexture(`godrayTex_${id}`, { width: size, height: size }, this.scene, false);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, size, size);

        const beams = 5;
        const spacing = size / beams;
        const halfW = spacing * 0.17;
        const shear = size * 0.24;

        ctx.save();
        ctx.transform(1, 0, shear / size, 1, 0, 0);
        for (let i = -2; i <= beams + 2; i++) {
            const cx = (i + 0.5) * spacing;
            const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
            grad.addColorStop(0, 'rgba(255,236,180,0)');
            grad.addColorStop(0.5, 'rgba(255,242,205,0.55)');
            grad.addColorStop(1, 'rgba(255,236,180,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - halfW, -shear, halfW * 2, size + shear * 2);
        }
        ctx.restore();

        ctx.globalCompositeOperation = 'destination-in';
        const mask = ctx.createLinearGradient(0, 0, 0, size);
        mask.addColorStop(0, 'rgba(0,0,0,0)');
        mask.addColorStop(0.18, 'rgba(0,0,0,1)');
        mask.addColorStop(0.7, 'rgba(0,0,0,0.5)');
        mask.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mask;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';

        tex.update(false);
        return tex;
    }

    private computePosition(cfg: SceneLayerAsset, planeH: number): Vector3 {
        const x = cfg.xOffset ?? 0;
        const y = this.baseSurfaceY + cfg.yOffset + planeH * 0.5;
        const z = this.mapD / 2 + cfg.zOffset;
        return new Vector3(x, y, z);
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

    private resolvePreset(base: SceneLayerPreset, input: SceneLayerInput | undefined, biome: string): SceneLayerPreset {
        const baseStack = this.normalizeStack(base, biome);
        if (!input) return this.withLegacyAliases(baseStack);

        if (Array.isArray((input as SceneLayerStack).layers)) {
            const explicitLayers = input as SceneLayerStack;
            const fallback = explicitLayers.layers.length === 0 ? undefined : baseStack;
            const stack = this.normalizeStack(explicitLayers, biome, fallback);
            return this.withLegacyAliases(stack);
        }

        const legacy = this.legacyOverridesToStack(input as Partial<SceneLayerPreset>, baseStack);
        return this.withLegacyAliases(legacy);
    }

    private normalizeStack(input: SceneLayerStack, biome: string, fallback?: SceneLayerPreset): SceneLayerPreset {
        const fallbackLayers = fallback?.layers ?? [];
        const fallbackById = new Map(fallbackLayers.map((layer) => [layer.id, layer]));
        const explicitEmpty = Array.isArray(input.layers) && input.layers.length === 0;
        const layers = input.layers.map((raw, index) => {
            const base = fallbackById.get(raw.id);
            const merged = base ? mergeLayer(base, raw) : this.fillLayerDefaults(raw, index);
            return cloneLayer(merged);
        });

        return {
            id: input.id ?? fallback?.id ?? `${biome}_layers`,
            biome: input.biome ?? biome,
            layers,
            particleColor: input.particleColor ?? fallback?.particleColor ?? [0.4, 1, 0.2],
            particleCount: input.particleCount ?? (explicitEmpty ? 0 : fallback?.particleCount ?? 18),
            particleAlpha: input.particleAlpha ?? fallback?.particleAlpha ?? [0.06, 0.2],
        };
    }

    private legacyOverridesToStack(overrides: Partial<SceneLayerPreset>, base: SceneLayerPreset): SceneLayerPreset {
        const byRole = new Map<SceneLayerCompositionRole, SceneLayerAsset>();
        for (const layer of base.layers) {
            if (layer.compositionRole) byRole.set(layer.compositionRole, layer);
        }

        const consumed = new Set<SceneLayerCompositionRole>();
        const layers = base.layers.map((baseLayer) => {
            const role = baseLayer.compositionRole;
            if (!role) return cloneLayer(baseLayer);
            const legacy = LEGACY_ORDER
                .filter((entry) => entry.role === role)
                .map((entry) => overrides[entry.key])
                .filter(Boolean)
                .reduce((acc, value) => ({ ...acc, ...(value as Partial<SceneLayerAsset>) }), {} as Partial<SceneLayerAsset>);
            consumed.add(role);
            return cloneLayer(mergeLayer(baseLayer, legacy));
        });

        for (const entry of LEGACY_ORDER) {
            if (consumed.has(entry.role)) continue;
            const override = overrides[entry.key] as Partial<SceneLayerAsset> | undefined;
            if (!override) continue;
            const source = byRole.get(entry.role);
            layers.push(this.fillLayerDefaults({
                ...(source ?? {}),
                ...override,
                id: source?.id ?? entry.id,
                name: source?.name ?? entry.name,
                order: source?.order ?? entry.order,
                compositionRole: entry.role,
            } as Partial<SceneLayerAsset>, layers.length));
        }

        return this.withLegacyAliases({
            ...base,
            ...overrides,
            layers,
        });
    }

    private fillLayerDefaults(raw: Partial<SceneLayerAsset>, index: number): SceneLayerAsset {
        return {
            id: raw.id ?? `custom_layer_${index + 1}`,
            name: raw.name ?? `Layer ${index + 1}`,
            enabled: raw.enabled ?? true,
            order: raw.order ?? index * 10,
            file: raw.file ?? null,
            opacity: raw.opacity ?? 1,
            blendMode: raw.blendMode ?? 'alpha',
            emissive: (raw.emissive ?? [1, 1, 1]) as [number, number, number],
            xOffset: raw.xOffset ?? 0,
            yOffset: raw.yOffset ?? 0,
            zOffset: raw.zOffset ?? 0,
            widthScale: raw.widthScale ?? 1,
            height: raw.height ?? 36,
            billboard: raw.billboard ?? false,
            renderGroup: raw.renderGroup ?? 0,
            alphaKey: raw.alphaKey ?? 'texture',
            scrollSpeedX: raw.scrollSpeedX ?? 0,
            scrollSpeedY: raw.scrollSpeedY ?? 0,
            wrapMode: raw.wrapMode,
            proceduralTexture: raw.proceduralTexture,
            uvScaleX: raw.uvScaleX,
            uvScaleY: raw.uvScaleY,
            uvOffsetX: raw.uvOffsetX,
            uvOffsetY: raw.uvOffsetY,
            cameraOpacity: raw.cameraOpacity ? { ...raw.cameraOpacity } : undefined,
            cameraYOffset: raw.cameraYOffset ? { ...raw.cameraYOffset } : undefined,
            cameraZOffset: raw.cameraZOffset ? { ...raw.cameraZOffset } : undefined,
            parallaxStrength: raw.parallaxStrength ?? 0,
            stageFit: raw.stageFit,
            compositionRole: raw.compositionRole,
        };
    }

    private withLegacyAliases(preset: SceneLayerPreset): SceneLayerPreset {
        const byRole = (role: SceneLayerCompositionRole): SceneLayerAsset | undefined =>
            preset.layers.find((layer) => layer.compositionRole === role);
        return {
            ...preset,
            backAtmosphere: byRole('backAtmosphere'),
            mainMidground: byRole('mainMidground'),
            groundBlend: byRole('groundBlend'),
            foregroundCorners: byRole('foregroundCorners'),
            upperCanopy: byRole('upperCanopy'),
            fxOverlay: byRole('fxOverlay'),
            background: byRole('backAtmosphere'),
            midground: byRole('mainMidground'),
            platformBlendFog: byRole('groundBlend'),
            foreground: byRole('foregroundCorners'),
        };
    }
}

export { SCENE_LAYER_PRESETS };
