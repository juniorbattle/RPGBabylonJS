import { SCENE_LAYER_PRESETS as BIOME_LAYER_PRESETS } from '../rendering/SceneLayerManager';
import type {
    SceneLayerAlphaKey,
    SceneLayerAsset,
    SceneLayerBlendMode,
    SceneLayerCompositionRole,
    SceneLayerPreset,
    SceneLayerStageFit,
    SceneLayerStack,
} from '../rendering/SceneLayerTypes';

type LegacyLayerKey = 'background' | 'midground' | 'platformBlendFog' | 'foreground';

const LEGACY_TO_ROLE: Record<LegacyLayerKey, SceneLayerCompositionRole> = {
    background: 'backAtmosphere',
    midground: 'mainMidground',
    platformBlendFog: 'groundBlend',
    foreground: 'foregroundCorners',
};

const ROLE_LABELS: Partial<Record<SceneLayerCompositionRole, string>> = {
    backAtmosphere: 'Back atmosphere',
    mainMidground: 'Main midground',
    groundBlend: 'Ground blend',
    foregroundCorners: 'Foreground corners',
    upperCanopy: 'Upper canopy',
    fxOverlay: 'FX overlay',
};

const DEFAULT_PARTICLE_COLOR: [number, number, number] = [0.4, 1, 0.2];
const DEFAULT_PARTICLE_ALPHA: [number, number] = [0.06, 0.2];

type LayerConfigPresetKey = 'back' | 'mid' | 'ground' | 'frame' | 'canopy' | 'fx';

interface LayerConfigPreset {
    key: LayerConfigPresetKey;
    label: string;
    title: string;
    patch: Partial<SceneLayerAsset>;
}

const LAYER_CONFIG_PRESETS: LayerConfigPreset[] = [
    {
        key: 'back',
        label: 'Back',
        title: 'Fond discret: brume, lointain, atmosphere',
        patch: {
            opacity: 0.28,
            blendMode: 'additive',
            emissive: [0.24, 0.62, 0.34],
            xOffset: 0,
            yOffset: -6,
            zOffset: 42,
            widthScale: 5,
            height: 38,
            renderGroup: 0,
            cameraOpacity: { front: 0.3, overview: 0.2 },
            parallaxStrength: 0.03,
            scrollSpeedX: 0.0005,
            scrollSpeedY: 0,
            stageFit: 'full-stage',
        },
    },
    {
        key: 'mid',
        label: 'Mid',
        title: 'Layer principal: cadre la clairiere et porte la scene',
        patch: {
            opacity: 1,
            blendMode: 'alpha',
            emissive: [1, 1, 1],
            xOffset: 0,
            yOffset: -8,
            zOffset: 27,
            widthScale: 4.8,
            height: 38,
            renderGroup: 0,
            cameraOpacity: { front: 1, overview: 0.88 },
            parallaxStrength: 0.07,
            scrollSpeedX: 0,
            scrollSpeedY: 0,
            stageFit: 'full-stage',
        },
    },
    {
        key: 'ground',
        label: 'Ground',
        title: 'Raccord sol: brume basse sous et autour de la grille',
        patch: {
            opacity: 0.46,
            blendMode: 'additive',
            emissive: [0.35, 0.88, 0.42],
            xOffset: 0,
            yOffset: -11,
            zOffset: 12,
            widthScale: 4.7,
            height: 26,
            renderGroup: 0,
            cameraOpacity: { front: 0.5, overview: 0.28 },
            parallaxStrength: 0.04,
            scrollSpeedX: 0.001,
            scrollSpeedY: 0,
            stageFit: 'lower-stage',
        },
    },
    {
        key: 'frame',
        label: 'Frame',
        title: 'Premier plan: coins et bords proches camera',
        patch: {
            opacity: 0.58,
            blendMode: 'alpha',
            emissive: [1, 1, 1],
            xOffset: 0,
            yOffset: -8.5,
            zOffset: -5,
            widthScale: 5,
            height: 40,
            renderGroup: 1,
            cameraOpacity: { front: 0.62, overview: 0.24 },
            parallaxStrength: 0.22,
            scrollSpeedX: 0,
            scrollSpeedY: 0,
            stageFit: 'foreground-frame',
        },
    },
    {
        key: 'canopy',
        label: 'Canopy',
        title: 'Cadre haut: branches, feuillage et lianes',
        patch: {
            opacity: 0.36,
            blendMode: 'alpha',
            emissive: [1, 1, 1],
            xOffset: 0,
            yOffset: 8,
            zOffset: -3,
            widthScale: 4.5,
            height: 23,
            renderGroup: 1,
            cameraOpacity: { front: 0.38, overview: 0.16 },
            parallaxStrength: 0.18,
            scrollSpeedX: 0,
            scrollSpeedY: 0,
            stageFit: 'foreground-frame',
        },
    },
    {
        key: 'fx',
        label: 'FX',
        title: 'Overlay leger: particules, rayons, voile magique',
        patch: {
            opacity: 0.16,
            blendMode: 'additive',
            emissive: [0.32, 0.9, 0.36],
            xOffset: 0,
            yOffset: -8,
            zOffset: -2,
            widthScale: 4.9,
            height: 39,
            renderGroup: 1,
            cameraOpacity: { front: 0.16, overview: 0.1 },
            parallaxStrength: 0.16,
            scrollSpeedX: 0.0015,
            scrollSpeedY: 0,
            stageFit: 'fx-overlay',
        },
    },
];

const cloneLayer = (layer: SceneLayerAsset): SceneLayerAsset => ({
    ...layer,
    emissive: [...layer.emissive] as [number, number, number],
    cameraOpacity: layer.cameraOpacity ? { ...layer.cameraOpacity } : undefined,
    cameraYOffset: layer.cameraYOffset ? { ...layer.cameraYOffset } : undefined,
    cameraZOffset: layer.cameraZOffset ? { ...layer.cameraZOffset } : undefined,
});

const cloneStack = (stack: SceneLayerPreset): SceneLayerPreset => withLegacyAliases({
    ...stack,
    layers: stack.layers.map(cloneLayer),
    particleColor: [...stack.particleColor] as [number, number, number],
    particleAlpha: [...stack.particleAlpha] as [number, number],
});

function withLegacyAliases(stack: SceneLayerPreset): SceneLayerPreset {
    const byRole = (role: SceneLayerCompositionRole): SceneLayerAsset | undefined =>
        stack.layers.find(layer => layer.compositionRole === role);
    return {
        ...stack,
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

export class MapEditorLayersTab {
    private container: HTMLElement;
    private currentBiome: string;
    private previewCanvas: HTMLCanvasElement | null = null;
    private stacks: Map<string, SceneLayerPreset> = new Map();
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private previewToken = 0;

    onLayerChange?: (biome: string, stack: SceneLayerPreset) => void;

    constructor(
        private editorRef: { currentBiome: string },
        private availableFiles: string[],
        parentEl: HTMLElement
    ) {
        this.currentBiome = editorRef.currentBiome;
        this.container = this.buildUI(parentEl);
        this.setBiome(this.currentBiome);
    }

    private buildUI(parent: HTMLElement): HTMLElement {
        parent.innerHTML = '';
        parent.style.padding = '10px 13px';
        parent.innerHTML = `
        <style>
        #tab-layers .layer-toolbar {
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:6px;
            margin:8px 0 10px;
        }
        #tab-layers .layer-btn {
            border:1px solid rgba(255,255,255,0.08);
            border-radius:5px;
            background:rgba(255,255,255,0.06);
            color:#d6e2ee;
            padding:7px 8px;
            font-size:10px;
            font-weight:800;
            cursor:pointer;
        }
        #tab-layers .layer-btn.primary { background:#18351f;color:#74e8a0; }
        #tab-layers .layer-btn.danger { color:#ff9f9f; }
        #tab-layers .layer-card {
            background:rgba(255,255,255,0.045);
            border:1px solid rgba(255,255,255,0.07);
            border-radius:7px;
            margin-bottom:9px;
            overflow:hidden;
        }
        #tab-layers .layer-header {
            display:grid;
            grid-template-columns:auto auto 1fr auto auto auto auto;
            align-items:center;
            gap:6px;
            padding:8px;
            background:rgba(3,8,14,0.48);
        }
        #tab-layers .layer-name {
            min-width:0;
            background:rgba(255,255,255,0.06);
            color:#e6eef7;
            border:1px solid rgba(255,255,255,0.08);
            border-radius:4px;
            padding:4px 6px;
            font-size:10px;
            font-weight:800;
        }
        #tab-layers .layer-thumb {
            width:38px;
            height:22px;
            object-fit:cover;
            border-radius:4px;
            border:1px solid rgba(255,255,255,0.12);
            background:#070a10;
        }
        #tab-layers .icon-btn {
            width:24px;
            height:24px;
            border:1px solid rgba(255,255,255,0.08);
            border-radius:5px;
            background:rgba(255,255,255,0.06);
            color:#c9d6e4;
            cursor:pointer;
            font-size:11px;
            font-weight:900;
        }
        #tab-layers .layer-body {
            padding:8px 10px 10px;
            border-top:1px solid rgba(255,255,255,0.05);
        }
        #tab-layers .preset-strip {
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:5px;
            margin-bottom:8px;
        }
        #tab-layers .preset-btn {
            border:1px solid rgba(124,166,220,0.18);
            border-radius:5px;
            background:rgba(35,55,82,0.35);
            color:#bcd3ee;
            padding:5px 4px;
            font-size:9px;
            font-weight:900;
            cursor:pointer;
        }
        #tab-layers .preset-btn:hover {
            border-color:rgba(111,176,255,0.45);
            background:rgba(52,91,136,0.52);
            color:#f0f7ff;
        }
        #tab-layers .lrow {
            display:flex;
            align-items:center;
            gap:6px;
            margin-bottom:6px;
        }
        #tab-layers .lrow label {
            flex:0 0 72px;
            font-size:9px;
            color:#7d8ca1;
            text-transform:uppercase;
            letter-spacing:.08em;
            font-weight:800;
        }
        #tab-layers .lrow select,
        #tab-layers .lrow input[type=text],
        #tab-layers .lrow input[type=number] {
            flex:1;
            min-width:0;
            background:rgba(255,255,255,0.06);
            color:#c4ccd6;
            border:1px solid rgba(255,255,255,0.08);
            border-radius:4px;
            padding:4px 6px;
            font-size:10px;
        }
        #tab-layers input[type=range] {
            flex:1;
            -webkit-appearance:none;
            height:3px;
            background:rgba(255,255,255,0.12);
            border-radius:2px;
            outline:none;
        }
        #tab-layers input[type=range]::-webkit-slider-thumb {
            -webkit-appearance:none;
            width:10px;
            height:10px;
            background:#5a8fcc;
            border-radius:50%;
            cursor:pointer;
        }
        #tab-layers .val {
            min-width:38px;
            text-align:right;
            font-size:9px;
            color:#dce8f4;
            font-weight:800;
        }
        #tab-layers .layer-status {
            background:rgba(2,6,12,0.58);
            border:1px solid rgba(255,255,255,0.07);
            border-radius:6px;
            padding:8px 10px;
            margin-bottom:10px;
            font-size:9px;
            color:#8fa0b7;
            line-height:1.55;
        }
        #tab-layers .layer-preview-wrap {
            margin-bottom:10px;
        }
        #tab-layers .layer-preview-title {
            font-size:9px;
            color:#4a6a8a;
            letter-spacing:.1em;
            text-transform:uppercase;
            margin-bottom:5px;
            font-weight:800;
        }
        </style>

        <div class="layer-status">
            <div class="lrow" style="margin-bottom:0;">
                <label>Biome</label>
                <select id="layerBiomeSelect">
                    ${Object.keys(BIOME_LAYER_PRESETS).map(b => `<option value="${b}">${b}</option>`).join('')}
                </select>
            </div>
            <div style="margin-top:7px;">
                Pile libre de layers. Ajoute, duplique, ordonne et ajuste les plans sans bloquer les clics grille.
            </div>
        </div>

        <div class="layer-toolbar">
            <button id="btnAddSceneLayer" class="layer-btn primary">+ Ajouter layer</button>
            <button id="btnClearSceneLayers" class="layer-btn danger">Vider layers</button>
        </div>

        <div class="layer-preview-wrap">
            <div class="layer-preview-title">Preview composition</div>
            <canvas id="layersPreviewCanvas" width="320" height="170"
                style="width:100%;border-radius:5px;border:1px solid rgba(255,255,255,.07);background:#0a0c14;display:block;"></canvas>
        </div>

        <div id="layersStackStatus" class="layer-status"></div>
        <div id="layers-cards-container"></div>
        `;

        this.previewCanvas = parent.querySelector('#layersPreviewCanvas') as HTMLCanvasElement;
        parent.querySelector('#layerBiomeSelect')?.addEventListener('change', (evt) => {
            const biome = (evt.target as HTMLSelectElement).value;
            this.editorRef.currentBiome = biome;
            this.setBiome(biome);
            this.commitCurrentStack(false);
        });
        parent.querySelector('#btnAddSceneLayer')?.addEventListener('click', () => this.addLayer());
        parent.querySelector('#btnClearSceneLayers')?.addEventListener('click', () => this.clearSceneLayers());
        return parent;
    }

    setBiome(biome: string): void {
        this.currentBiome = biome;
        const select = this.container.querySelector('#layerBiomeSelect') as HTMLSelectElement | null;
        if (select) select.value = biome;
        this.ensureStack(biome);
        this.renderLayerList();
    }

    getSceneLayersForBiome(biome: string): SceneLayerPreset {
        return cloneStack(this.ensureStack(biome));
    }

    getSceneLayersForExport(): SceneLayerPreset {
        return this.getSceneLayersForBiome(this.currentBiome);
    }

    getOverridesForBiome(biome: string): SceneLayerPreset | undefined {
        return this.getSceneLayersForBiome(biome);
    }

    getAllOverrides(): Record<string, SceneLayerPreset> {
        const out: Record<string, SceneLayerPreset> = {};
        for (const [biome, stack] of this.stacks) out[biome] = cloneStack(stack);
        return out;
    }

    loadSceneLayersFromJSON(data: SceneLayerStack): void {
        const biome = data.biome ?? this.currentBiome;
        this.stacks.set(biome, this.normalizeStack(data, biome));
        this.currentBiome = biome;
        this.editorRef.currentBiome = biome;
        this.setBiome(biome);
    }

    loadOverridesFromJSON(data: Record<string, Partial<SceneLayerPreset>>): void {
        for (const [biome, override] of Object.entries(data)) {
            this.stacks.set(biome, this.normalizeImportedStack(override, biome));
        }
        this.setBiome(this.currentBiome);
    }

    private ensureStack(biome: string): SceneLayerPreset {
        const existing = this.stacks.get(biome);
        if (existing) return existing;
        const empty = this.createEmptyStack(biome);
        this.stacks.set(biome, empty);
        return empty;
    }

    private normalizeStack(raw: Partial<SceneLayerStack>, biome: string): SceneLayerPreset {
        const base = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS.forest;
        const layers = Array.isArray(raw.layers)
            ? raw.layers.map((layer, index) => this.fillLayerDefaults(layer as Partial<SceneLayerAsset>, index))
            : [];
        return withLegacyAliases({
            id: raw.id ?? `${biome}_dynamic_layers`,
            biome,
            layers: this.sortAndRenumber(layers),
            particleColor: raw.particleColor ?? base.particleColor ?? DEFAULT_PARTICLE_COLOR,
            particleCount: raw.particleCount ?? (layers.length === 0 ? 0 : base.particleCount ?? 18),
            particleAlpha: raw.particleAlpha ?? base.particleAlpha ?? DEFAULT_PARTICLE_ALPHA,
        });
    }

    private createEmptyStack(biome: string): SceneLayerPreset {
        const base = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS.forest;
        return withLegacyAliases({
            id: `${biome}_empty_layers`,
            biome,
            layers: [],
            particleColor: base.particleColor ?? DEFAULT_PARTICLE_COLOR,
            particleCount: 0,
            particleAlpha: base.particleAlpha ?? DEFAULT_PARTICLE_ALPHA,
        });
    }

    private normalizeImportedStack(raw: Partial<SceneLayerPreset>, biome: string): SceneLayerPreset {
        if (Array.isArray(raw.layers)) return this.normalizeStack(raw, biome);

        const base = cloneStack(BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS.forest);
        const layers = base.layers.map(layer => {
            const role = layer.compositionRole;
            if (!role) return layer;
            const legacy = this.findLegacyOverride(raw, role);
            return legacy ? this.fillLayerDefaults({ ...layer, ...legacy }, layer.order) : layer;
        });

        for (const [legacyKey, role] of Object.entries(LEGACY_TO_ROLE) as Array<[LegacyLayerKey, SceneLayerCompositionRole]>) {
            const legacy = raw[legacyKey] as Partial<SceneLayerAsset> | undefined;
            if (!legacy || layers.some(layer => layer.compositionRole === role)) continue;
            layers.push(this.fillLayerDefaults({
                ...legacy,
                id: roleToId(role),
                name: ROLE_LABELS[role] ?? role,
                order: defaultOrderForRole(role),
                compositionRole: role,
            }, layers.length));
        }

        return withLegacyAliases({
            ...base,
            ...raw,
            biome,
            layers: this.sortAndRenumber(layers),
        } as SceneLayerPreset);
    }

    private findLegacyOverride(raw: Partial<SceneLayerPreset>, role: SceneLayerCompositionRole): Partial<SceneLayerAsset> | undefined {
        const direct = raw[role] as Partial<SceneLayerAsset> | undefined;
        const legacyKey = (Object.entries(LEGACY_TO_ROLE) as Array<[LegacyLayerKey, SceneLayerCompositionRole]>)
            .find(([, mappedRole]) => mappedRole === role)?.[0];
        const legacy = legacyKey ? raw[legacyKey] as Partial<SceneLayerAsset> | undefined : undefined;
        if (!direct && !legacy) return undefined;
        return { ...(legacy ?? {}), ...(direct ?? {}) };
    }

    private fillLayerDefaults(raw: Partial<SceneLayerAsset>, index: number): SceneLayerAsset {
        return {
            id: raw.id ?? `scene_layer_${Date.now()}_${index}`,
            name: raw.name ?? (raw.compositionRole ? (ROLE_LABELS[raw.compositionRole] ?? String(raw.compositionRole)) : `Layer ${index + 1}`),
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

    private sortAndRenumber(layers: SceneLayerAsset[]): SceneLayerAsset[] {
        return [...layers]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((layer, index) => ({ ...layer, order: index * 10 }));
    }

    private renderLayerList(): void {
        const stack = this.ensureStack(this.currentBiome);
        const host = this.container.querySelector('#layers-cards-container') as HTMLElement | null;
        if (!host) return;
        host.innerHTML = '';
        stack.layers.forEach((layer, index) => host.appendChild(this.buildLayerCard(layer, index)));
        this.refreshPreview(stack);
        this.refreshStatus(stack);
    }

    private buildLayerCard(layer: SceneLayerAsset, index: number): HTMLElement {
        const card = document.createElement('div');
        card.className = 'layer-card';
        card.dataset.index = String(index);
        const thumbSrc = layer.file ? `/assets/backgrounds/${layer.file}` : '';
        card.innerHTML = `
            <div class="layer-header">
                <input class="layer-enabled" type="checkbox" ${layer.enabled ? 'checked' : ''} title="Activer le layer"/>
                <img class="layer-thumb" src="${thumbSrc}" onerror="this.style.opacity='0.2'"/>
                <input class="layer-name" type="text" value="${escapeHtml(layer.name)}"/>
                <button class="icon-btn layer-up" title="Monter">Up</button>
                <button class="icon-btn layer-down" title="Descendre">Dn</button>
                <button class="icon-btn layer-copy" title="Dupliquer">Cp</button>
                <button class="icon-btn layer-delete" title="Supprimer">Del</button>
            </div>
            <div class="layer-body">
                <div class="preset-strip">
                    ${LAYER_CONFIG_PRESETS.map(preset => `
                        <button type="button" class="preset-btn layer-preset" data-preset="${preset.key}" title="${preset.title}">
                            ${preset.label}
                        </button>
                    `).join('')}
                </div>
                ${this.selectControl('Asset', 'layer-file', layer.file ?? '', this.fileOptions(layer.file))}
                ${this.selectControl('Alpha key', 'layer-alpha-key', layer.alphaKey ?? 'texture', ['texture', 'white', 'magenta', 'black', 'luminance', 'none'])}
                ${this.selectControl('Blend', 'layer-blend', layer.blendMode, ['alpha', 'additive', 'screen', 'multiply'])}
                ${this.rangeControl('Opacite', 'layer-opacity', 0, 1, 0.01, layer.opacity, 'percent')}
                ${this.rangeControl('Front alpha', 'layer-front-alpha', 0, 1, 0.01, layer.cameraOpacity?.front ?? layer.opacity, 'percent')}
                ${this.rangeControl('Overview', 'layer-overview-alpha', 0, 1, 0.01, layer.cameraOpacity?.overview ?? layer.opacity, 'percent')}
                ${this.rangeControl('Offset X', 'layer-x', -120, 120, 0.5, layer.xOffset, 'float')}
                ${this.rangeControl('Offset Y', 'layer-y', -140, 140, 0.5, layer.yOffset, 'float')}
                ${this.rangeControl('Offset Z', 'layer-z', -160, 220, 0.5, layer.zOffset, 'float')}
                ${this.rangeControl('Hauteur', 'layer-height', 1, 240, 1, layer.height, 'int')}
                ${this.rangeControl('Largeur x', 'layer-width', 0.05, 14, 0.05, layer.widthScale, 'scale')}
                ${this.rangeControl('Parallax', 'layer-parallax', 0, 1, 0.01, layer.parallaxStrength ?? 0, 'scale')}
                ${this.rangeControl('Scroll X', 'layer-scroll-x', -0.08, 0.08, 0.001, layer.scrollSpeedX ?? 0, 'scroll')}
                ${this.rangeControl('Scroll Y', 'layer-scroll-y', -0.08, 0.08, 0.001, layer.scrollSpeedY ?? 0, 'scroll')}
                ${this.rangeControl('Emissive R', 'layer-r', 0, 2, 0.01, layer.emissive[0], 'scale')}
                ${this.rangeControl('Emissive G', 'layer-g', 0, 2, 0.01, layer.emissive[1], 'scale')}
                ${this.rangeControl('Emissive B', 'layer-b', 0, 2, 0.01, layer.emissive[2], 'scale')}
                <div class="lrow">
                    <label>Render</label>
                    <input class="layer-render" type="number" min="0" max="3" step="1" value="${layer.renderGroup}"/>
                </div>
            </div>
        `;

        card.querySelector('.layer-up')?.addEventListener('click', () => this.moveLayer(index, -1));
        card.querySelector('.layer-down')?.addEventListener('click', () => this.moveLayer(index, 1));
        card.querySelector('.layer-copy')?.addEventListener('click', () => this.duplicateLayer(index));
        card.querySelector('.layer-delete')?.addEventListener('click', () => this.deleteLayer(index));
        card.querySelectorAll('.layer-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = (btn as HTMLElement).dataset.preset as LayerConfigPresetKey | undefined;
                if (key) this.applyConfigPreset(index, key);
            });
        });
        card.querySelectorAll('input,select').forEach(el => {
            el.addEventListener('input', () => this.readCard(index, card));
            el.addEventListener('change', () => this.readCard(index, card));
        });
        return card;
    }

    private fileOptions(selected: string | null): string[] {
        const files = [...this.availableFiles];
        if (selected && !files.includes(selected)) files.unshift(selected);
        return ['', ...files];
    }

    private selectControl(label: string, cls: string, value: string, options: string[]): string {
        return `
            <div class="lrow">
                <label>${label}</label>
                <select class="${cls}">
                    ${options.map(option => `<option value="${option}" ${option === value ? 'selected' : ''}>${option || '(aucun)'}</option>`).join('')}
                </select>
            </div>
        `;
    }

    private rangeControl(label: string, cls: string, min: number, max: number, step: number, value: number, format: string): string {
        return `
            <div class="lrow">
                <label>${label}</label>
                <input class="${cls}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"/>
                <span class="val" data-format="${format}">${this.formatValue(value, format)}</span>
            </div>
        `;
    }

    private readCard(index: number, card: HTMLElement): void {
        const stack = this.ensureStack(this.currentBiome);
        const current = stack.layers[index];
        if (!current) return;

        const getInput = (cls: string): HTMLInputElement => card.querySelector(`.${cls}`) as HTMLInputElement;
        const getSelect = (cls: string): HTMLSelectElement => card.querySelector(`.${cls}`) as HTMLSelectElement;
        const numberValue = (cls: string, fallback: number): number => {
            const raw = parseFloat(getInput(cls)?.value ?? String(fallback));
            return Number.isFinite(raw) ? raw : fallback;
        };

        current.enabled = getInput('layer-enabled')?.checked ?? true;
        current.name = getInput('layer-name')?.value.trim() || current.name;
        current.file = getSelect('layer-file')?.value || null;
        current.alphaKey = (getSelect('layer-alpha-key')?.value || 'texture') as SceneLayerAlphaKey;
        current.blendMode = (getSelect('layer-blend')?.value || 'alpha') as SceneLayerBlendMode;
        current.opacity = numberValue('layer-opacity', current.opacity);
        current.cameraOpacity = {
            front: numberValue('layer-front-alpha', current.cameraOpacity?.front ?? current.opacity),
            overview: numberValue('layer-overview-alpha', current.cameraOpacity?.overview ?? current.opacity),
        };
        current.xOffset = numberValue('layer-x', current.xOffset);
        current.yOffset = numberValue('layer-y', current.yOffset);
        current.zOffset = numberValue('layer-z', current.zOffset);
        current.height = numberValue('layer-height', current.height);
        current.widthScale = numberValue('layer-width', current.widthScale);
        current.parallaxStrength = numberValue('layer-parallax', current.parallaxStrength ?? 0);
        current.scrollSpeedX = numberValue('layer-scroll-x', current.scrollSpeedX ?? 0);
        current.scrollSpeedY = numberValue('layer-scroll-y', current.scrollSpeedY ?? 0);
        current.emissive = [
            numberValue('layer-r', current.emissive[0]),
            numberValue('layer-g', current.emissive[1]),
            numberValue('layer-b', current.emissive[2]),
        ];
        current.renderGroup = Math.max(0, Math.round(numberValue('layer-render', current.renderGroup)));

        const thumb = card.querySelector('.layer-thumb') as HTMLImageElement | null;
        if (thumb) thumb.src = current.file ? `/assets/backgrounds/${current.file}` : '';
        card.querySelectorAll('.val').forEach(span => {
            const input = span.previousElementSibling as HTMLInputElement | null;
            if (input) span.textContent = this.formatValue(parseFloat(input.value), span.getAttribute('data-format') ?? 'float');
        });

        this.commitCurrentStack();
    }

    private addLayer(): void {
        const stack = this.ensureStack(this.currentBiome);
        stack.layers.push(this.fillLayerDefaults({
            id: `custom_layer_${Date.now()}`,
            name: `Layer ${stack.layers.length + 1}`,
            order: stack.layers.length * 10,
            file: null,
        }, stack.layers.length));
        stack.layers = this.sortAndRenumber(stack.layers);
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private deleteLayer(index: number): void {
        const stack = this.ensureStack(this.currentBiome);
        stack.layers.splice(index, 1);
        stack.layers = this.sortAndRenumber(stack.layers);
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private duplicateLayer(index: number): void {
        const stack = this.ensureStack(this.currentBiome);
        const source = stack.layers[index];
        if (!source) return;
        stack.layers.splice(index + 1, 0, {
            ...cloneLayer(source),
            id: `${source.id}_copy_${Date.now()}`,
            name: `${source.name} copy`,
            compositionRole: undefined,
        });
        stack.layers = this.sortAndRenumber(stack.layers);
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private moveLayer(index: number, direction: -1 | 1): void {
        const stack = this.ensureStack(this.currentBiome);
        const next = index + direction;
        if (next < 0 || next >= stack.layers.length) return;
        const tmp = stack.layers[index];
        stack.layers[index] = stack.layers[next];
        stack.layers[next] = tmp;
        stack.layers = this.sortAndRenumber(stack.layers);
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private applyConfigPreset(index: number, key: LayerConfigPresetKey): void {
        const stack = this.ensureStack(this.currentBiome);
        const layer = stack.layers[index];
        const preset = LAYER_CONFIG_PRESETS.find(entry => entry.key === key);
        if (!layer || !preset) return;

        this.applyPresetPatch(layer, preset.patch);
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private applyPresetPatch(layer: SceneLayerAsset, patch: Partial<SceneLayerAsset>): void {
        if (patch.opacity !== undefined) layer.opacity = patch.opacity;
        if (patch.blendMode !== undefined) layer.blendMode = patch.blendMode;
        if (patch.emissive !== undefined) layer.emissive = [...patch.emissive] as [number, number, number];
        if (patch.xOffset !== undefined) layer.xOffset = patch.xOffset;
        if (patch.yOffset !== undefined) layer.yOffset = patch.yOffset;
        if (patch.zOffset !== undefined) layer.zOffset = patch.zOffset;
        if (patch.widthScale !== undefined) layer.widthScale = patch.widthScale;
        if (patch.height !== undefined) layer.height = patch.height;
        if (patch.renderGroup !== undefined) layer.renderGroup = patch.renderGroup;
        if (patch.cameraOpacity !== undefined) layer.cameraOpacity = { ...patch.cameraOpacity };
        if (patch.cameraYOffset !== undefined) layer.cameraYOffset = { ...patch.cameraYOffset };
        if (patch.cameraZOffset !== undefined) layer.cameraZOffset = { ...patch.cameraZOffset };
        if (patch.parallaxStrength !== undefined) layer.parallaxStrength = patch.parallaxStrength;
        if (patch.scrollSpeedX !== undefined) layer.scrollSpeedX = patch.scrollSpeedX;
        if (patch.scrollSpeedY !== undefined) layer.scrollSpeedY = patch.scrollSpeedY;
        if (patch.stageFit !== undefined) layer.stageFit = patch.stageFit as SceneLayerStageFit;
        if (patch.alphaKey !== undefined) layer.alphaKey = patch.alphaKey;
    }

    private clearSceneLayers(): void {
        this.stacks.set(this.currentBiome, this.createEmptyStack(this.currentBiome));
        this.commitCurrentStack();
        this.renderLayerList();
    }

    private commitCurrentStack(triggerCallback: boolean = true): void {
        const stack = this.ensureStack(this.currentBiome);
        stack.layers = this.sortAndRenumber(stack.layers);
        this.stacks.set(this.currentBiome, withLegacyAliases(stack));
        this.refreshPreview(stack);
        this.refreshStatus(stack);
        if (triggerCallback) this.onLayerChange?.(this.currentBiome, cloneStack(stack));
    }

    private refreshPreview(stack: SceneLayerPreset): void {
        if (!this.previewCanvas) return;
        const ctx = this.previewCanvas.getContext('2d');
        if (!ctx) return;

        const w = this.previewCanvas.width;
        const h = this.previewCanvas.height;
        const token = ++this.previewToken;
        const draw = () => {
            if (token !== this.previewToken) return;
            ctx.clearRect(0, 0, w, h);
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#132532');
            bg.addColorStop(0.55, '#07120f');
            bg.addColorStop(1, '#020403');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            const sorted = [...stack.layers]
                .filter(layer => layer.enabled !== false && layer.file)
                .sort((a, b) => a.order - b.order);
            for (const layer of sorted) {
                const img = this.getPreviewImage(layer.file!, draw);
                if (!img.complete || !img.naturalWidth) continue;
                ctx.save();
                ctx.globalAlpha = layer.opacity;
                ctx.globalCompositeOperation = layer.blendMode === 'additive' || layer.blendMode === 'screen' ? 'lighter' : 'source-over';
                const dx = layer.xOffset * (w / 160);
                const dy = -layer.yOffset * (h / 180);
                const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * Math.max(0.05, layer.widthScale);
                const dw = img.naturalWidth * scale;
                const dh = img.naturalHeight * scale;
                ctx.drawImage(img, (w - dw) * 0.5 + dx, (h - dh) * 0.5 + dy, dw, dh);
                ctx.restore();
            }
            this.drawPreviewGrid(ctx, w, h);
        };
        draw();
    }

    private getPreviewImage(file: string, onLoad: () => void): HTMLImageElement {
        const cached = this.imageCache.get(file);
        if (cached) return cached;
        const img = new Image();
        img.onload = onLoad;
        img.onerror = onLoad;
        img.src = `/assets/backgrounds/${file}`;
        this.imageCache.set(file, img);
        return img;
    }

    private drawPreviewGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.save();
        ctx.globalAlpha = 0.62;
        ctx.strokeStyle = 'rgba(46,220,236,0.28)';
        ctx.lineWidth = 1;
        const left = w * 0.25;
        const top = h * 0.62;
        const tileW = w * 0.08;
        const tileH = h * 0.06;
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 8; col++) {
                const x = left + col * tileW + row * tileW * 0.35;
                const y = top + row * tileH;
                ctx.strokeRect(x, y, tileW, tileH);
            }
        }
        ctx.restore();
    }

    private refreshStatus(stack: SceneLayerPreset): void {
        const host = this.container.querySelector('#layersStackStatus') as HTMLElement | null;
        if (!host) return;
        const enabled = stack.layers.filter(layer => layer.enabled !== false && layer.file).length;
        host.innerHTML = `
            <b>${stack.layers.length}</b> layers dans la pile, <b>${enabled}</b> actifs.<br>
            Export nouveau format: <code>sceneLayers.layers[]</code>.
        `;
    }

    private formatValue(value: number, format: string): string {
        if (format === 'percent') return `${Math.round(value * 100)}%`;
        if (format === 'int') return value.toFixed(0);
        if (format === 'scale') return value.toFixed(2);
        if (format === 'scroll') return value.toFixed(3);
        return value.toFixed(1);
    }
}

function roleToId(role: SceneLayerCompositionRole): string {
    return role.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function defaultOrderForRole(role: SceneLayerCompositionRole): number {
    switch (role) {
        case 'backAtmosphere': return 0;
        case 'mainMidground': return 10;
        case 'groundBlend': return 20;
        case 'foregroundCorners': return 30;
        case 'upperCanopy': return 40;
        case 'fxOverlay': return 50;
        default: return 100;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export const LAYERS_TAB_HTML = '';
