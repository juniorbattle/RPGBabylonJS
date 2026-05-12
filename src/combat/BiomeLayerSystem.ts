/**
 * BiomeLayerSystem.ts
 * GPA Tactics HD-2D — Système de couches de décor par biome
 *
 * Architecture en 4 layers (arrière → avant) :
 *   Layer 0 — Background principal  : ciel, montagnes, ambiance globale
 *   Layer 1 — Plan intermédiaire    : arbres, rochers, silhouettes
 *   Layer 2 — Foreground frame      : troncs, lianes, premier plan sombre
 *   Layer 3 — FX overlay            : brume, particules, magie
 *
 * Chaque biome définit ses propres assets PNG + paramètres visuels.
 * Le MapEditor peut surcharger ces valeurs via l'onglet "Layers".
 */

import {
    Scene, Mesh, MeshBuilder, StandardMaterial,
    Color3, Texture, TransformNode, Vector3, Observer
} from '@babylonjs/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayerBlendMode = 'alpha' | 'additive' | 'screen' | 'multiply';
export type LayerAlphaKey = 'none' | 'texture' | 'white' | 'black' | 'luminance' | 'magenta';

export interface LayerAsset {
    /** Chemin relatif depuis /assets/backgrounds/ — null = désactivé */
    file:        string | null;
    /** Opacité [0–1] */
    opacity:     number;
    /** Mode de fusion */
    blendMode:   LayerBlendMode;
    /** Couleur d'émission (tint lumineux) */
    emissive:    [number, number, number];
    /** Décalage Y monde (0 = sur le sol procédural) */
    yOffset:     number;
    /** Décalage Z monde (positif = vers caméra) */
    zOffset:     number;
    /** Échelle de la largeur relative à mapW (1.0 = largeur carte × 2) */
    widthScale:  number;
    /** Échelle de la hauteur en unités monde */
    height:      number;
    /** Activer le billboarding (pour FX overlay) */
    billboard:   boolean;
    /** Vitesse d'animation UV horizontale (pour brume animée) */
    scrollSpeedX?: number;
    /** Vitesse d'animation UV verticale */
    scrollSpeedY?: number;
    /** Optional texture crop/zoom, useful for stage-composed raster layers. */
    uvScaleX?: number;
    uvScaleY?: number;
    uvOffsetX?: number;
    uvOffsetY?: number;
    /** Renderering group id */
    renderGroup: number;
    /** Traitement alpha runtime pour les PNG non transparents */
    alphaKey?: LayerAlphaKey;
}

export interface BiomeLayerPreset {
    id:          string;
    /** Layer 0 — Background principal (lointain) */
    background:  LayerAsset;
    /** Layer 1 — Plan intermédiaire (arbres, rochers) */
    midground:   LayerAsset;
    /** Layer 2 — Foreground frame (troncs, lianes) */
    foreground:  LayerAsset;
    /** Layer 3 — FX overlay (brume, particules) */
    fxOverlay:   LayerAsset;
    /** Couleur de particules volumétriques (lucioles) */
    particleColor: [number, number, number];
    particleCount: number;
    particleAlpha: [number, number];
}

// ---------------------------------------------------------------------------
// Presets par biome — valeurs par défaut utilisant les 4 assets fournis
// ---------------------------------------------------------------------------

const DEFAULT_LAYER_ASSET: Omit<LayerAsset, 'file'> = {
    opacity: 1.0,
    blendMode: 'alpha',
    emissive: [0.05, 0.07, 0.05],
    yOffset: 0,
    zOffset: 0,
    widthScale: 1.0,
    height: 60,
    billboard: false,
    renderGroup: 0,
};

export const BIOME_LAYER_PRESETS: Record<string, BiomeLayerPreset> = {

    forest: {
        id: 'forest',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_forest_v3_main.png',
            opacity: 1.0,
            emissive: [1.0, 1.0, 1.0],
            yOffset: -11.5,
            zOffset: 33,
            widthScale: 4.35,
            height: 46,
            uvScaleX: 1,
            uvScaleY: 1,
            uvOffsetX: 0,
            uvOffsetY: 0,
            renderGroup: 0,
            alphaKey: 'none',
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_forest_v3_alpha.png',
            opacity: 0.82,
            emissive: [1.0, 1.0, 1.0],
            yOffset: -11.5,
            zOffset: 25,
            widthScale: 4.35,
            height: 46,
            uvScaleX: 1,
            uvScaleY: 1,
            uvOffsetX: 0,
            uvOffsetY: 0,
            renderGroup: 0,
            alphaKey: 'texture',
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_forest_v3_alpha.png',
            opacity: 0.72,
            emissive: [1.0, 0.96, 0.88],
            yOffset: -13.2,
            zOffset: -6,
            widthScale: 4.55,
            height: 48,
            uvScaleX: 1,
            uvScaleY: 1,
            uvOffsetX: 0,
            uvOffsetY: 0,
            billboard: false,
            renderGroup: 1,
            alphaKey: 'texture',
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_forest_v3_alpha.png',
            opacity: 0.24,
            blendMode: 'additive',
            emissive: [0.38, 0.86, 0.42],
            yOffset: -12.8,
            zOffset: -2,
            widthScale: 4.50,
            height: 47,
            uvScaleX: 1,
            uvScaleY: 1,
            uvOffsetX: 0,
            uvOffsetY: 0,
            billboard: false,
            scrollSpeedX: 0.0015,
            scrollSpeedY: 0.0,
            renderGroup: 1,
            alphaKey: 'texture',
        },
        particleColor: [0.4, 1.0, 0.2],
        particleCount: 22,
        particleAlpha: [0.08, 0.26],
    },

    plains: {
        id: 'plains',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_plains_main.png',
            opacity: 0.92,
            emissive: [0.10, 0.12, 0.06],
            yOffset: 20,
            zOffset: 55,
            widthScale: 1.6,
            height: 60,
            renderGroup: 0,
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_plains_hills.png',
            opacity: 0.88,
            emissive: [0.07, 0.10, 0.04],
            yOffset: 2,
            zOffset: 25,
            widthScale: 1.2,
            height: 28,
            renderGroup: 1,
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_plains_grass.png',
            opacity: 0.75,
            emissive: [0.04, 0.06, 0.02],
            yOffset: -0.5,
            zOffset: -4,
            widthScale: 1.0,
            height: 18,
            renderGroup: 3,
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_plains_wind.png',
            opacity: 0.20,
            blendMode: 'additive',
            emissive: [0.3, 0.4, 0.1],
            yOffset: 2,
            zOffset: 5,
            widthScale: 1.4,
            height: 30,
            scrollSpeedX: 0.006,
            renderGroup: 2,
        },
        particleColor: [1.0, 0.95, 0.5],
        particleCount: 35,
        particleAlpha: [0.15, 0.55],
    },

    mountain: {
        id: 'mountain',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_mountain_main.png',
            opacity: 0.95,
            emissive: [0.06, 0.07, 0.10],
            yOffset: 22,
            zOffset: 55,
            widthScale: 1.5,
            height: 70,
            renderGroup: 0,
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_mountain_rocks.png',
            opacity: 0.85,
            emissive: [0.04, 0.05, 0.07],
            yOffset: 1,
            zOffset: 22,
            widthScale: 1.1,
            height: 36,
            renderGroup: 1,
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_mountain_cliffs.png',
            opacity: 0.80,
            emissive: [0.02, 0.03, 0.04],
            yOffset: -1,
            zOffset: -4,
            widthScale: 1.05,
            height: 24,
            renderGroup: 3,
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_mountain_fog.png',
            opacity: 0.30,
            blendMode: 'additive',
            emissive: [0.2, 0.25, 0.35],
            yOffset: 3,
            zOffset: 10,
            widthScale: 1.5,
            height: 40,
            scrollSpeedX: 0.002,
            renderGroup: 2,
        },
        particleColor: [0.7, 0.85, 1.0],
        particleCount: 28,
        particleAlpha: [0.10, 0.42],
    },

    swamp: {
        id: 'swamp',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_swamp_main.png',
            opacity: 0.92,
            emissive: [0.03, 0.08, 0.04],
            yOffset: 18,
            zOffset: 52,
            widthScale: 1.4,
            height: 60,
            renderGroup: 0,
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_swamp_trees.png',
            opacity: 0.88,
            emissive: [0.02, 0.06, 0.03],
            yOffset: 1,
            zOffset: 24,
            widthScale: 1.1,
            height: 32,
            renderGroup: 1,
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_swamp_roots.png',
            opacity: 0.82,
            emissive: [0.01, 0.04, 0.02],
            yOffset: -0.5,
            zOffset: -4,
            widthScale: 1.05,
            height: 24,
            renderGroup: 3,
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_swamp_mist.png',
            opacity: 0.45,
            blendMode: 'additive',
            emissive: [0.0, 0.5, 0.1],
            yOffset: 2,
            zOffset: 2,
            widthScale: 1.4,
            height: 38,
            scrollSpeedX: 0.003,
            scrollSpeedY: 0.001,
            renderGroup: 2,
        },
        particleColor: [0.2, 1.0, 0.3],
        particleCount: 68,
        particleAlpha: [0.28, 0.85],
    },

    ruins: {
        id: 'ruins',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_ruins_main.png',
            opacity: 0.93,
            emissive: [0.10, 0.06, 0.03],
            yOffset: 20,
            zOffset: 55,
            widthScale: 1.5,
            height: 65,
            renderGroup: 0,
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_ruins_pillars.png',
            opacity: 0.85,
            emissive: [0.07, 0.04, 0.02],
            yOffset: 1,
            zOffset: 24,
            widthScale: 1.1,
            height: 34,
            renderGroup: 1,
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_ruins_arches.png',
            opacity: 0.80,
            emissive: [0.04, 0.02, 0.01],
            yOffset: -1,
            zOffset: -5,
            widthScale: 1.05,
            height: 26,
            renderGroup: 3,
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_ruins_dust.png',
            opacity: 0.28,
            blendMode: 'additive',
            emissive: [0.5, 0.3, 0.1],
            yOffset: 3,
            zOffset: 5,
            widthScale: 1.3,
            height: 36,
            scrollSpeedX: 0.003,
            renderGroup: 2,
        },
        particleColor: [1.0, 0.7, 0.3],
        particleCount: 42,
        particleAlpha: [0.18, 0.65],
    },

    city: {
        id: 'city',
        background: {
            ...DEFAULT_LAYER_ASSET,
            file: 'bg_city_main.png',
            opacity: 0.92,
            emissive: [0.06, 0.07, 0.12],
            yOffset: 22,
            zOffset: 55,
            widthScale: 1.6,
            height: 68,
            renderGroup: 0,
        },
        midground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'mid_city_buildings.png',
            opacity: 0.85,
            emissive: [0.04, 0.05, 0.08],
            yOffset: 2,
            zOffset: 25,
            widthScale: 1.2,
            height: 38,
            renderGroup: 1,
        },
        foreground: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fore_city_walls.png',
            opacity: 0.78,
            emissive: [0.02, 0.02, 0.04],
            yOffset: -1,
            zOffset: -5,
            widthScale: 1.05,
            height: 24,
            renderGroup: 3,
        },
        fxOverlay: {
            ...DEFAULT_LAYER_ASSET,
            file: 'fx_city_smoke.png',
            opacity: 0.22,
            blendMode: 'additive',
            emissive: [0.2, 0.2, 0.35],
            yOffset: 4,
            zOffset: 8,
            widthScale: 1.4,
            height: 42,
            scrollSpeedX: 0.005,
            renderGroup: 2,
        },
        particleColor: [0.8, 0.9, 1.0],
        particleCount: 32,
        particleAlpha: [0.12, 0.48],
    },
};

// ---------------------------------------------------------------------------
// BiomeLayerManager — gère la création et le cycle de vie des layers en scène
// ---------------------------------------------------------------------------

interface LayerInstance {
    mesh:     Mesh;
    mat:      StandardMaterial;
    tex:      Texture | null;
    observer: Observer<Scene> | null;
}

export class BiomeLayerManager {
    private scene:     Scene;
    private root:      TransformNode;
    private layers:    LayerInstance[] = [];
    private preset:    BiomeLayerPreset;
    private mapW:      number;
    private mapD:      number;
    private baseSurfaceY: number;
    private readonly fallbackFiles: Record<string, string> = {
        bg: 'bg_forest_v3_main.png',
        mid: 'mid_forest_v3_alpha.png',
        fx: 'fx_forest_v3_alpha.png',
        fore: 'fore_forest_v3_alpha.png',
    };

    constructor(scene: Scene, root: TransformNode, mapW: number, mapD: number, baseSurfaceY: number) {
        this.scene        = scene;
        this.root         = root;
        this.mapW         = mapW;
        this.mapD         = mapD;
        this.baseSurfaceY = baseSurfaceY;
        this.preset       = BIOME_LAYER_PRESETS['forest'];
    }

    /**
     * Construit tous les layers pour un biome donné.
     * Accepte un preset partiel pour la surcharge depuis le MapEditor.
     */
    buildLayers(biome: string, overrides?: Partial<BiomeLayerPreset>): void {
        this.clearLayers();

        const base = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS['forest'];
        this.preset = overrides ? this.mergePreset(base, overrides) : base;

        const { background, midground, foreground, fxOverlay } = this.preset;

        // Ordre de rendu : background d'abord, FX en dernier avant foreground
        this.buildLayer('bg',   background);
        this.buildLayer('mid',  midground);
        this.buildLayer('fx',   fxOverlay);
        this.buildLayer('fore', foreground);
    }

    private buildLayer(id: string, cfg: LayerAsset): void {
        if (!cfg.file) return;

        const planeW = this.mapW * cfg.widthScale;
        const planeH = cfg.height;

        const mesh = MeshBuilder.CreatePlane(`layer_${id}`, { width: planeW, height: planeH }, this.scene);

        // Position : centré, hauteur basée sur yOffset depuis le sol
        const centerX = 0;
        const posY    = this.baseSurfaceY + cfg.yOffset + planeH * 0.5;
        const posZ    = this.mapD / 2 + cfg.zOffset;

        mesh.position    = new Vector3(centerX, posY, posZ);
        mesh.parent      = this.root;
        mesh.isPickable  = false;
        mesh.renderingGroupId = cfg.renderGroup;
        if (cfg.billboard) mesh.billboardMode = 7;

        const mat = new StandardMaterial(`layerMat_${id}_${Date.now()}`, this.scene);
        mat.backFaceCulling  = false;
        mat.disableLighting  = true;
        mat.specularColor    = new Color3(0, 0, 0);
        mat.diffuseColor     = new Color3(1, 1, 1);
        mat.emissiveColor    = new Color3(...cfg.emissive);
        mat.alpha            = cfg.opacity;
        const alphaKey = this.resolveAlphaKey(id, cfg);
        const usesTextureAlpha = alphaKey !== 'none';
        mat.disableDepthWrite = (cfg.renderGroup >= 1 || usesTextureAlpha);
        mat.alphaCutOff = 0.04;

        if (cfg.blendMode === 'additive') {
            mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
            mat.alphaMode = 6; // ALPHA_ADD
        } else {
            mat.transparencyMode = usesTextureAlpha
                ? StandardMaterial.MATERIAL_ALPHATESTANDBLEND
                : StandardMaterial.MATERIAL_ALPHABLEND;
        }

        const texPath = `/assets/backgrounds/${cfg.file}`;
        const tex = new Texture(
            texPath, this.scene, false, true, Texture.BILINEAR_SAMPLINGMODE,
            () => {}, () => { console.warn(`BiomeLayer: texture not found — ${texPath}`); }
        );
        tex.hasAlpha = usesTextureAlpha;
        tex.getAlphaFromRGB = alphaKey === 'black' || alphaKey === 'luminance';
        tex.wrapU = Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = Texture.CLAMP_ADDRESSMODE;
        tex.uScale = cfg.uvScaleX ?? 1;
        tex.vScale = cfg.uvScaleY ?? 1;
        tex.uOffset = cfg.uvOffsetX ?? 0;
        tex.vOffset = cfg.uvOffsetY ?? 0;

        mat.diffuseTexture           = tex;
        mat.useAlphaFromDiffuseTexture = usesTextureAlpha;
        mesh.material                = mat;

        // Animation UV scroll (pour brume / FX)
        let observer: Observer<Scene> | null = null;
        if (cfg.scrollSpeedX || cfg.scrollSpeedY) {
            observer = this.scene.onBeforeRenderObservable.add(() => {
                if (mesh.isDisposed()) return;
                const dt = this.scene.getEngine().getDeltaTime() / 1000;
                if (cfg.scrollSpeedX) tex.uOffset += cfg.scrollSpeedX * dt;
                if (cfg.scrollSpeedY) tex.vOffset += cfg.scrollSpeedY * dt;
            });
        }

        this.layers.push({ mesh, mat, tex, observer });
    }

    private resolveAlphaKey(_id: string, cfg: LayerAsset): LayerAlphaKey {
        return cfg.alphaKey ?? 'none';
    }

    private clearLayers(): void {
        for (const layer of this.layers) {
            if (layer.observer) {
                this.scene.onBeforeRenderObservable.remove(layer.observer);
            }
            layer.tex?.dispose();
            layer.mat.dispose();
            layer.mesh.dispose();
        }
        this.layers = [];
    }

    /** Cinématique : assombrit les layers de foreground/FX */
    setCinematicMode(enabled: boolean): void {
        // layers[2] = fx, layers[3] = foreground
        if (this.layers[3]) {
            this.layers[3].mat.alpha = enabled
                ? this.preset.foreground.opacity * 0.18
                : this.preset.foreground.opacity;
        }
        if (this.layers[2]) {
            this.layers[2].mat.alpha = enabled
                ? this.preset.fxOverlay.opacity * 0.35
                : this.preset.fxOverlay.opacity;
        }
    }

    /** Retourne le preset actif (pour export MapEditor) */
    getActivePreset(): BiomeLayerPreset { return this.preset; }

    dispose(): void { this.clearLayers(); }

    private mergePreset(base: BiomeLayerPreset, overrides: Partial<BiomeLayerPreset>): BiomeLayerPreset {
        return {
            ...base,
            ...overrides,
            background: { ...base.background, ...(overrides.background ?? {}) },
            midground:  { ...base.midground,  ...(overrides.midground  ?? {}) },
            foreground: { ...base.foreground, ...(overrides.foreground ?? {}) },
            fxOverlay:  { ...base.fxOverlay,  ...(overrides.fxOverlay  ?? {}) },
        };
    }
}
