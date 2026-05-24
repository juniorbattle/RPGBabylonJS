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
        private baseSurfaceY: number = 0,
        private skyVoidColor: [number, number, number] = [0.06, 0.12, 0.08]
    ) {}

    setSkyVoidColor(color: [number, number, number]): void {
        this.skyVoidColor = color;
    }

    buildLayers(biome: string, input?: SceneLayerInput, mode: SceneLayerCameraMode = this.mode): void {
        this.clearLayers();
        const base = SCENE_LAYER_PRESETS[biome] ?? SCENE_LAYER_PRESETS.forest;
        this.preset = this.resolvePreset(base, input, biome);
        this.ensureSkyVoidFill();
        this.validateLayerStack();
        this.mode = mode;

        const sorted = [...this.preset.layers]
            .filter((layer) => layer.enabled !== false && (layer.compositionRole === 'skyVoidFill' || !!layer.file))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        sorted.forEach((layer, index) => this.buildLayer(layer, index));
        this.applyCameraMode(mode);
    }

    /**
     * Runs sanity checks on the active layer stack and prints actionable
     * console warnings. Helps catch misconfigured maps (missing roles,
     * duplicates, wrong renderGroup, broken z-order, etc.) without crashing.
     */
    private validateLayerStack(): void {
        type Issue = { level: 'error' | 'warn'; msg: string };
        const issues: Issue[] = [];
        const layers = this.preset.layers.filter((l) => l.enabled !== false);

        const BG_ROLES: SceneLayerCompositionRole[] = ['skyVoidFill', 'backAtmosphere', 'mainMidground', 'groundBlend'];
        const FG_ROLES: SceneLayerCompositionRole[] = ['foregroundCorners', 'upperCanopy', 'fxOverlay'];

        const byRole = new Map<SceneLayerCompositionRole, SceneLayerAsset[]>();
        const noRole: SceneLayerAsset[] = [];
        for (const layer of layers) {
            if (!layer.compositionRole) {
                noRole.push(layer);
                continue;
            }
            const arr = byRole.get(layer.compositionRole) ?? [];
            arr.push(layer);
            byRole.set(layer.compositionRole, arr);
        }

        // 1. Required roles
        if (!byRole.has('skyVoidFill')) {
            issues.push({ level: 'error', msg: "No 'skyVoidFill' layer present — ensureSkyVoidFill() should have injected one." });
        }
        if (!byRole.has('mainMidground')) {
            issues.push({ level: 'warn', msg: "No 'mainMidground' layer — the scene's main backdrop will be missing." });
        }

        // 2. Duplicate roles
        for (const [role, list] of byRole) {
            if (list.length > 1) {
                issues.push({
                    level: 'warn',
                    msg: `Multiple layers share role '${role}': ${list.map((l) => l.id).join(', ')}. Only one is expected.`,
                });
            }
        }

        // 3. Per-layer sanity checks
        for (const layer of layers) {
            const ctx = `[${layer.id} / ${layer.compositionRole ?? 'no-role'}]`;

            if (!layer.file && layer.compositionRole !== 'skyVoidFill') {
                issues.push({ level: 'warn', msg: `${ctx} has no file but is not 'skyVoidFill' — it will be skipped at build time.` });
            }
            if (layer.opacity === 0 && layer.enabled !== false) {
                issues.push({ level: 'warn', msg: `${ctx} is enabled but opacity is 0 (mesh will be invisible, consider enabled:false).` });
            }
            if (layer.widthScale < 1) {
                issues.push({ level: 'warn', msg: `${ctx} widthScale=${layer.widthScale} (<1) — plane is narrower than the map, expect side clipping.` });
            }
            if (layer.height < 1) {
                issues.push({ level: 'warn', msg: `${ctx} height=${layer.height} (<1) — plane is invisibly thin.` });
            }

            const role = layer.compositionRole;
            if (role && BG_ROLES.includes(role) && layer.renderGroup !== 0) {
                issues.push({ level: 'warn', msg: `${ctx} renderGroup=${layer.renderGroup}, expected 0 for background role.` });
            }
            if (role && FG_ROLES.includes(role) && layer.renderGroup !== 1) {
                issues.push({ level: 'warn', msg: `${ctx} renderGroup=${layer.renderGroup}, expected 1 for foreground role.` });
            }
        }

        // 4. Z-order coherence
        const skyVoid = byRole.get('skyVoidFill')?.[0];
        const back = byRole.get('backAtmosphere')?.[0];
        const mid = byRole.get('mainMidground')?.[0];
        if (skyVoid && back && skyVoid.zOffset <= back.zOffset) {
            issues.push({
                level: 'warn',
                msg: `skyVoidFill zOffset (${skyVoid.zOffset}) should be greater than backAtmosphere zOffset (${back.zOffset}) so it sits behind it.`,
            });
        }
        if (back && mid && back.zOffset <= mid.zOffset) {
            issues.push({
                level: 'warn',
                msg: `backAtmosphere zOffset (${back.zOffset}) should be greater than mainMidground zOffset (${mid.zOffset}).`,
            });
        }

        // 5. No-role layers
        for (const layer of noRole) {
            issues.push({ level: 'warn', msg: `[${layer.id}] has no compositionRole — assign one for proper z-ordering and validation.` });
        }

        if (issues.length === 0) return;
        const errors = issues.filter((i) => i.level === 'error').length;
        const warns = issues.length - errors;
        console.groupCollapsed(
            `[SceneLayerManager] '${this.preset.id}' layer stack: ${errors} error(s), ${warns} warning(s)`
        );
        for (const issue of issues) {
            if (issue.level === 'error') console.error('[X]', issue.msg);
            else console.warn('[!]', issue.msg);
        }
        console.groupEnd();
    }

    /**
     * Guarantees the existence of a `skyVoidFill` layer in the active preset.
     * - If the preset already defines one, normalize its critical properties
     *   so it always renders opaque and behind every other layer.
     * - Otherwise, inject a synthetic solid-color sky void using `skyVoidColor`.
     * This prevents the scene `clearColor` from bleeding through transparent
     * holes in mid/back atmosphere layers (the classic "black band" problem).
     */
    private ensureSkyVoidFill(): void {
        const existing = this.preset.layers.find((l) => l.compositionRole === 'skyVoidFill');
        if (existing) {
            existing.enabled = existing.enabled !== false;
            existing.order = Math.min(existing.order ?? -100, -100);
            existing.opacity = 1;
            existing.renderGroup = 0;
            existing.blendMode = 'alpha';
            existing.alphaKey = existing.file ? (existing.alphaKey ?? 'none') : 'none';
            existing.cameraOpacity = { front: 1, overview: 1, ...(existing.cameraOpacity ?? {}) };
            existing.cameraOpacity.front = 1;
            existing.cameraOpacity.overview = 1;
            return;
        }
        this.preset.layers.unshift(this.makeSyntheticSkyVoidFill());
    }

    private makeSyntheticSkyVoidFill(): SceneLayerAsset {
        return {
            id: 'sky_void_fill_auto',
            name: 'Sky Void Fill (auto)',
            enabled: true,
            order: -100,
            file: null,
            opacity: 1,
            blendMode: 'alpha',
            emissive: [...this.skyVoidColor] as [number, number, number],
            xOffset: 0,
            yOffset: -10,
            zOffset: 50,
            widthScale: 10,
            height: 70,
            billboard: false,
            renderGroup: 0,
            alphaKey: 'none',
            cameraOpacity: { front: 1, overview: 1 },
            parallaxStrength: 0,
            stageFit: 'sky-void',
            compositionRole: 'skyVoidFill',
        };
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
        const isSkyVoid = cfg.compositionRole === 'skyVoidFill';
        if (!cfg.file && !isSkyVoid) return;

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
        // The sky void fill is the only layer that writes depth: it acts as the
        // opaque "backstop" so transparent layers in front composite correctly.
        mat.disableDepthWrite = !isSkyVoid;
        mat.alphaCutOff = 0.03;

        const alphaKey = cfg.alphaKey ?? 'texture';
        const usesTextureAlpha = alphaKey !== 'none' && !!cfg.file;
        mat.transparencyMode = usesTextureAlpha
            ? StandardMaterial.MATERIAL_ALPHATESTANDBLEND
            : StandardMaterial.MATERIAL_ALPHABLEND;
        if (cfg.blendMode === 'additive' || cfg.blendMode === 'screen') {
            mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
            mat.alphaMode = Engine.ALPHA_ADD;
        }
        if (isSkyVoid && !cfg.file) {
            // Solid-color sky void: fully opaque, no texture, no blending.
            mat.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
            mat.alpha = 1;
            mat.alphaMode = Engine.ALPHA_DISABLE;
        }

        let tex: Texture | null = null;
        if (cfg.file) {
            tex = new Texture(
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
        }
        mesh.material = mat;

        let observer: Observer<Scene> | null = null;
        if (tex && (cfg.scrollSpeedX || cfg.scrollSpeedY)) {
            const localTex = tex;
            observer = this.scene.onBeforeRenderObservable.add(() => {
                if (mesh.isDisposed()) return;
                const dt = this.scene.getEngine().getDeltaTime() / 1000;
                if (cfg.scrollSpeedX) localTex.uOffset += cfg.scrollSpeedX * dt;
                if (cfg.scrollSpeedY) localTex.vOffset += cfg.scrollSpeedY * dt;
            });
        }

        this.layers.push({ id: safeId, cfg, mesh, mat, tex, observer, basePosition });
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
            skyVoidFill: byRole('skyVoidFill'),
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
