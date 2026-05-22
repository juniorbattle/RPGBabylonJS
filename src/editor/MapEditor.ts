/**
 * MapEditor.ts  — GPA Tactics HD-2D Map Editor
 *
 * Direction artistique : Fantasy whimsical, style Octopath/Fire Emblem.
 * - Sol : SceneGroundLayer configurable (procedural / texture repeat / couleur)
 * - Décor : Stack de layers PNG géré par SceneLayerManager (back/mid/ground/frame/canopy/fx)
 * - Props : Pinceau manuel (placement, miroir, suppression clic-droit)
 */

import {
    Engine, Scene, ArcRotateCamera, Vector3, MeshBuilder,
    StandardMaterial, Color3, Color4, Texture, DynamicTexture,
    TransformNode, Mesh, HemisphericLight, Observer
} from '@babylonjs/core';

import { CombatGrid, GridConfig } from '../combat/CombatGrid';
import { MapEditorLayersTab } from '../editor/MapEditorLayersTab';
import { SceneLayerManager } from '../rendering/SceneLayerManager';
import type { SceneGroundLayerConfig, SceneLayerInput, SceneLayerStack } from '../rendering/SceneLayerTypes';

// ---------------------------------------------------------------------------
// Types manifest
// ---------------------------------------------------------------------------

interface FloorConfig {
    baseColor:   string;
    stripeColor: string;
    accentColor: string;
    stripeWidth: number;
    noiseAmp:    number;
    noiseFreq:   number;
}

interface PropDef {
    file:       string;
    type:       string;
    biomes?:    string[];
    scaleRange: [number, number];
}

interface AnimatedPropDef extends PropDef {
    cols: number;
    rows: number;
    frameWidth?: number | null;
    frameHeight?: number | null;
    fps: number;
    animations?: Record<string, { frames: number[]; fps?: number; loop?: boolean }>;
}

type PropLayer = "back" | "mid" | "front";

interface SkyColors   { zenith: string; horizon: string; ground: string; }
interface SunConfig   { color: string; x: number; y: number; radius: number; glowRadius: number; }
interface CloudConfig { color: string; count: number; }
interface SilhouetteConfig {
    shape: "tree_line"|"hill"|"mountain"|"city_line"|"ruins_line";
    color: string; y: number; density: number;
}
interface FogConfig { color: string; opacity: number; }

interface BiomeDef {
    floor:       FloorConfig;
    skyColors:   SkyColors;
    sun:         SunConfig;
    clouds:      CloudConfig;
    silhouettes: SilhouetteConfig[];
    fog:         FogConfig;
    propWeights: Record<string, number>;
    animatedPropWeights?: Record<string, number>;
}

interface EditorManifest {
    props:         PropDef[];
    animatedProps?: AnimatedPropDef[];
    backgrounds?:  string[];
    biomeLayerPresets?: Record<string, any>;
    floors:        string[];
    biomes:        Record<string, BiomeDef>;
}

// ---------------------------------------------------------------------------
// RNG & helpers
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s += 0x6D2B79F5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hexToRgb(h: string): [number,number,number] {
    return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}

function weightedPick(w: Record<string,number>, rng: ()=>number): string|null {
    const e = Object.entries(w).filter(([,v])=>v>0);
    if (!e.length) return null;
    const t = e.reduce((s,[,v])=>s+v,0);
    let r = rng()*t;
    for (const [k,v] of e) { r-=v; if (r<=0) return k; }
    return e[e.length-1][0];
}

// ---------------------------------------------------------------------------
// Ground painter — riche, organique, palette par biome
// ---------------------------------------------------------------------------

const GND = 512;

function paintGround(ctx: CanvasRenderingContext2D, cfg: FloorConfig, seed: number): void {
    const rng = makeRng(seed);
    const w = GND, h = GND;

    // 1. Base fill
    ctx.fillStyle = cfg.baseColor;
    ctx.fillRect(0, 0, w, h);

    // 2. Rayures diagonales douces
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = cfg.stripeColor;
    ctx.lineWidth   = cfg.stripeWidth;
    for (let x = -h; x < w + h; x += cfg.stripeWidth * 7) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
    }
    ctx.restore();

    // 3. Grandes taches organiques d'accent (style herbe/mousse/cailloux)
    const [ar, ag, ab] = hexToRgb(cfg.accentColor);
    const patchCount = 18 + Math.floor(rng() * 12);
    for (let i = 0; i < patchCount; i++) {
        const px = rng() * w, py = rng() * h;
        const pr = 20 + rng() * 55;
        const pa = 0.08 + rng() * 0.16;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0,   `rgba(${ar},${ag},${ab},${pa})`);
        grad.addColorStop(0.6, `rgba(${ar},${ag},${ab},${pa*0.5})`);
        grad.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = grad;
        ctx.save();
        ctx.scale(1, 0.45 + rng() * 0.4);
        ctx.beginPath();
        ctx.arc(px, py / (0.45 + rng() * 0.4), pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 4. Micro-dots de bruit fin (texture grain)
    const [br, bg, bb] = hexToRgb(cfg.baseColor);
    const [sr, sg, sb] = hexToRgb(cfg.stripeColor);
    const dotCount = Math.floor(w * h / 28);
    for (let i = 0; i < dotCount; i++) {
        const dx = rng() * w, dy = rng() * h;
        const dr = 1.5 + rng() * cfg.noiseAmp * 0.6;
        const mix = rng();
        const r = Math.round(br + (sr-br)*mix);
        const g = Math.round(bg + (sg-bg)*mix);
        const b = Math.round(bb + (sb-bb)*mix);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.06 + rng()*0.14})`;
        ctx.beginPath();
        ctx.ellipse(dx, dy, dr, dr*(0.4+rng()*0.5), rng()*Math.PI, 0, Math.PI*2);
        ctx.fill();
    }

    // 5. Vignette bords
    const vig = ctx.createRadialGradient(w/2,h/2,w*0.2, w/2,h/2,w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Sky painter
// ---------------------------------------------------------------------------

const SKY_W = 512, SKY_H = 256;

function paintSky(ctx: CanvasRenderingContext2D, def: BiomeDef, seed: number): void {
    const w = SKY_W, h = SKY_H;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,    def.skyColors.zenith);
    bg.addColorStop(0.58, def.skyColors.horizon);
    bg.addColorStop(1,    def.skyColors.ground);
    ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);

    const sun = def.sun;
    const sx = sun.x*w, sy = sun.y*h;
    const [sr,sg,sb] = hexToRgb(sun.color);
    const glow = ctx.createRadialGradient(sx,sy,0,sx,sy,sun.glowRadius);
    glow.addColorStop(0,   `rgba(${sr},${sg},${sb},0.55)`);
    glow.addColorStop(0.4, `rgba(${sr},${sg},${sb},0.20)`);
    glow.addColorStop(1,   `rgba(${sr},${sg},${sb},0.00)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx,sy,sun.glowRadius,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = sun.color; ctx.beginPath(); ctx.arc(sx,sy,sun.radius,0,Math.PI*2); ctx.fill();

    const crng = makeRng(seed);
    const [cr,cg,cb] = hexToRgb(def.clouds.color);
    for (let i=0; i<def.clouds.count; i++) {
        const cx=crng()*w, cy=crng()*h*0.5, cw=40+crng()*80, ch=12+crng()*22, ca=0.25+crng()*0.35;
        const cg2 = ctx.createRadialGradient(cx,cy,0,cx,cy,cw*0.6);
        cg2.addColorStop(0,   `rgba(${cr},${cg},${cb},${ca})`);
        cg2.addColorStop(0.6, `rgba(${cr},${cg},${cb},${ca*0.5})`);
        cg2.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = cg2;
        ctx.save(); ctx.scale(1, ch/(cw*0.6));
        ctx.beginPath(); ctx.arc(cx, cy*(cw*0.6)/ch, cw*0.6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
    for (const sil of def.silhouettes) paintSilhouette(ctx, sil, w, h, seed + sil.y*1000);
    if (def.fog.opacity > 0) {
        const [fr,fg,fb] = hexToRgb(def.fog.color);
        const fog = ctx.createLinearGradient(0,h*0.45,0,h*0.80);
        fog.addColorStop(0,   `rgba(${fr},${fg},${fb},0)`);
        fog.addColorStop(0.4, `rgba(${fr},${fg},${fb},${def.fog.opacity})`);
        fog.addColorStop(1,   `rgba(${fr},${fg},${fb},0)`);
        ctx.fillStyle = fog; ctx.fillRect(0,0,w,h);
    }
}

function paintSilhouette(ctx: CanvasRenderingContext2D, sil: SilhouetteConfig, w: number, h: number, seed: number): void {
    const baseY = sil.y*h;
    ctx.fillStyle = sil.color; ctx.beginPath();
    const rng = makeRng(seed*999|0);
    switch (sil.shape) {
        case "tree_line": {
            const tw=18+12*sil.density, sp=tw*(1.2-sil.density*0.3);
            ctx.moveTo(0,h);
            for (let x=-tw; x<w+tw; x+=sp*(0.7+rng()*0.6)) {
                const th=(20+rng()*28)*sil.density, tx=x+(rng()-0.5)*10;
                ctx.lineTo(tx-tw*0.4,baseY);
                ctx.bezierCurveTo(tx-tw*0.5,baseY-th*0.8, tx+tw*0.5,baseY-th*0.8, tx+tw*0.4,baseY);
            }
            ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); break;
        }
        case "hill": {
            ctx.moveTo(0,h); ctx.lineTo(0,baseY+10);
            let x=0;
            while (x<w) { const hw=60+rng()*100,hh=(15+rng()*30)*sil.density; ctx.bezierCurveTo(x+hw*0.25,baseY-hh,x+hw*0.75,baseY-hh,x+hw,baseY+rng()*8); x+=hw; }
            ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); break;
        }
        case "mountain": {
            ctx.moveTo(0,h); ctx.lineTo(0,baseY+20);
            let mx=-30;
            while (mx<w+30) {
                const mw=50+rng()*90, mh=(40+rng()*60)*sil.density, tip=mx+mw*0.5+(rng()-0.5)*20;
                ctx.lineTo(tip-mw*0.1+(rng()-0.5)*12,baseY-mh*0.7); ctx.lineTo(tip,baseY-mh);
                ctx.lineTo(tip+mw*0.1+(rng()-0.5)*12,baseY-mh*0.7); ctx.lineTo(mx+mw,baseY+rng()*10);
                mx+=mw*(0.6+rng()*0.5);
            }
            ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); break;
        }
        case "city_line": {
            ctx.moveTo(0,h); ctx.lineTo(0,baseY);
            let bx=0;
            while (bx<w) {
                const bw=12+rng()*30, bh=(20+rng()*55)*sil.density;
                ctx.lineTo(bx,baseY); ctx.lineTo(bx,baseY-bh);
                if (rng()>0.65) { const sw=bw*0.2; ctx.lineTo(bx+bw*0.5-sw,baseY-bh); ctx.lineTo(bx+bw*0.5,baseY-bh-12-rng()*16); ctx.lineTo(bx+bw*0.5+sw,baseY-bh); }
                ctx.lineTo(bx+bw,baseY-bh); ctx.lineTo(bx+bw,baseY); bx+=bw+rng()*6;
            }
            ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); break;
        }
        case "ruins_line": {
            ctx.moveTo(0,h); ctx.lineTo(0,baseY);
            let rx=0;
            while (rx<w) {
                const rw=15+rng()*35, rh=(15+rng()*40)*sil.density;
                ctx.lineTo(rx,baseY); ctx.lineTo(rx,baseY-rh);
                const steps=2+Math.floor(rng()*3);
                for (let s=0;s<steps;s++) ctx.lineTo(rx+(s/steps)*rw, baseY-rh+rng()*rh*0.5);
                ctx.lineTo(rx+rw,baseY-rh*(0.3+rng()*0.5)); ctx.lineTo(rx+rw,baseY);
                rx+=rw+(rng()>0.5?8+rng()*20:0);
            }
            ctx.lineTo(w,h); ctx.closePath(); ctx.fill(); break;
        }
    }
}

// ---------------------------------------------------------------------------
// AnimatedPropSprite
// ---------------------------------------------------------------------------

class AnimatedPropSprite {
    readonly pivot: TransformNode;
    readonly plane: Mesh;
    private texture: Texture;
    private mat: StandardMaterial;
    private observer: Observer<Scene> | null = null;
    private frames: number[];
    private fps: number;
    private cursor = 0;
    private accumulator = 0;

    constructor(
        private scene: Scene,
        private def: AnimatedPropDef,
        px: number,
        py: number,
        pz: number,
        flipX: boolean,
        scale: number,
        private sizeForType: (type: string) => { width: number; height: number },
        clipName: string = "idle"
    ) {
        const base = this.sizeForType(def.type);
        const finalW = base.width * scale;
        const finalH = base.height * scale;

        this.pivot = new TransformNode(`anim_pivot_${Date.now()}_${Math.random()}`, scene);
        this.pivot.position = new Vector3(px, py, pz);

        this.texture = new Texture(`/assets/decorations/${def.file}`, scene, false, true, Texture.NEAREST_SAMPLINGMODE);
        this.texture.hasAlpha = true;
        this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        this.texture.uScale = 1 / Math.max(1, def.cols);
        this.texture.vScale = 1 / Math.max(1, def.rows);

        this.mat = new StandardMaterial(`anim_mat_${Date.now()}`, scene);
        this.mat.diffuseTexture = this.texture;
        this.mat.useAlphaFromDiffuseTexture = true;
        this.mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
        this.mat.backFaceCulling = false;
        this.mat.specularColor = new Color3(0, 0, 0);

        this.plane = MeshBuilder.CreatePlane(`anim_plane_${Date.now()}`, { width: finalW, height: finalH }, scene);
        this.plane.material = this.mat;
        this.plane.parent = this.pivot;
        this.plane.position.y = finalH / 2;
        if (flipX) this.plane.scaling.x = -1;
        this.plane.billboardMode = TransformNode.BILLBOARDMODE_ALL;

        const clip = def.animations?.[clipName] ?? def.animations?.idle;
        this.frames = clip?.frames?.length ? clip.frames : Array.from({ length: def.cols * def.rows }, (_, i) => i);
        this.fps = clip?.fps ?? def.fps ?? 8;
        this.setFrame(this.frames[0] ?? 0);

        this.observer = scene.onBeforeRenderObservable.add(() => this.tick());
    }

    private tick(): void {
        if (this.plane.isDisposed() || !this.frames.length) {
            this.dispose();
            return;
        }
        this.accumulator += this.scene.getEngine().getDeltaTime() / 1000;
        const frameDuration = 1 / Math.max(this.fps, 1);
        while (this.accumulator >= frameDuration) {
            this.accumulator -= frameDuration;
            this.cursor = (this.cursor + 1) % this.frames.length;
            this.setFrame(this.frames[this.cursor]);
        }
    }

    private setFrame(frameIndex: number): void {
        const cols = Math.max(1, this.def.cols);
        const rows = Math.max(1, this.def.rows);
        const safeFrame = Math.max(0, Math.min(frameIndex, cols * rows - 1));
        const col = safeFrame % cols;
        const row = Math.floor(safeFrame / cols);
        this.texture.uOffset = col / cols;
        this.texture.vOffset = 1 - ((row + 1) / rows);
    }

    dispose(): void {
        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
        this.mat.dispose();
        this.texture.dispose();
        this.pivot.dispose();
    }
}


// ---------------------------------------------------------------------------
// MapEditor
// ---------------------------------------------------------------------------

export class MapEditor {
    private engine: Engine;
    private scene:  Scene;
    private canvas: HTMLCanvasElement;

    private camera!:    ArcRotateCamera;
    private grid!:      CombatGrid;
    private propsRoot!: TransformNode;
    private skyRoot!:   TransformNode;

    private customW:  number = 8;
    private customD:  number = 6;
    private tileSize: number = 2;

    private isBrushMode:      boolean = false;
    private manifest:         EditorManifest | null = null;
    private allProps:         PropDef[]             = [];
    private allAnimatedProps: AnimatedPropDef[]     = [];
    private animatedSprites:  Map<TransformNode, AnimatedPropSprite> = new Map();
    private selectedAsset:    string  = "";
    private selectedIsAnimated: boolean = false;
    private selectedLayer:    PropLayer = "mid";
    private symmetryEnabled:  boolean = false;
    private customOffsetY:    number  = 0.0;
    private customScale:      number  = 1.0;

    public currentBiome:   string = "forest";
    private currentGridElevation: number = 0.0;

    private procSeed:    number = 42;
    private procDensity: number = 0.7;
    private cloudSeed:   number = 0;
    private groundSeed:  number = 1;

    private bgPlane!:         Mesh;
    private skyDynTex!:       DynamicTexture;
    private terrainPlane!:    Mesh;
    private groundDynTex!:    DynamicTexture;
    private terrainMaterial!: StandardMaterial;
    private groundTexture: Texture | null = null;
    private groundLayerConfig: SceneGroundLayerConfig = {
        enabled: false,
        mode: "procedural",
        textureFile: null,
        color: "#163018",
        opacity: 0.025,
        repeatX: 8,
        repeatY: 8,
        xOffset: 0,
        zOffset: 0,
        elevationOffset: 0,
        widthScale: 12,
        depthScale: 12,
    };
    private layerPreviewRoot!: TransformNode;
    private layerManager: SceneLayerManager | null = null;
    private layersTab: MapEditorLayersTab | null = null;

    private static readonly SAFE_CLEARANCE = 2.5;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new Engine(canvas, true);
        this.scene  = new Scene(this.engine);
        this.scene.clearColor = new Color3(0.05, 0.07, 0.10).toColor4();
    }

    public async start(): Promise<void> {
        this.setupCamera();
        const light = new HemisphericLight("edLight", new Vector3(0,1,0), this.scene);
        light.intensity = 1.0;
        this.propsRoot = new TransformNode("PropsRoot", this.scene);
        this.skyRoot   = new TransformNode("SkyRoot",   this.scene);
        this.layerPreviewRoot = new TransformNode("LayerPreviewRoot", this.scene);
        await this.loadManifest();
        this.rebuildCombatGrid();
        this.buildEditorScenery();
        this.buildHTMLToolbar();
        this.registerPointerEvents();
        this.engine.runRenderLoop(() => this.scene.render());
        window.addEventListener('resize', () => this.engine.resize());
    }

    private setupCamera(): void {
        this.camera = new ArcRotateCamera("editorCam",
            -Math.PI / 2,
            Math.PI / 3.5,
            25,
            Vector3.Zero(),
            this.scene
        );
        this.camera.lowerRadiusLimit     = 8;
        this.camera.upperRadiusLimit     = 90;
        this.camera.lowerBetaLimit       = 0.15;
        this.camera.upperBetaLimit       = Math.PI / 2.05;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(this.canvas, true);
    }

    private focusLayerPreviewCamera(): void {
        const mapD = this.customD * this.tileSize;
        this.camera.alpha = -Math.PI / 2;
        this.camera.beta = Math.PI / 3.1;
        this.camera.radius = Math.max(24, mapD * 2.6);
        this.camera.target = new Vector3(0, this.currentGridElevation + 7.5, mapD / 2 + 8);
    }

    private async loadManifest(): Promise<void> {
        try {
            const r = await fetch("/data/editor_manifest.json");
            if (r.ok) {
                this.manifest = await r.json() as EditorManifest;
                this.allProps = this.manifest.props || [];
                this.allAnimatedProps = this.manifest.animatedProps || [];
                if (this.allProps.length) {
                    this.selectedAsset = this.allProps[0].file;
                    this.selectedIsAnimated = false;
                } else if (this.allAnimatedProps.length) {
                    this.selectedAsset = this.allAnimatedProps[0].file;
                    this.selectedIsAnimated = true;
                }
            }
        } catch { console.warn("MapEditor: editor_manifest.json not found"); }
    }

    private getBiomeDef(b: string): BiomeDef | null {
        return this.manifest?.biomes?.[b] ?? null;
    }

    private getPropsForBiome(types: string[]): PropDef[] {
        return this.allProps.filter(p => types.includes(p.type));
    }

    private getAnimatedPropsForBiome(types: string[]): AnimatedPropDef[] {
        return this.allAnimatedProps.filter(p => types.includes(p.type));
    }

    private pick<T>(arr: T[], rng: ()=>number): T|null {
        return arr.length ? arr[Math.floor(rng()*arr.length)] : null;
    }

    // -------------------------------------------------------------------------
    private rebuildCombatGrid(): void {
        if (this.grid) this.grid.dispose();
        const cfg: GridConfig = {
            width: this.customW, depth: this.customD,
            tileSize: this.tileSize, baseHeight: 0, maxHeight: 0, noiseScale: 0, flat: true,
            gridElevation: this.currentGridElevation
        };
        this.grid = new CombatGrid(this.scene, cfg);
        this.grid.showReachable([]);
        for (let x=0;x<this.customW;x++) for (let z=0;z<this.customD;z++) {
            const t = this.grid.getTile(x,z);
            if (t?.mesh?.material) {
                t.mesh.material.alpha = 0.2;
                t.mesh.edgesWidth = 1.5;
                t.mesh.edgesColor = new Color4(0,0.8,1,0.4);
            }
        }
    }

    private buildEditorScenery(): void {
        const mapW = this.customW * this.tileSize;
        const mapD = this.customD * this.tileSize;

        // Sol procédural DynamicTexture
        this.terrainPlane = MeshBuilder.CreateGround(
            "terrainBase", { width: mapW, height: mapD }, this.scene
        );
        this.terrainPlane.isPickable = false;

        this.groundDynTex    = new DynamicTexture("groundTex", { width: GND, height: GND }, this.scene, true);
        this.terrainMaterial = new StandardMaterial("terrainMat", this.scene);
        this.terrainMaterial.specularColor   = new Color3(0, 0, 0);
        this.terrainMaterial.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
        this.terrainPlane.material = this.terrainMaterial;
        this.repaintGround();
        this.applyGroundLayerConfig();

        // Ciel procédural DynamicTexture
        this.bgPlane = MeshBuilder.CreatePlane("skyBg", { width: 220, height: 110 }, this.scene);
        this.bgPlane.position   = new Vector3(0, 42, mapD + 60);
        this.bgPlane.isPickable = false;
        this.skyDynTex = new DynamicTexture("skyDynTex", { width: SKY_W, height: SKY_H }, this.scene, true);
        const skyMat = new StandardMaterial("skyBgMat", this.scene);
        skyMat.diffuseTexture  = this.skyDynTex;
        skyMat.emissiveColor   = new Color3(1,1,1);
        skyMat.specularColor   = new Color3(0,0,0);
        skyMat.disableLighting = true;
        skyMat.backFaceCulling = false;
        this.bgPlane.material  = skyMat;
        this.bgPlane.parent    = this.skyRoot;
        this.repaintSky();
        this.bgPlane.setEnabled(false);
        this.rebuildSceneLayers();
    }

    private mergeGroundLayerConfig(raw?: Partial<SceneGroundLayerConfig>): SceneGroundLayerConfig {
        return {
            ...this.groundLayerConfig,
            ...(raw ?? {}),
            enabled: raw?.enabled ?? this.groundLayerConfig.enabled,
            textureFile: raw?.textureFile ?? null,
            mode: raw?.mode ?? this.groundLayerConfig.mode,
        };
    }

    private colorFromHex(hex: string): Color3 {
        try { return Color3.FromHexString(hex); }
        catch { return new Color3(0.08, 0.16, 0.08); }
    }

    private applyGroundLayerConfig(): void {
        if (!this.terrainPlane || !this.terrainMaterial) return;
        const cfg = this.groundLayerConfig;
        const mapD = this.customD * this.tileSize;

        this.terrainPlane.setEnabled(cfg.enabled);
        this.terrainPlane.position.x = cfg.xOffset;
        this.terrainPlane.position.y = this.currentGridElevation + cfg.elevationOffset;
        this.terrainPlane.position.z = mapD / 2 + cfg.zOffset;
        this.terrainPlane.scaling.x = Math.max(0.1, cfg.widthScale);
        this.terrainPlane.scaling.z = Math.max(0.1, cfg.depthScale);
        this.terrainPlane.isPickable = false;

        if (this.groundTexture) {
            this.groundTexture.dispose();
            this.groundTexture = null;
        }

        const baseColor = this.colorFromHex(cfg.color);
        this.terrainMaterial.diffuseTexture = null;
        this.terrainMaterial.diffuseColor = baseColor;
        this.terrainMaterial.emissiveColor = baseColor.scale(0.35);
        this.terrainMaterial.alpha = cfg.opacity;
        this.terrainMaterial.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
        this.terrainMaterial.disableDepthWrite = cfg.opacity < 1;

        if (cfg.mode === "texture" && cfg.textureFile) {
            this.groundTexture = new Texture(
                this.backgroundPath(cfg.textureFile),
                this.scene,
                false,
                true,
                Texture.BILINEAR_SAMPLINGMODE
            );
            this.groundTexture.wrapU = Texture.WRAP_ADDRESSMODE;
            this.groundTexture.wrapV = Texture.WRAP_ADDRESSMODE;
            this.groundTexture.uScale = cfg.repeatX;
            this.groundTexture.vScale = cfg.repeatY;
            this.groundTexture.hasAlpha = true;
            this.terrainMaterial.diffuseTexture = this.groundTexture;
            this.terrainMaterial.useAlphaFromDiffuseTexture = true;
            this.terrainMaterial.emissiveColor = new Color3(0.03, 0.05, 0.03);
        } else if (cfg.mode === "procedural") {
            this.groundDynTex.uScale = cfg.repeatX;
            this.groundDynTex.vScale = cfg.repeatY;
            this.terrainMaterial.diffuseTexture = this.groundDynTex;
            this.terrainMaterial.useAlphaFromDiffuseTexture = false;
            this.terrainMaterial.emissiveColor = new Color3(0.04, 0.06, 0.03);
        }
    }

    private rebuildSceneLayers(overrides?: SceneLayerInput): void {
        if (!this.layerPreviewRoot) return;
        const mapW = this.customW * this.tileSize;
        const mapD = this.customD * this.tileSize;
        this.layerManager?.dispose();
        this.layerManager = new SceneLayerManager(
            this.scene,
            this.layerPreviewRoot,
            mapW,
            mapD,
            0
        );
        this.layerManager.buildLayers(
            this.currentBiome,
            overrides ?? this.layersTab?.getSceneLayersForBiome(this.currentBiome)
        );
    }

    private createEmptySceneLayerStack(): SceneLayerStack {
        return {
            id: `${this.currentBiome}_empty_layers`,
            biome: this.currentBiome,
            layers: [],
            particleColor: [0.4, 1, 0.2],
            particleCount: 0,
            particleAlpha: [0.06, 0.2],
        };
    }

    public repaintGround(): void {
        const def = this.getBiomeDef(this.currentBiome);
        const fallback: FloorConfig = { baseColor:"#2a5c18", stripeColor:"#1e4a10", accentColor:"#3a7020", stripeWidth:2, noiseAmp:10, noiseFreq:0.09 };
        const cfg: FloorConfig = (def?.floor && typeof def.floor === 'object') ? def.floor as FloorConfig : fallback;
        const ctx = this.groundDynTex.getContext() as CanvasRenderingContext2D;
        paintGround(ctx, cfg, this.groundSeed);
        this.groundDynTex.update();
    }

    public repaintSky(): void {
        const def = this.getBiomeDef(this.currentBiome);
        if (!def) return;
        const ctx = this.skyDynTex.getContext() as CanvasRenderingContext2D;
        paintSky(ctx, def, this.cloudSeed);
        this.skyDynTex.update();
    }

    public refreshBiome(biome: string): void {
        this.currentBiome = biome;
        this.repaintGround();
        this.repaintSky();
        this.rebuildSceneLayers();
        this.refreshAssetListUI();
    }

    // -------------------------------------------------------------------------
    // Grid bounds helper
    // -------------------------------------------------------------------------

    private getGridBounds(): { xMin: number; xMax: number; zMin: number; zMax: number } {
        let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
        for (let x = 0; x < this.customW; x++) {
            for (let z = 0; z < this.customD; z++) {
                const tile = this.grid.getTile(x, z);
                if (tile?.mesh) {
                    const pos = tile.mesh.position;
                    xMin = Math.min(xMin, pos.x - this.tileSize/2);
                    xMax = Math.max(xMax, pos.x + this.tileSize/2);
                    zMin = Math.min(zMin, pos.z - this.tileSize/2);
                    zMax = Math.max(zMax, pos.z + this.tileSize/2);
                }
            }
        }
        if (!isFinite(xMin)) {
            const w = this.customW * this.tileSize;
            const d = this.customD * this.tileSize;
            return { xMin: 0, xMax: w, zMin: 0, zMax: d };
        }
        return { xMin, xMax, zMin, zMax };
    }

    // -------------------------------------------------------------------------
    // Spawn d'un prop individuel
    // -------------------------------------------------------------------------

    private propPath(f: string): string { return `/assets/decorations/${f}`; }
    private backgroundPath(f: string): string { return `/assets/backgrounds/${f}`; }

    private getMirrorX(x: number): number {
        const { xMin, xMax } = this.getGridBounds();
        return xMin + xMax - x;
    }

    private getBasePropSize(type: string): { width: number; height: number } {
        let width = 1.8, height = 2.2;
        if      (type==="tree" || type==="tree_sway")       { width=2.4; height=3.0; }
        else if (type==="cliff")                            { width=3.2; height=2.2; }
        else if (type==="ruins")                            { width=2.4; height=2.8; }
        else if (type==="altar")                            { width=2.2; height=1.8; }
        else if (type==="torch" || type==="torch_flicker")  { width=0.9; height=2.6; }
        else if (type==="statue")                           { width=1.8; height=3.2; }
        else if (type==="pillar")                           { width=1.0; height=2.4; }
        else if (type==="rock")                             { width=1.6; height=1.2; }
        else if (type==="bush" || type==="bush_wind")       { width=1.4; height=1.2; }
        else if (type==="flower" || type==="flower_sway")   { width=1.0; height=1.0; }
        else if (type==="grass" || type==="grass_wind")     { width=1.2; height=1.0; }
        else if (type==="waterfall")                        { width=3.0; height=2.0; }
        else if (type==="unique")                           { width=2.0; height=2.0; }
        return { width, height };
    }

    private spawnAnimatedProp(
        def: AnimatedPropDef,
        pX: number, pY: number, pZ: number,
        flipX: boolean,
        scale: number = 1.0,
        isProcedural: boolean = false,
        layer: PropLayer = this.selectedLayer,
        animClip: string = "idle"
    ): void {
        const sprite = new AnimatedPropSprite(
            this.scene, def, pX, pY, pZ, flipX, scale,
            type => this.getBasePropSize(type),
            animClip
        );
        sprite.pivot.parent = this.propsRoot;
        (sprite.pivot as any).isProcedural = isProcedural;
        (sprite.pivot as any).isAnimated = true;
        (sprite.pivot as any).editorMetaData = {
            assetName: def.file, isFlippedX: flipX,
            animated: true, animClip, layer,
            x: Number(pX.toFixed(3)),
            y: Number(pY.toFixed(3)),
            z: Number(pZ.toFixed(3)),
            scale: Number(scale.toFixed(3)),
        };
        this.animatedSprites.set(sprite.pivot, sprite);
    }

    private spawnProp(
        assetFile: string, pX: number, pY: number, pZ: number,
        flipX: boolean,
        scale: number = 1.0,
        isProcedural: boolean = false,
        layer: PropLayer = this.selectedLayer
    ): void {
        const propDef = this.allProps.find(p => p.file === assetFile);
        const type = propDef?.type ?? "";
        const baseSize = this.getBasePropSize(type);
        const fW = baseSize.width * scale, fH = baseSize.height * scale;

        const pivot = new TransformNode(`ep_${Date.now()}_${Math.random()}`, this.scene);
        pivot.position = new Vector3(pX, pY, pZ);
        pivot.parent   = this.propsRoot;
        (pivot as any).isProcedural = isProcedural;

        const mat = new StandardMaterial(`pm_${Date.now()}`, this.scene);
        mat.backFaceCulling = false;
        const tex = new Texture(
            this.propPath(assetFile), this.scene, false, true,
            Texture.BILINEAR_SAMPLINGMODE, ()=>{}, ()=>{ mat.diffuseTexture = null; }
        );
        tex.hasAlpha = true; tex.getAlphaFromRGB = false;
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
        mat.specularColor = new Color3(0,0,0);

        const plane = MeshBuilder.CreatePlane(`ep_${assetFile.replace('/','_')}`, { width: fW, height: fH }, this.scene);
        plane.material      = mat;
        plane.parent        = pivot;
        plane.position.y    = fH / 2;
        if (flipX) plane.scaling.x = -1;
        plane.billboardMode = 7;

        (pivot as any).editorMetaData = {
            assetName: assetFile, isFlippedX: flipX,
            animated: false, layer,
            x: Number(pX.toFixed(3)), y: Number(pY.toFixed(3)), z: Number(pZ.toFixed(3)),
            scale: Number(scale.toFixed(3)),
        };
    }

    private disposeChild(child: any): void {
        if (this.animatedSprites.has(child)) {
            this.animatedSprites.get(child)!.dispose();
            this.animatedSprites.delete(child);
        } else {
            child.dispose();
        }
    }

    // -------------------------------------------------------------------------
    // Toolbar
    // -------------------------------------------------------------------------

    private buildHTMLToolbar(): void {
        const ui = document.createElement("div");
        const bgFiles = this.manifest?.backgrounds ?? [];
        const groundTextureOptions = [
            `<option value="">Aucune image</option>`,
            ...bgFiles.map(file => `<option value="${file}" ${file === this.groundLayerConfig.textureFile ? "selected" : ""}>${file}</option>`)
        ].join("");
        ui.id = "editor-ui";
        ui.style.cssText = `
            position:absolute;top:10px;left:10px;width:272px;
            background:rgba(7,9,14,0.95);color:#c4ccd6;
            font-family:'JetBrains Mono',monospace,sans-serif;font-size:11px;
            border-radius:8px;border:1px solid rgba(255,255,255,0.07);
            max-height:93vh;overflow-y:auto;user-select:none;
        `;

        ui.innerHTML = `
        <style>
        #editor-ui h2{margin:0;padding:10px 14px 8px;font-size:12px;font-weight:700;
            letter-spacing:.08em;color:#e6ecf2;text-transform:uppercase;
            border-bottom:1px solid rgba(255,255,255,.06);}
        #editor-ui .tabs{display:flex;gap:2px;padding:7px 10px 0;}
        #editor-ui .tab-btn{flex:1;padding:5px 0;background:#14161e;color:#6878a0;border:none;
            cursor:pointer;font-size:10px;border-bottom:2px solid transparent;border-radius:4px 4px 0 0;}
        #editor-ui .tab-btn.active{background:#1e2230;color:#dce8f4;border-bottom-color:#5a8fcc;font-weight:700;}
        #editor-ui .editor-tab{padding:10px 13px;}
        #editor-ui .sec{background:rgba(255,255,255,.04);border-radius:6px;padding:8px;margin-bottom:8px;}
        #editor-ui .sec-t{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#5a8fcc;margin-bottom:7px;font-weight:700;}
        #editor-ui .row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
        #editor-ui .row label{flex:1;color:#7a8a9c;white-space:nowrap;font-size:10px;}
        #editor-ui .val{min-width:36px;text-align:right;color:#dce8f4;font-weight:600;font-size:10px;}
        #editor-ui input[type=range]{flex:2;-webkit-appearance:none;height:3px;background:rgba(255,255,255,.12);border-radius:2px;outline:none;}
        #editor-ui input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;background:#5a8fcc;border-radius:50%;cursor:pointer;}
        #editor-ui select,#editor-ui input[type=number],#editor-ui input[type=color]{background:rgba(255,255,255,.07);color:#c4ccd6;
            border:1px solid rgba(255,255,255,.09);border-radius:4px;padding:3px 6px;font-size:11px;}
        #editor-ui .btn-row{display:flex;gap:5px;padding:7px 13px;}
        #editor-ui .btn{flex:1;padding:7px 0;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;}
        #editor-ui .mode-bar{display:flex;gap:6px;padding:8px 13px 0;}
        #editor-ui .anim-badge{color:#d8b4fe;font-size:9px;font-weight:800;margin-left:3px;}
        </style>

        <h2>GPA Map Editor</h2>
        <div class="mode-bar">
            <button id="modeCam"   class="btn" style="background:#1a3570;color:#90c0f8;">Cam</button>
            <button id="modeBrush" class="btn" style="background:#1e2030;color:#8090a8;">Placer</button>
        </div>
        <div class="tabs">
            <button class="tab-btn active" data-tab="tab-layers">Layers</button>
            <button class="tab-btn"        data-tab="tab-grid">Grille</button>
            <button class="tab-btn"        data-tab="tab-props">Props</button>
            <button class="tab-btn"        data-tab="tab-io">I/O</button>
        </div>

        <!-- GRILLE -->
        <div id="tab-grid" class="editor-tab" style="display:none;">
            <div class="sec">
                <div class="sec-t">Dimensions grille</div>
                <div class="row">
                    <label>W</label><input type="number" id="gridW" value="${this.customW}" min="4" max="25" style="width:44px;"/>
                    <label>D</label><input type="number" id="gridD" value="${this.customD}" min="4" max="25" style="width:44px;"/>
                </div>
            </div>
            <div class="sec">
                <div class="sec-t">Elevation grille combat</div>
                <div class="row">
                    <label>Grid Y</label>
                    <input type="range" id="gridElevationSlider" min="-2" max="4" step="0.1" value="${this.currentGridElevation}"/>
                    <span class="val" id="gridElevationVal">${this.currentGridElevation.toFixed(1)}</span>
                </div>
            </div>
            <div class="sec">
                <div class="sec-t">Sol horizontal</div>
                <div class="row">
                    <input type="checkbox" id="groundEnabled" ${this.groundLayerConfig.enabled ? "checked" : ""}/>
                    <label for="groundEnabled" style="cursor:pointer;color:#b0bcc8;">Activer le sol</label>
                </div>
                <div class="row">
                    <label>Mode</label>
                    <select id="groundMode" style="flex:2;">
                        <option value="procedural" ${this.groundLayerConfig.mode === "procedural" ? "selected" : ""}>procedural</option>
                        <option value="texture" ${this.groundLayerConfig.mode === "texture" ? "selected" : ""}>texture repeat</option>
                        <option value="color" ${this.groundLayerConfig.mode === "color" ? "selected" : ""}>couleur</option>
                    </select>
                </div>
                <div class="row">
                    <label>Image</label>
                    <select id="groundTexture" style="flex:2;">${groundTextureOptions}</select>
                </div>
                <div class="row">
                    <label>Couleur</label>
                    <input type="color" id="groundColor" value="${this.groundLayerConfig.color}" style="width:62px;height:26px;"/>
                </div>
                <div class="row"><label>Opacite</label>
                    <input type="range" id="groundOpacity" min="0" max="1" step="0.01" value="${this.groundLayerConfig.opacity}"/>
                    <span class="val" id="groundOpacityVal">${this.groundLayerConfig.opacity.toFixed(2)}</span>
                </div>
                <div class="row"><label>Repeat X</label>
                    <input type="range" id="groundRepeatX" min="1" max="64" step="1" value="${this.groundLayerConfig.repeatX}"/>
                    <span class="val" id="groundRepeatXVal">${this.groundLayerConfig.repeatX.toFixed(0)}</span>
                </div>
                <div class="row"><label>Repeat Y</label>
                    <input type="range" id="groundRepeatY" min="1" max="64" step="1" value="${this.groundLayerConfig.repeatY}"/>
                    <span class="val" id="groundRepeatYVal">${this.groundLayerConfig.repeatY.toFixed(0)}</span>
                </div>
                <div class="row"><label>Offset X</label>
                    <input type="range" id="groundOffsetX" min="-80" max="80" step="0.5" value="${this.groundLayerConfig.xOffset}"/>
                    <span class="val" id="groundOffsetXVal">${this.groundLayerConfig.xOffset.toFixed(1)}</span>
                </div>
                <div class="row"><label>Offset Z</label>
                    <input type="range" id="groundOffsetZ" min="-100" max="140" step="0.5" value="${this.groundLayerConfig.zOffset}"/>
                    <span class="val" id="groundOffsetZVal">${this.groundLayerConfig.zOffset.toFixed(1)}</span>
                </div>
                <div class="row"><label>Offset Y</label>
                    <input type="range" id="groundElevationOffset" min="-10" max="10" step="0.1" value="${this.groundLayerConfig.elevationOffset}"/>
                    <span class="val" id="groundElevationOffsetVal">${this.groundLayerConfig.elevationOffset.toFixed(1)}</span>
                </div>
                <div class="row"><label>Largeur</label>
                    <input type="range" id="groundWidthScale" min="0.5" max="40" step="0.5" value="${this.groundLayerConfig.widthScale}"/>
                    <span class="val" id="groundWidthScaleVal">x${this.groundLayerConfig.widthScale.toFixed(1)}</span>
                </div>
                <div class="row"><label>Profondeur</label>
                    <input type="range" id="groundDepthScale" min="0.5" max="40" step="0.5" value="${this.groundLayerConfig.depthScale}"/>
                    <span class="val" id="groundDepthScaleVal">x${this.groundLayerConfig.depthScale.toFixed(1)}</span>
                </div>
            </div>
        </div>

        <!-- OBJETS -->
        <div id="tab-props" class="editor-tab" style="display:none;">
            <div class="sec">
                <div class="sec-t">Props secondaires</div>
                <div class="row"><label>Echelle</label>
                    <input type="range" id="objScale" min="0.1" max="5" step="0.05" value="1"/>
                    <span class="val" id="valScale">x1.00</span>
                </div>
                <div class="row"><label>Offset Y</label>
                    <input type="range" id="objOffY" min="-1" max="3" step="0.1" value="0"/>
                    <span class="val" id="valOffY">0.0</span>
                </div>
                <div class="row"><label>Layer</label>
                    <select id="propLayerSelect" style="flex:2;">
                        <option value="back">back</option>
                        <option value="mid" selected>mid</option>
                        <option value="front">front</option>
                    </select>
                </div>
                <div class="row">
                    <input type="checkbox" id="symToggle"/>
                    <label for="symToggle" style="cursor:pointer;color:#b0bcc8;font-size:11px;">Dupliquer miroir X</label>
                </div>
                <div style="font-size:10px;color:#506070;margin-top:2px;">Clic G: poser - Clic D: supprimer</div>
            </div>
            <div class="sec-t" style="padding:0 0 5px;">Bibliotheque props</div>
            <div style="font-size:9px;color:#506070;margin-bottom:5px;">Secondaire : les layers portent le decor principal. Tous les props restent utilisables dans tous les biomes.</div>
            <div class="sec-t" style="padding:0 0 4px;">Animes <span class="anim-badge">ANIM</span></div>
            <div id="asset-list-anim" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;
                max-height:120px;overflow-y:auto;border:1px solid #2a1a4a;
                padding:4px;background:#0a0610;border-radius:5px;margin-bottom:6px;">
                ${this.buildAssetListHTML(true)}
            </div>
            <div class="sec-t" style="padding:0 0 4px;">Statiques</div>
            <div id="asset-list-static" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;
                max-height:230px;overflow-y:auto;border:1px solid #1e2030;
                padding:4px;background:#060810;border-radius:5px;">
                ${this.buildAssetListHTML(false)}
            </div>
        </div>

        <!-- LAYERS PNG -->
        <div id="tab-layers" class="editor-tab"></div>

        <!-- I/O -->
        <div id="tab-io" class="editor-tab" style="display:none;">
            <div class="btn-row" style="flex-direction:column;gap:7px;">
                <button id="btnExport" class="btn" style="background:#1a4a1a;color:#70e070;">Exporter JSON</button>
                <input type="file" id="fileImport" accept=".json" style="display:none;"/>
                <button id="btnImportTrigger" class="btn" style="background:#4a3010;color:#f0b060;">Importer JSON</button>
            </div>
        </div>
        `;

        document.body.appendChild(ui);
        this.bindToolbarEvents(ui);
    }

    private buildAssetListHTML(animated: boolean): string {
        const visible = animated ? this.allAnimatedProps : this.allProps;
        if (!visible.length)
            return `<div style="color:#506070;font-size:10px;padding:8px;grid-column:1/-1;">Aucun asset ${animated ? "anime" : "statique"}.</div>`;
        return visible.map(p => `
            <div class="asset-btn" data-asset="${p.file}" data-animated="${animated ? "1" : "0"}" title="${p.type}"
                 style="position:relative;height:58px;cursor:pointer;
                        border:2px solid ${p.file===this.selectedAsset?'#5a8fcc':'transparent'};
                        background:${animated ? "#0e0a18" : "#0d0f18"};border-radius:4px;overflow:hidden;
                        display:flex;flex-direction:column;justify-content:center;align-items:center;">
                <img src="${this.propPath(p.file)}"
                     style="max-width:90%;max-height:40px;object-fit:contain;pointer-events:none;"/>
                <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.80);
                            font-size:9px;text-align:center;padding:1px;color:${animated ? "#c8a0f8" : "#7a90a8"};">${p.type}${animated ? '<span class="anim-badge">ANIM</span>' : ''}</div>
            </div>`
        ).join("");
    }

    private refreshAssetListUI(): void {
        const anim = document.getElementById("asset-list-anim");
        if (anim) anim.innerHTML = this.buildAssetListHTML(true);
        const stat = document.getElementById("asset-list-static");
        if (stat) stat.innerHTML = this.buildAssetListHTML(false);
        this.bindAssetBtns(document.getElementById("editor-ui")!);
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    private syncGroundLayerControls(): void {
        const setInput = (id: string, value: string | number | boolean) => {
            const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
            if (!el) return;
            if (typeof value === "boolean" && "checked" in el) {
                (el as HTMLInputElement).checked = value;
            } else {
                el.value = String(value);
            }
        };

        setInput("groundEnabled", this.groundLayerConfig.enabled);
        setInput("groundMode", this.groundLayerConfig.mode);
        setInput("groundTexture", this.groundLayerConfig.textureFile ?? "");
        setInput("groundColor", this.groundLayerConfig.color);
        setInput("groundOpacity", this.groundLayerConfig.opacity);
        setInput("groundRepeatX", this.groundLayerConfig.repeatX);
        setInput("groundRepeatY", this.groundLayerConfig.repeatY);
        setInput("groundOffsetX", this.groundLayerConfig.xOffset);
        setInput("groundOffsetZ", this.groundLayerConfig.zOffset);
        setInput("groundElevationOffset", this.groundLayerConfig.elevationOffset);
        setInput("groundWidthScale", this.groundLayerConfig.widthScale);
        setInput("groundDepthScale", this.groundLayerConfig.depthScale);

        [
            ["groundOpacityVal", this.groundLayerConfig.opacity.toFixed(2)],
            ["groundRepeatXVal", this.groundLayerConfig.repeatX.toFixed(0)],
            ["groundRepeatYVal", this.groundLayerConfig.repeatY.toFixed(0)],
            ["groundOffsetXVal", this.groundLayerConfig.xOffset.toFixed(1)],
            ["groundOffsetZVal", this.groundLayerConfig.zOffset.toFixed(1)],
            ["groundElevationOffsetVal", this.groundLayerConfig.elevationOffset.toFixed(1)],
            ["groundWidthScaleVal", `x${this.groundLayerConfig.widthScale.toFixed(1)}`],
            ["groundDepthScaleVal", `x${this.groundLayerConfig.depthScale.toFixed(1)}`],
        ].forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    private bindGroundLayerControls(): void {
        const read = () => {
            const getInput = (id: string) => document.getElementById(id) as HTMLInputElement | null;
            const getSelect = (id: string) => document.getElementById(id) as HTMLSelectElement | null;
            const numberValue = (id: string, fallback: number): number => {
                const value = parseFloat(getInput(id)?.value ?? "");
                return Number.isFinite(value) ? value : fallback;
            };

            this.groundLayerConfig = {
                enabled: getInput("groundEnabled")?.checked ?? this.groundLayerConfig.enabled,
                mode: (getSelect("groundMode")?.value as SceneGroundLayerConfig["mode"]) ?? this.groundLayerConfig.mode,
                textureFile: getSelect("groundTexture")?.value || null,
                color: getInput("groundColor")?.value || this.groundLayerConfig.color,
                opacity: numberValue("groundOpacity", this.groundLayerConfig.opacity),
                repeatX: numberValue("groundRepeatX", this.groundLayerConfig.repeatX),
                repeatY: numberValue("groundRepeatY", this.groundLayerConfig.repeatY),
                xOffset: numberValue("groundOffsetX", this.groundLayerConfig.xOffset),
                zOffset: numberValue("groundOffsetZ", this.groundLayerConfig.zOffset),
                elevationOffset: numberValue("groundElevationOffset", this.groundLayerConfig.elevationOffset),
                widthScale: numberValue("groundWidthScale", this.groundLayerConfig.widthScale),
                depthScale: numberValue("groundDepthScale", this.groundLayerConfig.depthScale),
            };

            const labels: Array<[string, string]> = [
                ["groundOpacityVal", this.groundLayerConfig.opacity.toFixed(2)],
                ["groundRepeatXVal", this.groundLayerConfig.repeatX.toFixed(0)],
                ["groundRepeatYVal", this.groundLayerConfig.repeatY.toFixed(0)],
                ["groundOffsetXVal", this.groundLayerConfig.xOffset.toFixed(1)],
                ["groundOffsetZVal", this.groundLayerConfig.zOffset.toFixed(1)],
                ["groundElevationOffsetVal", this.groundLayerConfig.elevationOffset.toFixed(1)],
                ["groundWidthScaleVal", `x${this.groundLayerConfig.widthScale.toFixed(1)}`],
                ["groundDepthScaleVal", `x${this.groundLayerConfig.depthScale.toFixed(1)}`],
            ];
            labels.forEach(([id, text]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            });
            this.applyGroundLayerConfig();
        };

        [
            "groundEnabled",
            "groundMode",
            "groundTexture",
            "groundColor",
            "groundOpacity",
            "groundRepeatX",
            "groundRepeatY",
            "groundOffsetX",
            "groundOffsetZ",
            "groundElevationOffset",
            "groundWidthScale",
            "groundDepthScale",
        ].forEach(id => document.getElementById(id)?.addEventListener("input", read));
    }

    private bindToolbarEvents(ui: HTMLElement): void {
        ui.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                ui.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                ui.querySelectorAll('.editor-tab').forEach(t => (t as HTMLElement).style.display='none');
                const el = e.target as HTMLElement; el.classList.add('active');
                const id = el.getAttribute('data-tab');
                if (id) {
                    document.getElementById(id)!.style.display='block';
                    if (id === 'tab-layers') this.focusLayerPreviewCamera();
                }
            });
        });

        const bgFiles = this.manifest?.backgrounds ?? [];
        const layersRoot = document.getElementById('tab-layers');
        if (layersRoot) {
            this.layersTab = new MapEditorLayersTab(
                this,
                bgFiles,
                layersRoot
            );
            this.layersTab.setBiome(this.currentBiome);
            this.layersTab.onLayerChange = (biome, overrides) => {
                this.currentBiome = biome;
                this.rebuildSceneLayers(overrides);
            };
            this.rebuildSceneLayers();
            this.focusLayerPreviewCamera();
        }

        const btnCam = document.getElementById("modeCam")! as HTMLButtonElement;
        const btnBrush = document.getElementById("modeBrush")! as HTMLButtonElement;
        btnCam.addEventListener("click", () => {
            this.isBrushMode=false; btnCam.style.background="#1a3570"; btnBrush.style.background="#1e2030";
            this.camera.attachControl(this.canvas,true);
        });
        btnBrush.addEventListener("click", () => {
            this.isBrushMode=true; btnBrush.style.background="#1a3570"; btnCam.style.background="#1e2030";
            this.camera.detachControl();
            (ui.querySelector('[data-tab="tab-props"]') as HTMLElement)?.click();
        });

        const onGridChange = () => {
            this.customW = parseInt((document.getElementById("gridW") as HTMLInputElement).value);
            this.customD = parseInt((document.getElementById("gridD") as HTMLInputElement).value);
            this.applyGroundLayerConfig();
            this.rebuildCombatGrid();
            this.camera.target = new Vector3((this.customW*this.tileSize)/2, this.currentGridElevation, (this.customD*this.tileSize)/2);
            this.rebuildSceneLayers();
        };
        document.getElementById("gridW")!.addEventListener("change", onGridChange);
        document.getElementById("gridD")!.addEventListener("change", onGridChange);

        document.getElementById("gridElevationSlider")!.addEventListener("input", e => {
            this.currentGridElevation = parseFloat((e.target as HTMLInputElement).value);
            this.applyGroundLayerConfig();
            document.getElementById("gridElevationVal")!.textContent = this.currentGridElevation.toFixed(1);
            this.rebuildCombatGrid();
        });
        this.bindGroundLayerControls();

        document.getElementById("objScale")!.addEventListener("input", e => {
            this.customScale=parseFloat((e.target as HTMLInputElement).value);
            document.getElementById("valScale")!.textContent=`x${this.customScale.toFixed(2)}`;
        });
        document.getElementById("objOffY")!.addEventListener("input", e => {
            this.customOffsetY=parseFloat((e.target as HTMLInputElement).value);
            document.getElementById("valOffY")!.textContent=this.customOffsetY.toFixed(1);
        });
        document.getElementById("propLayerSelect")!.addEventListener("change", e => {
            this.selectedLayer = (e.target as HTMLSelectElement).value as PropLayer;
        });
        document.getElementById("symToggle")!.addEventListener("change", e => { this.symmetryEnabled=(e.target as HTMLInputElement).checked; });

        this.bindAssetBtns(ui);
        document.getElementById("btnExport")!.addEventListener("click", () => this.exportMap());
        document.getElementById("btnImportTrigger")!.addEventListener("click", () => document.getElementById("fileImport")!.click());
        document.getElementById("fileImport")!.addEventListener("change", e => this.importMap(e));
    }

    private bindAssetBtns(ui: HTMLElement): void {
        ui.querySelectorAll(".asset-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                const el = e.currentTarget as HTMLElement;
                this.selectedAsset = el.getAttribute("data-asset")||"";
                this.selectedIsAnimated = el.getAttribute("data-animated") === "1";
                ui.querySelectorAll(".asset-btn").forEach(b => (b as HTMLElement).style.borderColor="transparent");
                el.style.borderColor="#5a8fcc";
                if (!this.isBrushMode) document.getElementById("modeBrush")!.click();
            });
        });
    }

    private registerPointerEvents(): void {
        this.scene.onPointerDown = (evt, pickInfo) => {
            if (!this.isBrushMode) return;
            if (!pickInfo.hit || !pickInfo.pickedMesh) return;
            const isSurface = pickInfo.pickedMesh.name.startsWith("tile_");
            if (evt.button === 2) {
                const p = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.name.startsWith("ep_") || m.name.startsWith("anim_plane_"));
                if (p?.hit && p.pickedMesh?.parent) this.disposeChild(p.pickedMesh.parent);
                return;
            }
            if (evt.button === 0 && isSurface) {
                const pt = pickInfo.pickedPoint!;
                const { xMin, xMax, zMin, zMax } = this.getGridBounds();
                const clearance = MapEditor.SAFE_CLEARANCE;
                if (pt.x >= xMin - clearance && pt.x <= xMax + clearance &&
                    pt.z >= zMin - clearance && pt.z <= zMax + clearance) {
                    return;
                }
                const py = this.currentGridElevation + this.customOffsetY;
                if (this.selectedIsAnimated) {
                    const def = this.allAnimatedProps.find(p => p.file === this.selectedAsset);
                    if (!def) return;
                    this.spawnAnimatedProp(def, pt.x, py, pt.z, false, this.customScale, false, this.selectedLayer);
                    if (this.symmetryEnabled) {
                        this.spawnAnimatedProp(def, this.getMirrorX(pt.x), py, pt.z, false, this.customScale, false, this.selectedLayer);
                    }
                } else {
                    this.spawnProp(this.selectedAsset, pt.x, py, pt.z, false, this.customScale, false, this.selectedLayer);
                    if (this.symmetryEnabled) {
                        this.spawnProp(this.selectedAsset, this.getMirrorX(pt.x), py, pt.z, false, this.customScale, false, this.selectedLayer);
                    }
                }
            }
        };
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // -------------------------------------------------------------------------
    // Export / Import
    // -------------------------------------------------------------------------

    private exportMap(): void {
        const decorList: any[] = [];
        this.propsRoot.getChildren().forEach(c => {
            const m = (c as any).editorMetaData;
            if (!m) return;
            decorList.push({
                file: m.assetName,
                x: m.x, y: m.y, z: m.z,
                scaleMult: m.scale ?? 1,
                scaleX: (m.isFlippedX ?? m.isRightSide) ? -1 : 1,
                layer: m.layer ?? "mid",
                animated: m.animated ?? false,
                animClip: m.animClip ?? null,
            });
        });
        const out: any = {
            version:"4.2", gridW:this.customW, gridD:this.customD,
            gridElevation: Number(this.currentGridElevation.toFixed(2)),
            groundLayer: {
                ...this.groundLayerConfig,
                opacity: Number(this.groundLayerConfig.opacity.toFixed(3)),
                repeatX: Number(this.groundLayerConfig.repeatX.toFixed(2)),
                repeatY: Number(this.groundLayerConfig.repeatY.toFixed(2)),
                xOffset: Number(this.groundLayerConfig.xOffset.toFixed(3)),
                zOffset: Number(this.groundLayerConfig.zOffset.toFixed(3)),
                elevationOffset: Number(this.groundLayerConfig.elevationOffset.toFixed(3)),
                widthScale: Number(this.groundLayerConfig.widthScale.toFixed(3)),
                depthScale: Number(this.groundLayerConfig.depthScale.toFixed(3)),
            },
            biome:  this.currentBiome,
            decorations: decorList,
            proceduralMeta: { seed:this.procSeed, density:this.procDensity, cloudSeed:this.cloudSeed, groundSeed:this.groundSeed }
        };
        out.sceneLayers = this.layersTab?.getSceneLayersForExport() ?? this.createEmptySceneLayerStack();
        const blob = new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href=url; a.download=`map_${this.currentBiome}_${Date.now()}.json`;
        a.click(); URL.revokeObjectURL(url);
    }

    private importMap(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const d = JSON.parse(e.target?.result as string);
                this.propsRoot.getChildren().forEach(c => this.disposeChild(c));
                if (d.biome) {
                    this.currentBiome=d.biome;
                    this.refreshBiome(d.biome);
                    this.layersTab?.setBiome(d.biome);
                }
                if (d.sceneLayers) {
                    const sceneLayerBiome = d.sceneLayers.biome ?? d.biome ?? this.currentBiome;
                    if (!d.biome && sceneLayerBiome) {
                        this.currentBiome = sceneLayerBiome;
                        this.refreshBiome(sceneLayerBiome);
                    }
                    this.layersTab?.loadSceneLayersFromJSON(d.sceneLayers);
                    this.rebuildSceneLayers(d.sceneLayers);
                } else if (d.layerOverrides) {
                    this.layersTab?.loadOverridesFromJSON(d.layerOverrides);
                    this.rebuildSceneLayers();
                } else {
                    const emptyLayers = this.createEmptySceneLayerStack();
                    this.layersTab?.loadSceneLayersFromJSON(emptyLayers);
                    this.rebuildSceneLayers(emptyLayers);
                }
                if (d.groundLayer) {
                    this.groundLayerConfig = this.mergeGroundLayerConfig(d.groundLayer);
                    this.applyGroundLayerConfig();
                    this.syncGroundLayerControls();
                } else {
                    this.groundLayerConfig = this.mergeGroundLayerConfig({ enabled: false, textureFile: null });
                    this.applyGroundLayerConfig();
                    this.syncGroundLayerControls();
                }
                const importedGridElevation = d.gridElevation ?? d.floorY;
                if (importedGridElevation!=null) {
                    this.currentGridElevation=importedGridElevation;
                    this.applyGroundLayerConfig();
                    const gridElevationSlider = document.getElementById("gridElevationSlider") as HTMLInputElement | null;
                    if (gridElevationSlider) gridElevationSlider.value=String(importedGridElevation);
                    const gridElevationVal = document.getElementById("gridElevationVal");
                    if (gridElevationVal) gridElevationVal.textContent=importedGridElevation.toFixed(1);
                    this.rebuildCombatGrid();
                    this.rebuildSceneLayers();
                }
                if (d.gridW&&d.gridD) {
                    this.customW=d.gridW;
                    this.customD=d.gridD;
                    (document.getElementById("gridW") as HTMLInputElement).value=String(d.gridW);
                    (document.getElementById("gridD") as HTMLInputElement).value=String(d.gridD);
                    this.applyGroundLayerConfig();
                    this.rebuildCombatGrid();
                    this.rebuildSceneLayers();
                }
                if (d.proceduralMeta) {
                    const m=d.proceduralMeta;
                    if (m.seed!=null) this.procSeed=m.seed;
                    if (m.density!=null) this.procDensity=m.density;
                    if (m.cloudSeed!=null) this.cloudSeed=m.cloudSeed;
                    if (m.groundSeed!=null) this.groundSeed=m.groundSeed;
                    this.repaintSky();
                    this.repaintGround();
                }
                if (d.decorations) {
                    d.decorations.forEach((dec: any) => {
                        const layer = (dec.layer === "back" || dec.layer === "front" || dec.layer === "fore" || dec.layer === "mid")
                            ? (dec.layer === "fore" ? "front" : dec.layer) as PropLayer
                            : "mid";
                        const py = dec.y ?? this.currentGridElevation;
                        if (dec.animated) {
                            const def = this.allAnimatedProps.find(p => p.file === dec.file);
                            if (def) {
                                this.spawnAnimatedProp(def, dec.x, py, dec.z, dec.scaleX === -1, dec.scaleMult ?? 1, false, layer, dec.animClip ?? "idle");
                            }
                        } else {
                            this.spawnProp(dec.file, dec.x, py, dec.z, dec.scaleX === -1, dec.scaleMult ?? 1, false, layer);
                        }
                    });
                }
            } catch { console.error("MapEditor: import failed"); }
        };
        reader.readAsText(input.files[0]);
    }
}
