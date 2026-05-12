/**
 * MapEditorLayersTab.ts
 * GPA Tactics HD-2D — Onglet "Layers" du MapEditor
 *
 * Permet de configurer les 4 layers de décor par biome :
 *   - Sélection de l'asset PNG pour chaque layer
 *   - Réglage opacité, émissive, position, scroll FX
 *   - Prévisualisation composite en temps réel (canvas 2D)
 *   - Export des surcharges dans le JSON de carte
 *
 * INTÉGRATION dans MapEditor.ts :
 *   1. Importer MapEditorLayersTab
 *   2. Ajouter l'onglet HTML dans buildHTMLToolbar() après tab-io
 *   3. Instancier dans bindToolbarEvents() :
 *        this.layersTab = new MapEditorLayersTab(this, this.scene, this.manifest);
 */

import { SCENE_LAYER_PRESETS as BIOME_LAYER_PRESETS } from '../rendering/SceneLayerManager';
import type {
    SceneLayerAsset as LayerAsset,
    SceneLayerPreset as BiomeLayerPreset,
} from '../rendering/SceneLayerTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayerKey = 'background' | 'midground' | 'platformBlendFog' | 'foreground' | 'fxOverlay';

interface LayerMeta {
    key:   LayerKey;
    label: string;
    icon:  string;
    color: string;
}

const LAYER_META: LayerMeta[] = [
    { key: 'platformBlendFog', label: 'Platform Fog', icon: 'fog', color: '#123322' },
    { key: 'background', label: 'Background',  icon: '🌄', color: '#2a3a55' },
    { key: 'midground',  label: 'Midground',   icon: '🌲', color: '#1e3a28' },
    { key: 'foreground', label: 'Foreground',  icon: '🪵', color: '#1a1f18' },
    { key: 'fxOverlay',  label: 'FX Overlay',  icon: '✨', color: '#0a2a18' },
];

const FOREST_V3_FILES: Record<LayerKey, string> = {
    background: 'bg_forest_v3_main.png',
    midground: 'mid_forest_v3_alpha.png',
    platformBlendFog: 'fx_forest_v3_alpha.png',
    foreground: 'fore_forest_v3_alpha.png',
    fxOverlay: 'fx_forest_v3_alpha.png',
};

// ---------------------------------------------------------------------------
// MapEditorLayersTab
// ---------------------------------------------------------------------------

export class MapEditorLayersTab {
    private container: HTMLElement;
    private currentBiome: string;
    private previewCanvas: HTMLCanvasElement | null = null;
    private overrides: Map<string, Partial<BiomeLayerPreset>> = new Map();
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private previewToken = 0;

    /** Callbacks vers MapEditor parent */
    onLayerChange?: (biome: string, overrides: Partial<BiomeLayerPreset>) => void;
    onExportLayers?: () => Record<string, Partial<BiomeLayerPreset>>;

    constructor(
        private editorRef: { currentBiome: string },
        private availableFiles: string[],
        parentEl: HTMLElement
    ) {
        this.currentBiome = editorRef.currentBiome;
        this.container = this.buildUI(parentEl);
        this.refresh(this.currentBiome);
    }

    // ─── HTML principal ────────────────────────────────────────────────────

    private buildUI(parent: HTMLElement): HTMLElement {
        const wrapper = parent;
        wrapper.innerHTML = '';
        wrapper.style.padding = '10px 13px';

        wrapper.innerHTML = `
        <style>
        #tab-layers .layer-card {
            background: rgba(255,255,255,0.04);
            border-radius: 6px;
            margin-bottom: 8px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.06);
        }
        #tab-layers .layer-header {
            display: flex;
            align-items: center;
            padding: 7px 10px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .06em;
        }
        #tab-layers .layer-header:hover { background: rgba(255,255,255,0.04); }
        #tab-layers .layer-body {
            padding: 8px 10px 10px;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        #tab-layers .lrow {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
        }
        #tab-layers .lrow label {
            flex: 0 0 68px;
            font-size: 9px;
            color: #6a7a90;
            text-transform: uppercase;
            letter-spacing: .08em;
        }
        #tab-layers .lrow select,
        #tab-layers .lrow input[type=number] {
            flex: 1;
            background: rgba(255,255,255,0.06);
            color: #c4ccd6;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 4px;
            padding: 3px 6px;
            font-size: 10px;
        }
        #tab-layers input[type=range] {
            flex: 1;
            -webkit-appearance: none;
            height: 3px;
            background: rgba(255,255,255,0.12);
            border-radius: 2px;
            outline: none;
        }
        #tab-layers input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 10px;
            height: 10px;
            background: #5a8fcc;
            border-radius: 50%;
            cursor: pointer;
        }
        #tab-layers .val {
            min-width: 34px;
            text-align: right;
            font-size: 9px;
            color: #dce8f4;
            font-weight: 700;
        }
        #tab-layers .layer-preview-strip {
            width: 100%;
            height: 6px;
            border-radius: 3px;
            margin-top: 4px;
        }
        #tab-layers .scroll-row { display: flex; gap: 6px; }
        #tab-layers .collapse-arrow { margin-left: auto; font-size: 10px; opacity: 0.5; }
        #tab-layers .layer-thumb {
            width: 36px;
            height: 22px;
            border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.12);
            object-fit: cover;
            background: #0a0c12;
        }
        #tab-layers .layer-stage-card {
            background: rgba(2,6,12,0.56);
            border: 1px solid rgba(214,179,90,0.22);
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 10px;
        }
        #tab-layers details {
            border-top: 1px solid rgba(255,255,255,0.06);
            margin-top: 8px;
            padding-top: 7px;
        }
        #tab-layers summary {
            cursor: pointer;
            color: #8da0b8;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .08em;
        }
        #tab-layers .mini-preview-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-top: 8px;
        }
        #tab-layers .contract-status {
            background: rgba(2,6,12,0.58);
            border: 1px solid rgba(255,255,255,0.07);
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 10px;
        }
        #tab-layers .contract-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 9px;
            color: #7f8da0;
            margin-top: 5px;
        }
        #tab-layers .contract-line strong {
            color: #b8c8dc;
            font-size: 9px;
            letter-spacing: .04em;
        }
        #tab-layers .contract-badge {
            border-radius: 999px;
            padding: 1px 7px;
            font-weight: 900;
            font-size: 8px;
            letter-spacing: .05em;
            white-space: nowrap;
        }
        #tab-layers .contract-badge.ok {
            background: rgba(42,220,125,0.14);
            color: #63e8a2;
            border: 1px solid rgba(99,232,162,0.22);
        }
        #tab-layers .contract-badge.warn {
            background: rgba(255,190,80,0.12);
            color: #f3c46a;
            border: 1px solid rgba(243,196,106,0.22);
        }
        #tab-layers .contract-badge.bad {
            background: rgba(255,95,95,0.12);
            color: #ff8a8a;
            border: 1px solid rgba(255,138,138,0.22);
        }
        </style>

        <div class="layer-stage-card">
            <div class="lrow">
                <label>Biome</label>
                <select id="biomeSelect" style="flex:2;">
                    ${Object.keys(BIOME_LAYER_PRESETS).map(b => `<option value="${b}" ${b === this.currentBiome ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
            </div>
            <button id="btnApplyForestV3" class="btn" style="background:#1c3423;color:#76e8a2;width:100%;padding:7px 0;margin-top:4px;">
                Appliquer preset forest
            </button>
            <details>
                <summary>Reglages secondaires</summary>
                <div style="margin-top:8px;">
                    <div class="lrow"><label>Densite</label>
                        <input type="range" id="procDensity" min="0.1" max="2.0" step="0.05" value="${this.getEditorNumber('procDensity', 0.7)}"/>
                        <span class="val" id="valProcDensity">${this.getEditorNumber('procDensity', 0.7).toFixed(2)}</span>
                    </div>
                    <div class="lrow"><label>Prop seed</label>
                        <input type="number" id="procSeedInput" value="${this.getEditorNumber('procSeed', 42)}" min="0" max="99999" style="width:58px;"/>
                        <button id="btnRS" class="btn" style="background:#102030;color:#60a0e0;padding:3px 7px;font-size:11px;">Rnd</button>
                    </div>
                    <button id="btnProcRebuild" class="btn" style="background:#0f3520;color:#50d880;width:100%;padding:7px 0;margin-top:4px;">Generer props secondaires</button>
                </div>
            </details>
        </div>

        <!-- Preview composite -->
        <div style="margin-bottom:10px;">
            <div style="font-size:9px;color:#4a6a8a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px;font-weight:700;">Preview rapide</div>
            <canvas id="layersPreviewCanvas" width="320" height="150"
                style="width:100%;border-radius:5px;border:1px solid rgba(255,255,255,.07);background:#0a0c14;display:block;"></canvas>
        </div>

        <div class="contract-status">
            <div style="font-size:9px;color:#d6b35a;letter-spacing:.12em;text-transform:uppercase;font-weight:900;">Stack layers</div>
            <div id="layerContractStatus" style="margin-top:4px;"></div>
        </div>

        <!-- Cards des 4 layers -->
        <div id="layers-cards-container"></div>

        <!-- Export -->
        <div style="margin-top:10px;">
            <button id="btnExportLayers" style="
                width:100%;padding:8px 0;border:none;border-radius:5px;
                background:#1a3a1a;color:#70e870;font-size:11px;font-weight:700;cursor:pointer;">
                💾 Exporter surcharges layers
            </button>
            <div style="font-size:9px;color:#4a5a6a;margin-top:5px;line-height:1.5;">
                Les surcharges sont injectées dans <b>layerOverrides</b> du JSON de carte.
            </div>
        </div>
        `;

        // On récupère le canvas
        this.previewCanvas = wrapper.querySelector('#layersPreviewCanvas') as HTMLCanvasElement;
        wrapper.querySelector('#btnExportLayers')!.addEventListener('click', () => this.exportOverrides());
        wrapper.querySelector('#biomeSelect')?.addEventListener('change', (evt) => {
            const biome = (evt.target as HTMLSelectElement).value;
            this.editorRef.currentBiome = biome;
            this.setBiome(biome);
            this.onLayerChange?.(biome, this.overrides.get(biome) ?? {});
        });
        wrapper.querySelector('#btnApplyForestV3')?.addEventListener('click', () => this.applyForestV3Preset());

        return wrapper;
    }

    private getEditorNumber(key: string, fallback: number): number {
        const value = (this.editorRef as any)[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    // ─── Refresh — recharge les cards pour le biome actif ─────────────────

    refresh(biome: string): void {
        this.currentBiome = biome;
        const container = this.container.querySelector('#layers-cards-container') as HTMLElement;
        if (!container) return;
        container.innerHTML = '';

        const base = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS['forest'];
        const existing = this.overrides.get(biome) ?? {};
        const preset: BiomeLayerPreset = {
            ...base,
            ...existing,
            background: { ...base.background, ...(existing.background ?? {}) },
            midground:  { ...base.midground,  ...(existing.midground  ?? {}) },
            platformBlendFog: { ...base.platformBlendFog, ...(existing.platformBlendFog ?? {}) },
            foreground: { ...base.foreground, ...(existing.foreground ?? {}) },
            fxOverlay:  { ...base.fxOverlay,  ...(existing.fxOverlay  ?? {}) },
        };

        for (const meta of LAYER_META) {
            container.appendChild(this.buildLayerCard(meta, preset[meta.key], biome));
        }

        this.refreshPreview(preset);
        this.refreshContractStatus(preset);
    }

    // ─── Card d'un layer ───────────────────────────────────────────────────

    private buildLayerCard(meta: LayerMeta, cfg: LayerAsset, biome: string): HTMLElement {
        const card = document.createElement('div');
        card.className = 'layer-card';
        card.dataset.layerKey = meta.key;

        // Thumbnail (si fichier existe)
        const thumbSrc = cfg.file ? `/assets/backgrounds/${cfg.file}` : '';
        const thumbHtml = thumbSrc
            ? `<img class="layer-thumb" src="${thumbSrc}" onerror="this.style.display='none'"/>`
            : `<div class="layer-thumb" style="display:flex;align-items:center;justify-content:center;color:#3a4a5a;font-size:9px;">∅</div>`;

        card.innerHTML = `
        <div class="layer-header" style="background:${meta.color}22;">
            <span>${meta.icon}</span>
            ${thumbHtml}
            <span style="color:#c4d4e4;">${meta.label}</span>
            <span class="collapse-arrow">▼</span>
        </div>
        <div class="layer-body">
            <!-- Asset -->
            <div class="lrow">
                <label>Asset</label>
                <select class="layer-file-select">
                    <option value="">(aucun)</option>
                    ${this.availableFiles.map(f =>
                        `<option value="${f}" ${f === cfg.file ? 'selected' : ''}>${f}</option>`
                    ).join('')}
                </select>
            </div>
            <!-- Opacité -->
            <div class="lrow">
                <label>Opacité</label>
                <input type="range" class="layer-opacity" min="0" max="1" step="0.01" value="${cfg.opacity}"/>
                <span class="val layer-opacity-val">${(cfg.opacity * 100).toFixed(0)}%</span>
            </div>
            <!-- Émissive R G B -->
            <div class="lrow">
                <label>Émissive R</label>
                <input type="range" class="layer-emissive-r" min="0" max="1" step="0.01" value="${cfg.emissive[0]}"/>
                <span class="val layer-emissive-r-val">${cfg.emissive[0].toFixed(2)}</span>
            </div>
            <div class="lrow">
                <label>Émissive G</label>
                <input type="range" class="layer-emissive-g" min="0" max="1" step="0.01" value="${cfg.emissive[1]}"/>
                <span class="val layer-emissive-g-val">${cfg.emissive[1].toFixed(2)}</span>
            </div>
            <div class="lrow">
                <label>Émissive B</label>
                <input type="range" class="layer-emissive-b" min="0" max="1" step="0.01" value="${cfg.emissive[2]}"/>
                <span class="val layer-emissive-b-val">${cfg.emissive[2].toFixed(2)}</span>
            </div>
            <!-- Position -->
            <div class="lrow">
                <label>Offset Y</label>
                <input type="range" class="layer-y" min="-5" max="40" step="0.5" value="${cfg.yOffset}"/>
                <span class="val layer-y-val">${cfg.yOffset.toFixed(1)}</span>
            </div>
            <div class="lrow">
                <label>Offset Z</label>
                <input type="range" class="layer-z" min="-20" max="80" step="0.5" value="${cfg.zOffset}"/>
                <span class="val layer-z-val">${cfg.zOffset.toFixed(1)}</span>
            </div>
            <!-- Hauteur -->
            <div class="lrow">
                <label>Hauteur</label>
                <input type="range" class="layer-height" min="5" max="120" step="1" value="${cfg.height}"/>
                <span class="val layer-height-val">${cfg.height.toFixed(0)}</span>
            </div>
            <!-- Scale W -->
            <div class="lrow">
                <label>Largeur ×</label>
                <input type="range" class="layer-wscale" min="0.5" max="6.0" step="0.05" value="${cfg.widthScale}"/>
                <span class="val layer-wscale-val">${cfg.widthScale.toFixed(2)}</span>
            </div>
            <!-- Scroll FX -->
            <div class="scroll-row">
                <div class="lrow" style="flex:1;">
                    <label>Scroll X</label>
                    <input type="range" class="layer-scrollx" min="-0.02" max="0.02" step="0.001" value="${cfg.scrollSpeedX ?? 0}"/>
                    <span class="val layer-scrollx-val">${(cfg.scrollSpeedX ?? 0).toFixed(3)}</span>
                </div>
                <div class="lrow" style="flex:1;">
                    <label>Scroll Y</label>
                    <input type="range" class="layer-scrolly" min="-0.02" max="0.02" step="0.001" value="${cfg.scrollSpeedY ?? 0}"/>
                    <span class="val layer-scrolly-val">${(cfg.scrollSpeedY ?? 0).toFixed(3)}</span>
                </div>
            </div>
            <!-- Blend mode -->
            <div class="lrow">
                <label>Blend</label>
                <select class="layer-blend">
                    <option value="alpha"    ${cfg.blendMode === 'alpha'    ? 'selected' : ''}>Alpha</option>
                    <option value="additive" ${cfg.blendMode === 'additive' ? 'selected' : ''}>Additive</option>
                    <option value="screen"   ${cfg.blendMode === 'screen'   ? 'selected' : ''}>Screen</option>
                </select>
            </div>
            <!-- Strip couleur -->
            <div class="layer-preview-strip" style="background:linear-gradient(90deg,
                rgba(${Math.round(cfg.emissive[0]*255)},${Math.round(cfg.emissive[1]*255)},${Math.round(cfg.emissive[2]*255)},${cfg.opacity}),
                transparent);"></div>
        </div>
        `;

        // Toggle collapse
        const header = card.querySelector('.layer-header') as HTMLElement;
        const body   = card.querySelector('.layer-body')   as HTMLElement;
        body.style.display = 'block';
        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'none' ? 'block' : 'none';
            const arrow = header.querySelector('.collapse-arrow') as HTMLElement;
            arrow.textContent = body.style.display === 'none' ? '▶' : '▼';
        });

        // Bind all controls
        this.bindCardControls(card, meta.key as LayerKey, biome);

        return card;
    }

    private bindCardControls(card: HTMLElement, key: LayerKey, biome: string): void {
        const q = (sel: string) => card.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
        const update = () => this.readAndApply(card, key, biome);

        // Slider feedback
        const sliders: [string, string][] = [
            ['.layer-opacity', '.layer-opacity-val'],
            ['.layer-emissive-r', '.layer-emissive-r-val'],
            ['.layer-emissive-g', '.layer-emissive-g-val'],
            ['.layer-emissive-b', '.layer-emissive-b-val'],
            ['.layer-y', '.layer-y-val'],
            ['.layer-z', '.layer-z-val'],
            ['.layer-height', '.layer-height-val'],
            ['.layer-wscale', '.layer-wscale-val'],
            ['.layer-scrollx', '.layer-scrollx-val'],
            ['.layer-scrolly', '.layer-scrolly-val'],
        ];
        for (const [sliderSel, valSel] of sliders) {
            const slider = q(sliderSel);
            const val    = card.querySelector(valSel) as HTMLElement | null;
            if (slider && val) {
                slider.addEventListener('input', () => {
                    val.textContent = this.formatSliderValue(sliderSel, parseFloat((slider as HTMLInputElement).value));
                    update();
                });
            }
        }
        q('.layer-file-select')?.addEventListener('change', () => {
            const thumb = card.querySelector('.layer-thumb') as HTMLImageElement;
            const file = (q('.layer-file-select') as HTMLSelectElement).value;
            if (thumb && thumb.tagName === 'IMG') {
                thumb.src = file ? `/assets/backgrounds/${file}` : '';
            }
            update();
        });
        q('.layer-blend')?.addEventListener('change', update);
    }

    private formatSliderValue(sliderSel: string, value: number): string {
        if (sliderSel.includes('opacity')) return `${Math.round(value * 100)}%`;
        if (sliderSel.includes('height')) return value.toFixed(0);
        if (sliderSel.includes('wscale')) return value.toFixed(2);
        if (sliderSel.includes('scroll')) return value.toFixed(3);
        if (sliderSel.includes('emissive')) return value.toFixed(2);
        return value.toFixed(1);
    }

    private readAndApply(card: HTMLElement, key: LayerKey, biome: string): void {
        const q = (sel: string): HTMLInputElement => card.querySelector(sel) as HTMLInputElement;
        const qSelect = (sel: string): HTMLSelectElement => card.querySelector(sel) as HTMLSelectElement;

        const partial: Partial<LayerAsset> = {
            file:         qSelect('.layer-file-select')?.value || null,
            opacity:      parseFloat(q('.layer-opacity')?.value ?? '1'),
            emissive:     [
                parseFloat(q('.layer-emissive-r')?.value ?? '0'),
                parseFloat(q('.layer-emissive-g')?.value ?? '0'),
                parseFloat(q('.layer-emissive-b')?.value ?? '0'),
            ] as [number, number, number],
            yOffset:      parseFloat(q('.layer-y')?.value ?? '0'),
            zOffset:      parseFloat(q('.layer-z')?.value ?? '0'),
            height:       parseFloat(q('.layer-height')?.value ?? '40'),
            widthScale:   parseFloat(q('.layer-wscale')?.value ?? '1'),
            scrollSpeedX: parseFloat(q('.layer-scrollx')?.value ?? '0'),
            scrollSpeedY: parseFloat(q('.layer-scrolly')?.value ?? '0'),
            blendMode:    qSelect('.layer-blend')?.value as any ?? 'alpha',
        };

        // Merge dans les overrides
        const existing = this.overrides.get(biome) ?? {};
        (existing as any)[key] = partial;
        this.overrides.set(biome, existing);

        // Reconstruire la preview
        const base = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS['forest'];
        const merged: BiomeLayerPreset = {
            ...base,
            ...existing,
            background: { ...base.background, ...(existing.background ?? {}) },
            midground:  { ...base.midground,  ...(existing.midground  ?? {}) },
            platformBlendFog: { ...base.platformBlendFog, ...(existing.platformBlendFog ?? {}) },
            foreground: { ...base.foreground, ...(existing.foreground ?? {}) },
            fxOverlay:  { ...base.fxOverlay,  ...(existing.fxOverlay  ?? {}) },
        };

        // Mettre à jour le strip couleur du card
        const strip = card.querySelector('.layer-preview-strip') as HTMLElement;
        const em = partial.emissive ?? [0, 0, 0];
        const op = partial.opacity ?? 1;
        if (strip) {
            strip.style.background = `linear-gradient(90deg,
                rgba(${Math.round(em[0]*255)},${Math.round(em[1]*255)},${Math.round(em[2]*255)},${op}),
                transparent)`;
        }

        this.refreshPreview(merged);
        this.refreshContractStatus(merged);
        this.onLayerChange?.(biome, existing);
    }

    // ─── Preview composite canvas ──────────────────────────────────────────

    private refreshPreview(preset: BiomeLayerPreset): void {
        if (!this.previewCanvas) return;
        const ctx = this.previewCanvas.getContext('2d')!;
        const w = this.previewCanvas.width;
        const h = this.previewCanvas.height;
        const token = ++this.previewToken;
        const imageLayers = [
            { cfg: preset.background, fit: 'cover' as const },
            { cfg: preset.midground, fit: 'stage' as const },
            { cfg: preset.platformBlendFog, fit: 'stage' as const },
            { cfg: preset.fxOverlay, fit: 'cover' as const },
            { cfg: preset.foreground, fit: 'front' as const },
        ];

        const draw = () => {
            if (token !== this.previewToken) return;
            ctx.clearRect(0, 0, w, h);
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#152434');
            bg.addColorStop(0.55, '#0b1712');
            bg.addColorStop(1, '#050807');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            for (const { cfg, fit } of imageLayers) {
                if (!cfg.file) continue;
                const img = this.getPreviewImage(cfg.file, draw);
                if (!img.complete || img.naturalWidth === 0) continue;
                ctx.save();
                ctx.globalAlpha = cfg.opacity;
                ctx.globalCompositeOperation = cfg.blendMode === 'additive' || cfg.blendMode === 'screen' ? 'lighter' : 'source-over';
                this.drawLayerImage(ctx, img, fit, w, h);
                ctx.restore();
            }

            this.drawPreviewGrid(ctx, w, h);
        };

        draw();
        return;

        ctx.clearRect(0, 0, w, h);

        // Fond sombre
        ctx.fillStyle = '#0a0c14';
        ctx.fillRect(0, 0, w, h);

        // On dessine chaque layer comme une bande colorée
        const layers = [
            { cfg: preset.background, label: 'BG',   y: 0,    lh: 18 },
            { cfg: preset.midground,  label: 'MID',  y: 20,   lh: 18 },
            { cfg: preset.fxOverlay,  label: 'FX',   y: 40,   lh: 18 },
            { cfg: preset.foreground, label: 'FORE', y: 60,   lh: 18 },
        ];

        for (const { cfg, label, y, lh } of layers) {
            const [r, g, b] = cfg.emissive;
            const op = cfg.opacity;

            // Barre de fond
            const grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0,   `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${op})`);
            grad.addColorStop(0.7, `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${op*0.4})`);
            grad.addColorStop(1,   `rgba(0,0,0,0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, y, w, lh);

            // Label
            ctx.fillStyle = `rgba(255,255,255,0.5)`;
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`${label}${cfg.file ? ' ✓' : ' ∅'}`, 4, y + 12);

            // Opacité bar
            ctx.fillStyle = `rgba(255,255,255,0.12)`;
            ctx.fillRect(w - 50, y + 6, 44 * op, 6);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(w - 50, y + 6, 44, 6);
        }

        // Grille de superposition
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < h; i += 20) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
        }
    }

    // ─── Export ────────────────────────────────────────────────────────────

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

    private drawLayerImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, fit: 'cover' | 'stage' | 'front', w: number, h: number): void {
        if (fit === 'stage') {
            this.drawImageCover(ctx, img, 0, h * 0.18, w, h * 0.72);
            return;
        }
        if (fit === 'front') {
            this.drawImageCover(ctx, img, 0, h * 0.34, w, h * 0.66);
            return;
        }
        this.drawImageCover(ctx, img, 0, 0, w, h);
    }

    private drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (img.naturalWidth - sw) * 0.5;
        const sy = (img.naturalHeight - sh) * 0.5;
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    private drawPreviewGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(125,185,255,0.18)';
        ctx.lineWidth = 1;
        const left = w * 0.17;
        const top = h * 0.54;
        const tileW = w * 0.095;
        const tileH = h * 0.075;
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 8; col++) {
                const x = left + col * tileW + row * tileW * 0.45;
                const y = top + row * tileH;
                ctx.strokeRect(x, y, tileW, tileH);
            }
        }
        ctx.restore();
    }

    private refreshContractStatus(preset: BiomeLayerPreset): void {
        const host = this.container.querySelector('#layerContractStatus') as HTMLElement | null;
        if (!host) return;

        host.innerHTML = LAYER_META.map(meta => {
            const cfg = preset[meta.key];
            const expected = FOREST_V3_FILES[meta.key];
            const file = cfg.file ?? '';
            const fileBadge = file === expected
                ? `<span class="contract-badge ok">V3</span>`
                : `<span class="contract-badge warn">custom</span>`;
            return `
                <div class="contract-line" data-contract-layer="${meta.key}">
                    <strong>${meta.label}</strong>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${file || 'aucun fichier'}</span>
                    <span class="contract-badge ok" data-contract-size="${meta.key}">actif</span>
                    ${fileBadge}
                </div>
            `;
        }).join('');

    }

    private applyForestV3Preset(): void {
        const base = BIOME_LAYER_PRESETS.forest;
        const override: Partial<BiomeLayerPreset> = {
            id: 'forest',
            background: { ...base.background, file: FOREST_V3_FILES.background },
            midground: { ...base.midground, file: FOREST_V3_FILES.midground },
            platformBlendFog: { ...base.platformBlendFog, file: FOREST_V3_FILES.platformBlendFog },
            foreground: { ...base.foreground, file: FOREST_V3_FILES.foreground },
            fxOverlay: { ...base.fxOverlay, file: FOREST_V3_FILES.fxOverlay },
        };

        this.currentBiome = 'forest';
        this.editorRef.currentBiome = 'forest';
        this.overrides.set('forest', override);
        this.refresh('forest');
        this.onLayerChange?.('forest', override);
    }

    private exportOverrides(): void {
        const out: Record<string, any> = {};
        this.overrides.forEach((v, k) => { out[k] = v; });
        const json = JSON.stringify({ layerOverrides: out }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `layers_overrides_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Retourne les overrides pour injection dans l'export JSON de la carte */
    getOverridesForBiome(biome: string): Partial<BiomeLayerPreset> | undefined {
        return this.overrides.get(biome);
    }

    /** Retourne toutes les surcharges configurées dans la session d'édition */
    getAllOverrides(): Record<string, Partial<BiomeLayerPreset>> {
        const out: Record<string, Partial<BiomeLayerPreset>> = {};
        this.overrides.forEach((value, biome) => { out[biome] = value; });
        return out;
    }

    /** Charge des overrides depuis un JSON importé */
    loadOverridesFromJSON(data: Record<string, Partial<BiomeLayerPreset>>): void {
        for (const [biome, override] of Object.entries(data)) {
            this.overrides.set(biome, override);
        }
        this.refresh(this.currentBiome);
    }

    /** Met à jour quand le biome actif change */
    setBiome(biome: string): void {
        const select = this.container.querySelector('#biomeSelect') as HTMLSelectElement | null;
        if (select) select.value = biome;
        this.refresh(biome);
    }
}

// ---------------------------------------------------------------------------
// HTML du tab à injecter dans MapEditor.buildHTMLToolbar()
// Ajouter dans la section .tabs :
//   <button class="tab-btn" data-tab="tab-layers">🖼 Layers</button>
// Et dans le body :
//   <div id="tab-layers" class="editor-tab" style="display:none;"></div>
// La div sera peuplée par MapEditorLayersTab.
// ---------------------------------------------------------------------------

export const LAYERS_TAB_HTML = '';
