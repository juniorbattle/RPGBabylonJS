/**
 * CombatGrid.ts
 * Generates and manages the 3D tactical grid.
 *
 * Port of Unity's TacticalMapGenerator.cs + ElevationData.cs.
 *
 * Features:
 *  - Perlin-noise height map
 *  - Tile materials by height zone (plain/forest/hill/mountain)
 *  - All tiles walkable (combat everywhere)
 *  - Elevation advantage data per tile
 */

import {
  Scene, Mesh, MeshBuilder, StandardMaterial, Texture,
  Color3, Color4, Vector3, Vector4, ActionManager, ExecuteCodeAction, DynamicTexture,
  PointerInfo, PointerEventTypes, NoiseProceduralTexture
} from '@babylonjs/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export enum TileType {
  Water    = 'Water',
  Plain    = 'Plain',    
  Forest   = 'Forest',   
  Hill     = 'Hill',     
  Mountain = 'Mountain', 
}

export interface TileData {
  x:                number;
  z:                number;
  elevation:        number;   // World-Y height
  type:             TileType;
  walkable:         boolean;  
  isDeploymentTile?: boolean; 
  mesh:             Mesh;
}

export interface GridConfig {
  width:       number;   
  depth:       number;   
  tileSize:    number;   
  biome?:      string;
  floorConfig?: {
    baseColor: string;
    stripeColor: string;
    accentColor: string;
  };
  baseHeight:  number;   
  maxHeight:   number;   
  noiseScale:  number;   
  noiseOffsetX?: number; 
  noiseOffsetZ?: number;
  flat?:       boolean;  
  deploymentTiles?: Array<{x: number, z: number}>;
  gridElevation?: number;
}

// ─── Tile color palette (HD-2D) ────────────────────────────────────────────────

const COLOR_SELECTED  = new Color3(0.30, 0.64, 1.00);
const COLOR_REACHABLE = new Color3(0.26, 0.58, 0.95);
const COLOR_ATTACKABLE= new Color3(0.85, 0.26, 0.26);

interface BiomeGridPalette {
  top: Color3;
  topAlt: Color3;
  side: Color3;
  edge: Color4;
  specular: Color3;
  glow: Color3;
}

// ─── Simple Perlin noise ──────────────────────────────────────────────────────

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
const P: number[] = [];
(function buildPermutation() {
  const base = Array.from({ length: 256 }, (_, i) => i);
  let s = 42;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = base[i & 255];
})();

function perlin(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = P[P[xi]     + yi];
  const ab = P[P[xi]     + yi + 1];
  const ba = P[P[xi + 1] + yi];
  const bb = P[P[xi + 1] + yi + 1];

  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v
  ) * 0.5 + 0.5; // normalise [0,1]
}

// ─── CombatGrid class ─────────────────────────────────────────────────────────

export class CombatGrid {

  private scene:   Scene;
  private config:  GridConfig;
  private tiles:   TileData[][] = []; 
  private mats:    Map<TileType, StandardMaterial> = new Map();
  private matSelected!:   StandardMaterial;
  private matReachable!:  StandardMaterial;
  private matAttackable!: StandardMaterial;
  private surfaceDetailMats: StandardMaterial[] = [];
  private tileGroundTextures: DynamicTexture[] = [];
  private stageFloorOverlay: Mesh | null = null;
  private stageFloorOverlayMat: StandardMaterial | null = null;
  private stageFloorOverlayTexture: DynamicTexture | null = null;
  private deploymentOverlayTexture: DynamicTexture | null = null;
  private moveOverlayTexture: DynamicTexture | null = null;
  private matDeployment!: StandardMaterial;
  private matMoveOverlay!: StandardMaterial;
  private deploymentOverlays: Map<string, Mesh> = new Map();
  private moveOverlays: Map<string, Mesh> = new Map();

  private rootMesh: Mesh; 
  private _deploymentAnimationObs: any;

  onTileClick?: (tile: TileData) => void;
  onTileRightClick?: (tile: TileData) => void;
  onTileHover?: (tile: TileData) => void;

  constructor(scene: Scene, config: GridConfig) {
    this.scene  = scene;
    this.config = config;

    this.rootMesh = MeshBuilder.CreateBox('GridRoot', { size: 0.001 }, scene);
    this.rootMesh.isPickable = false;
    this.rootMesh.isVisible  = false;

    this.buildMaterials();
    this.buildSpecialMaterials();
    this.generate();
  }

  private buildMaterials(): void {
    const biome = this.config.biome ?? 'forest';
    const palette = this.getBiomePalette(biome, this.config.floorConfig);
    this.tileGroundTextures.forEach(texture => texture.dispose());
    this.tileGroundTextures = [];

    const waterNoise = new NoiseProceduralTexture("waterNoise", 256, this.scene);
    waterNoise.octaves = 2;
    waterNoise.persistence = 0.5;
    waterNoise.animationSpeedFactor = 2.0;
    const stageLayeredBackdrop = this.config.flat;

    for (const type of Object.values(TileType)) {
      const mat = new StandardMaterial(`mat_${type}`, this.scene);
      const tone = this.tintForTileType(type as TileType, palette);
      mat.ambientColor = new Color3(1.0, 1.0, 1.0);
      mat.specularColor = palette.specular;
      mat.specularPower = 8;
      mat.emissiveColor = this.mixColors(palette.glow, tone, 0.08);
      mat.alpha = type === TileType.Water ? 0.86 : (stageLayeredBackdrop ? 0.82 : 0.98);
      mat.backFaceCulling = false;
      if (stageLayeredBackdrop) {
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
        mat.disableDepthWrite = true;
      }

      if (type === TileType.Water) {
          mat.diffuseColor = this.mixColors(palette.topAlt, new Color3(0.28, 0.46, 0.66), 0.45);
          mat.diffuseTexture = waterNoise;
          mat.diffuseTexture.level = 0.12;
          mat.bumpTexture = waterNoise;
          mat.bumpTexture.level = 0.06;
          mat.specularColor = new Color3(0.45, 0.55, 0.62);
          mat.specularPower = 28;
          mat.emissiveColor = new Color3(0.08, 0.15, 0.20);
          mat.alpha = 0.80;
      } else {
          mat.diffuseColor = new Color3(0.96, 0.98, 0.92);
          const groundTexture = this.createTileGroundTexture(`tile_ground_${type}`, type as TileType, tone, palette);
          mat.diffuseTexture = groundTexture;
          mat.bumpTexture = null;
      }
      
      this.mats.set(type as TileType, mat);
    }

    this.buildSurfaceDetailMaterials(palette);
  }

  private buildSpecialMaterials(): void {
    this.matSelected = new StandardMaterial('mat_selected', this.scene);
    this.matSelected.diffuseColor = COLOR_SELECTED;
    this.matSelected.emissiveColor = COLOR_SELECTED.scale(0.55);
    this.matSelected.alpha = 0.88;
    this.matSelected.specularColor = new Color3(0.35, 0.45, 0.55);

    this.matReachable = new StandardMaterial('mat_reachable', this.scene);
    this.matReachable.diffuseColor = COLOR_REACHABLE;
    this.matReachable.emissiveColor = COLOR_REACHABLE.scale(0.38);
    this.matReachable.alpha = 0.76;
    this.matReachable.specularColor = new Color3(0.25, 0.35, 0.45);

    this.matAttackable = new StandardMaterial('mat_attackable', this.scene);
    this.matAttackable.diffuseColor = COLOR_ATTACKABLE;
    this.matAttackable.emissiveColor = COLOR_ATTACKABLE.scale(0.38);
    this.matAttackable.alpha = 0.78;
    this.matAttackable.specularColor = new Color3(0.4, 0.18, 0.18);

    this.matDeployment = new StandardMaterial('mat_deployment_overlay', this.scene);
    this.deploymentOverlayTexture = this.createTacticalOverlayTexture(
      'deployment_overlay_texture',
      'rgba(52, 211, 255, 0.34)',
      'rgba(154, 241, 255, 0.95)',
      'rgba(255, 255, 255, 0.72)'
    );
    this.matDeployment.diffuseTexture = this.deploymentOverlayTexture;
    this.matDeployment.opacityTexture = this.deploymentOverlayTexture;
    this.matDeployment.useAlphaFromDiffuseTexture = true;
    this.matDeployment.diffuseColor = new Color3(0.86, 0.98, 1.0);
    this.matDeployment.emissiveColor = new Color3(0.04, 0.38, 0.62);
    this.matDeployment.alpha = 0.58;
    this.matDeployment.disableLighting = true;
    this.matDeployment.disableDepthWrite = true;
    this.matDeployment.backFaceCulling = false;
    this.matDeployment.specularColor = new Color3(0, 0, 0);
    this.matDeployment.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matDeployment.zOffset = -4;

    this.matMoveOverlay = new StandardMaterial('mat_move_overlay', this.scene);
    this.moveOverlayTexture = this.createTacticalOverlayTexture(
      'move_overlay_texture',
      'rgba(67, 156, 255, 0.22)',
      'rgba(116, 205, 255, 0.82)',
      'rgba(255, 255, 255, 0.54)'
    );
    this.matMoveOverlay.diffuseTexture = this.moveOverlayTexture;
    this.matMoveOverlay.opacityTexture = this.moveOverlayTexture;
    this.matMoveOverlay.useAlphaFromDiffuseTexture = true;
    this.matMoveOverlay.diffuseColor = new Color3(0.78, 0.93, 1.0);
    this.matMoveOverlay.emissiveColor = new Color3(0.03, 0.26, 0.62);
    this.matMoveOverlay.alpha = 0.52;
    this.matMoveOverlay.disableLighting = true;
    this.matMoveOverlay.disableDepthWrite = true;
    this.matMoveOverlay.backFaceCulling = false;
    this.matMoveOverlay.specularColor = new Color3(0, 0, 0);
    this.matMoveOverlay.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matMoveOverlay.zOffset = -3;
  }

  private createTacticalOverlayTexture(
    name: string,
    fill: string,
    border: string,
    shine: string
  ): DynamicTexture {
    const texture = new DynamicTexture(name, { width: 256, height: 256 }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 256, 256);

    const gradient = ctx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    gradient.addColorStop(0.35, fill);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fillRect(18, 18, 220, 220);

    ctx.strokeStyle = border;
    ctx.lineWidth = 7;
    ctx.strokeRect(18, 18, 220, 220);

    ctx.strokeStyle = shine;
    ctx.lineWidth = 3;
    ctx.strokeRect(25, 25, 206, 206);

    ctx.strokeStyle = shine;
    ctx.lineWidth = 9;
    const corner = 46;
    const edge = 17;
    const max = 239;
    ctx.beginPath();
    ctx.moveTo(edge, edge + corner);
    ctx.lineTo(edge, edge);
    ctx.lineTo(edge + corner, edge);
    ctx.moveTo(max - corner, edge);
    ctx.lineTo(max, edge);
    ctx.lineTo(max, edge + corner);
    ctx.moveTo(max, max - corner);
    ctx.lineTo(max, max);
    ctx.lineTo(max - corner, max);
    ctx.moveTo(edge + corner, max);
    ctx.lineTo(edge, max);
    ctx.lineTo(edge, max - corner);
    ctx.stroke();

    texture.update();
    return texture;
  }

  private buildSurfaceDetailMaterials(palette: BiomeGridPalette): void {
    this.surfaceDetailMats.forEach(mat => mat.dispose());
    this.surfaceDetailMats = [];

    for (let i = 0; i < 8; i++) {
      const texture = this.createSurfaceDetailTexture(`surface_detail_${i}`, i, palette);
      const mat = new StandardMaterial(`mat_surface_detail_${i}`, this.scene);
      mat.diffuseTexture = texture;
      mat.opacityTexture = texture;
      mat.useAlphaFromDiffuseTexture = true;
      mat.disableLighting = true;
      mat.specularColor = new Color3(0, 0, 0);
      mat.emissiveColor = new Color3(1, 1, 1);
        mat.alpha = this.config.flat ? 0.10 : 0.22;
      mat.backFaceCulling = false;
      if (this.config.flat) {
        mat.disableDepthWrite = true;
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
      }
      this.surfaceDetailMats.push(mat);
    }
  }

  private createSurfaceDetailTexture(name: string, seed: number, palette: BiomeGridPalette): DynamicTexture {
    const size = 128;
    const texture = new DynamicTexture(name, { width: size, height: size }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    const rng = this.makeDetailRng(seed + 17);
    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = this.colorToRgba(palette.edge, 0.22);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(5, 5, size - 10, size - 10);

    const crackCount = 2 + Math.floor(rng() * 3);
    ctx.lineCap = 'round';
    for (let i = 0; i < crackCount; i++) {
      let x = 12 + rng() * (size - 24);
      let y = 12 + rng() * (size - 24);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segments = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < segments; j++) {
        x += (rng() - 0.5) * 34;
        y += (rng() - 0.5) * 28;
        ctx.lineTo(Math.max(10, Math.min(size - 10, x)), Math.max(10, Math.min(size - 10, y)));
      }
      ctx.strokeStyle = this.colorToRgba(palette.side, 0.11 + rng() * 0.12);
      ctx.lineWidth = 0.8 + rng() * 0.9;
      ctx.stroke();
    }

    const moss = this.mixColors(palette.topAlt, new Color3(0.22, 0.42, 0.16), 0.55);
    const mossCount = 9 + Math.floor(rng() * 10);
    for (let i = 0; i < mossCount; i++) {
      const x = 8 + rng() * (size - 16);
      const y = 8 + rng() * (size - 16);
      const rx = 5 + rng() * 13;
      const ry = 3 + rng() * 9;
      ctx.fillStyle = this.colorToRgba(new Color4(moss.r, moss.g, moss.b, 1), 0.08 + rng() * 0.13);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    texture.update(false);
    return texture;
  }

  private createTileGroundTexture(
    name: string,
    type: TileType,
    baseTone: Color3,
    palette: BiomeGridPalette
  ): DynamicTexture {
    const size = 256;
    const texture = new DynamicTexture(name, { width: size, height: size }, this.scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    const rng = this.makeDetailRng(this.seedForTileType(type) + 101);
    const base = this.colorToRgba(baseTone, 1);
    const shade = this.mixColors(baseTone, palette.side, 0.55);
    const moss = this.mixColors(palette.topAlt, new Color3(0.18, 0.34, 0.12), 0.62);
    const light = this.lightenColor(baseTone, 0.34);

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const sun = ctx.createRadialGradient(size * 0.28, size * 0.18, 0, size * 0.28, size * 0.18, size * 0.86);
    sun.addColorStop(0, this.colorToRgba(light, 0.40));
    sun.addColorStop(0.44, this.colorToRgba(light, 0.12));
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, size, size);

    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, this.colorToRgba(palette.side, 0.14));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 22; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const w = 18 + rng() * 58;
      const h = 6 + rng() * 24;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng() - 0.5) * 0.7);
      ctx.fillStyle = this.colorToRgba(shade, 0.025 + rng() * 0.040);
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = this.colorToRgba(palette.edge, 0.11);
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, size - 12, size - 12);
    ctx.strokeStyle = this.colorToRgba(light, 0.11);
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    const seamCount = type === TileType.Plain ? 4 : 6;
    for (let i = 0; i < seamCount; i++) {
      let x = 20 + rng() * (size - 40);
      let y = 20 + rng() * (size - 40);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 2 + Math.floor(rng() * 4);
      for (let s = 0; s < steps; s++) {
        x += (rng() - 0.5) * 48;
        y += (rng() - 0.5) * 38;
        ctx.lineTo(Math.max(14, Math.min(size - 14, x)), Math.max(14, Math.min(size - 14, y)));
      }
      ctx.strokeStyle = this.colorToRgba(shade, 0.09);
      ctx.lineWidth = 0.9 + rng() * 1.1;
      ctx.stroke();
      ctx.strokeStyle = this.colorToRgba(light, 0.08);
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }

    const mossCount = type === TileType.Forest ? 15 : 9;
    for (let i = 0; i < mossCount; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 3 + rng() * 12;
      const alpha = 0.055 + rng() * 0.090;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, this.colorToRgba(moss, alpha));
      gradient.addColorStop(1, this.colorToRgba(moss, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.update(false);
    this.tileGroundTextures.push(texture);
    return texture;
  }

  generate(): void {
    this.clearTiles();

    const { width, depth, tileSize, baseHeight, maxHeight, noiseScale, flat } = this.config;
    const gridElevation = this.config.gridElevation ?? 0;
    const ox = this.config.noiseOffsetX ?? Math.random() * 100;
    const oz = this.config.noiseOffsetZ ?? Math.random() * 100;

    this.tiles = Array.from({ length: width }, () => new Array(depth));

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {

        let elev: number;
        let type: TileType;

        let isWalkable = true;

        if (flat) {
          elev = 0;
          type = this.typeFromZone(x, z, width, depth);
        } else {
          const noise  = perlin(x * noiseScale + ox, z * noiseScale + oz);
          // Hard step heights logic instead of continuous slope
          let level = Math.floor(noise * 4); // 0, 1, 2, 3
          
          // Apply max and min bounds
          elev = baseHeight + (level * 0.5); // Steps of 0.5 metrics
          if (elev > maxHeight) elev = maxHeight;
          
          type = this.typeFromNoise(noise);

          // Deep waters are negative and unwalkable
          if (type === TileType.Water) {
              elev = -0.25; 
              isWalkable = false;
          }
          // The highest peaks might be obstacles
          if (type === TileType.Mountain && elev >= maxHeight) {
              isWalkable = false;
          }
        }

        const wx = (x - width / 2 + 0.5) * tileSize;
        const wz = z * tileSize;

        // HD-2D Island Base: Blocks go deep down
        const pillarH = 1 + elev;
        const baseThickness = 6.0 + (elev * 2); // Deeper base for high mountains
        const totalHeight = pillarH + baseThickness;
        
        // Pour les blocs, comme on a maintenant des textures appliquées globales (ex: herbe), 
        // les côtés verticaux seront aussi en herbe étirée ce qui est laid.
        // On utilise FaceUV pour écraser la texture sur les côtés, donnant un effet "strié" terre/racines naturel.
        const faceUV = new Array(6);
        for (let i = 0; i < 6; i++) {
            if (i === 4) { // Top face (surface marchable)
                faceUV[i] = new Vector4(0, 0, 1, 1); 
            } else { // Sur les côtés (cliffs)
                // Extrêmement étiré horizontalement pour simuler des strates géologiques / terre
                faceUV[i] = new Vector4(0, 0, 0.05, 5); 
            }
        }
        // FaceColor to slightly darken the sides artificially compared to the top
        const palette = this.getBiomePalette(this.config.biome ?? 'forest', this.config.floorConfig);
        const sideFaceAlpha = flat ? 0.55 : 0.75;
        const topFaceAlpha = flat ? 0.95 : 1;
        const sideFace = new Color4(palette.side.r, palette.side.g, palette.side.b, sideFaceAlpha);
        const topFace = new Color4(1, 1, 1, topFaceAlpha);
        const faceColors = [sideFace, sideFace, sideFace, sideFace, topFace, sideFace];

        const mesh = MeshBuilder.CreateBox(
          `tile_${x}_${z}`,
          { 
              width: tileSize, 
              height: totalHeight, 
              depth: tileSize,
              faceUV: faceUV,
              faceColors: faceColors
          },
          this.scene
        );

        // Position: Top surface sits exactly at `gridElevation + pillarH`.
        mesh.position = new Vector3(wx, gridElevation + pillarH - (totalHeight / 2), wz);
        mesh.parent   = this.rootMesh;

        mesh.material = this.mats.get(type) ?? null;

        if (type !== TileType.Water) {
          const detailMat = this.surfaceDetailMats[(x * 13 + z * 7) % this.surfaceDetailMats.length];
          const detail = MeshBuilder.CreatePlane(
            `tile_detail_${x}_${z}`,
            { width: tileSize * 0.93, height: tileSize * 0.93 },
            this.scene
          );
          detail.rotation.x = Math.PI / 2;
          detail.position = new Vector3(wx, gridElevation + pillarH + 0.012, wz);
          detail.parent = this.rootMesh;
          detail.material = detailMat;
          detail.isPickable = false;
        }
        
        // Edge rendering for crisp boundaries (Sketched pixel art style)
        if (type !== TileType.Water) {
            mesh.enableEdgesRendering();
            mesh.edgesWidth = 0.24;
            if (!isWalkable) mesh.edgesColor = new Color4(0.24, 0.18, 0.18, 0.85);
            else mesh.edgesColor = new Color4(palette.edge.r, palette.edge.g, palette.edge.b, 0.42);
        }

        const tileData: TileData = { x, z, elevation: elev, type, walkable: isWalkable, mesh, isDeploymentTile: false };
        this.tiles[x][z] = tileData;

        this.bindTileInput(tileData);
      }
    }

    if (flat) {
      this.buildStageFloorOverlay(width, depth, tileSize, gridElevation);
    }
  }

  private typeFromZone(x: number, z: number, width: number, depth: number): TileType {
    const nearBack = z > depth * 0.64;
    const edge = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
    const scatteredMoss = ((x * 17 + z * 23 + width * 5 + depth * 7) % 13) === 0;

    if ((edge && nearBack) || scatteredMoss) return TileType.Forest;
    return TileType.Plain;
  }

  private buildStageFloorOverlay(width: number, depth: number, tileSize: number, gridElevation: number): void {
    this.clearStageFloorOverlay();

    const texture = this.createStageFloorOverlayTexture('stage_floor_paint_overlay_tex', width, depth);
    const mat = new StandardMaterial('mat_stage_floor_paint_overlay', this.scene);
    mat.diffuseTexture = texture;
    mat.opacityTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.alpha = 0.30;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mat.zOffset = -2;

    const overlay = MeshBuilder.CreateGround(
      'stage_floor_paint_overlay',
      { width: width * tileSize, height: depth * tileSize },
      this.scene
    );
    overlay.parent = this.rootMesh;
    overlay.position = new Vector3(0, gridElevation + 1.035, ((depth - 1) * tileSize) / 2);
    overlay.isPickable = false;
    overlay.renderingGroupId = 1;
    overlay.material = mat;

    this.stageFloorOverlayTexture = texture;
    this.stageFloorOverlayMat = mat;
    this.stageFloorOverlay = overlay;
  }

  private createStageFloorOverlayTexture(name: string, width: number, depth: number): DynamicTexture {
    const textureSize = 1024;
    const texture = new DynamicTexture(name, { width: textureSize, height: textureSize }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    const rng = this.makeDetailRng(width * 101 + depth * 211 + 37);
    ctx.clearRect(0, 0, textureSize, textureSize);

    const cellW = textureSize / width;
    const cellH = textureSize / depth;
    const palette = this.getBiomePalette(this.config.biome ?? 'forest', this.config.floorConfig);
    const slabBase = this.mixColors(palette.top, palette.topAlt, 0.35);
    const slabShade = this.mixColors(palette.side, palette.top, 0.28);
    const slabLight = this.lightenColor(palette.topAlt, 0.28);
    const moss = this.mixColors(palette.topAlt, new Color3(0.20, 0.42, 0.14), 0.58);

    const warmLight = ctx.createRadialGradient(
      textureSize * 0.30,
      textureSize * 0.04,
      0,
      textureSize * 0.34,
      textureSize * 0.16,
      textureSize * 0.78
    );
    warmLight.addColorStop(0, 'rgba(255,221,140,0.34)');
    warmLight.addColorStop(0.36, 'rgba(196,177,92,0.14)');
    warmLight.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = warmLight;
    ctx.fillRect(0, 0, textureSize, textureSize);

    const mossEdge = ctx.createRadialGradient(
      textureSize * 0.5,
      textureSize * 0.5,
      textureSize * 0.20,
      textureSize * 0.5,
      textureSize * 0.5,
      textureSize * 0.72
    );
    mossEdge.addColorStop(0, 'rgba(0,0,0,0)');
    mossEdge.addColorStop(0.70, 'rgba(40,66,32,0.07)');
    mossEdge.addColorStop(1, 'rgba(24,42,24,0.16)');
    ctx.fillStyle = mossEdge;
    ctx.fillRect(0, 0, textureSize, textureSize);

    for (let gx = 0; gx < width; gx++) {
      for (let gz = 0; gz < depth; gz++) {
        const x0 = gx * cellW;
        const y0 = gz * cellH;
        const insetX = 8 + rng() * 8;
        const insetY = 7 + rng() * 9;
        const x1 = x0 + insetX + (rng() - 0.5) * 8;
        const y1 = y0 + insetY + (rng() - 0.5) * 8;
        const x2 = x0 + cellW - insetX + (rng() - 0.5) * 8;
        const y2 = y0 + insetY + (rng() - 0.5) * 8;
        const x3 = x0 + cellW - insetX + (rng() - 0.5) * 8;
        const y3 = y0 + cellH - insetY + (rng() - 0.5) * 8;
        const x4 = x0 + insetX + (rng() - 0.5) * 8;
        const y4 = y0 + cellH - insetY + (rng() - 0.5) * 8;
        const tone = this.mixColors(slabBase, slabShade, 0.18 + rng() * 0.24);

        const slabGradient = ctx.createLinearGradient(x1, y1, x3, y3);
        slabGradient.addColorStop(0, this.colorToRgba(slabLight, 0.20 + rng() * 0.08));
        slabGradient.addColorStop(0.44, this.colorToRgba(tone, 0.26 + rng() * 0.08));
        slabGradient.addColorStop(1, this.colorToRgba(slabShade, 0.24 + rng() * 0.08));

        ctx.fillStyle = slabGradient;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = this.colorToRgba(slabLight, 0.14);
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x1 + 3, y1 + 2);
        ctx.lineTo(x2 - 4, y2 + 1);
        ctx.stroke();

        ctx.strokeStyle = this.colorToRgba(slabShade, 0.23);
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.stroke();

        if (rng() > 0.38) {
          const crackX = x0 + cellW * (0.22 + rng() * 0.56);
          const crackY = y0 + cellH * (0.22 + rng() * 0.56);
          ctx.beginPath();
          ctx.moveTo(crackX, crackY);
          const segments = 2 + Math.floor(rng() * 3);
          for (let step = 0; step < segments; step++) {
            ctx.lineTo(
              crackX + (rng() - 0.5) * cellW * 0.42,
              crackY + (rng() - 0.5) * cellH * 0.38
            );
          }
          ctx.strokeStyle = this.colorToRgba(slabShade, 0.18);
          ctx.lineWidth = 1.0 + rng() * 0.9;
          ctx.stroke();
        }

        if ((gx + gz) % 2 === 0 || rng() > 0.64) {
          const mx = x0 + rng() * cellW;
          const my = y0 + rng() * cellH;
          const mr = 12 + rng() * 32;
          const patch = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
          patch.addColorStop(0, this.colorToRgba(moss, 0.11 + rng() * 0.08));
          patch.addColorStop(1, this.colorToRgba(moss, 0));
          ctx.fillStyle = patch;
          ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
        }
      }
    }

    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 34; i++) {
      const x = rng() * textureSize;
      const y = rng() * textureSize;
      const rx = 40 + rng() * 150;
      const ry = 14 + rng() * 56;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng() - 0.5) * 1.2);
      ctx.fillStyle = `rgba(${28 + Math.floor(rng() * 26)},${47 + Math.floor(rng() * 35)},${18 + Math.floor(rng() * 18)},${0.035 + rng() * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineCap = 'round';
    for (let i = 0; i < 15; i++) {
      let x = rng() * textureSize;
      let y = rng() * textureSize;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 3 + Math.floor(rng() * 5);
      for (let step = 0; step < steps; step++) {
        x += (rng() - 0.5) * 160;
        y += (rng() - 0.5) * 120;
        ctx.lineTo(Math.max(18, Math.min(textureSize - 18, x)), Math.max(18, Math.min(textureSize - 18, y)));
      }
      ctx.strokeStyle = `rgba(36,43,28,${0.08 + rng() * 0.10})`;
      ctx.lineWidth = 1.1 + rng() * 2.2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(210,202,140,${0.025 + rng() * 0.04})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    for (let x = 0; x <= width; x++) {
      const px = x * cellW;
      ctx.strokeStyle = 'rgba(255,255,210,0.075)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, textureSize);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(15,30,18,0.10)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(px + 1.5, 0);
      ctx.lineTo(px + 1.5, textureSize);
      ctx.stroke();
    }

    for (let z = 0; z <= depth; z++) {
      const py = z * cellH;
      ctx.strokeStyle = 'rgba(255,255,210,0.070)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(textureSize, py);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(15,30,18,0.09)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, py + 1.5);
      ctx.lineTo(textureSize, py + 1.5);
      ctx.stroke();
    }

    for (let i = 0; i < 70; i++) {
      const x = rng() * textureSize;
      const y = rng() * textureSize;
      const r = 3 + rng() * 18;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(63,92,39,${0.045 + rng() * 0.075})`);
      gradient.addColorStop(1, 'rgba(63,92,39,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const stageFocus = ctx.createRadialGradient(
      textureSize * 0.48,
      textureSize * 0.58,
      0,
      textureSize * 0.48,
      textureSize * 0.58,
      textureSize * 0.38
    );
    stageFocus.addColorStop(0, 'rgba(255,234,154,0.12)');
    stageFocus.addColorStop(0.52, 'rgba(255,234,154,0.045)');
    stageFocus.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = stageFocus;
    ctx.fillRect(0, 0, textureSize, textureSize);

    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.update(false);
    return texture;
  }

  private clearStageFloorOverlay(): void {
    this.stageFloorOverlay?.dispose();
    this.stageFloorOverlay = null;
    this.stageFloorOverlayMat?.dispose();
    this.stageFloorOverlayMat = null;
    this.stageFloorOverlayTexture?.dispose();
    this.stageFloorOverlayTexture = null;
  }

  private typeFromNoise(n: number): TileType {
    if (n < 0.25) return TileType.Water; // Valleys become rivers
    if (n < 0.50) return TileType.Plain;
    if (n < 0.70) return TileType.Forest;
    if (n < 0.85) return TileType.Hill;
    return TileType.Mountain; // Peaks
  }

  private pointerObserver?: any;

  private bindTileInput(tile: TileData): void {
    const { mesh } = tile;
    mesh.actionManager = new ActionManager(this.scene);

    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, (evt) => {
        const mouseEvt = evt.sourceEvent as MouseEvent;
        if (mouseEvt.button === 0) {
          this.onTileClick?.(tile);
        }
      })
    );
    
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
        this.onTileHover?.(tile);
      })
    );
  }
  
  enableRightClick(): void {
    if (this.pointerObserver) return;
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const evt = pointerInfo.event as PointerEvent;
        if (evt.button === 2) { 
          const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
          if (pickResult.hit && pickResult.pickedMesh) {
            const tile = this.findTileByMesh(pickResult.pickedMesh);
            if (tile) {
              this.onTileRightClick?.(tile);
            }
          }
        }
      }
    });
  }
  
  disableRightClick(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = undefined;
    }
  }
  
  private findTileByMesh(mesh: any): TileData | null {
    for (let x = 0; x < this.config.width; x++) {
      for (let z = 0; z < this.config.depth; z++) {
        const tile = this.tiles[x]?.[z];
        if (tile && tile.mesh === mesh) {
          return tile;
        }
      }
    }
    return null;
  }

  getTile(x: number, z: number): TileData | null {
    if (!this.tiles || x < 0 || z < 0 || x >= this.config.width || z >= this.config.depth) return null;
    const col = this.tiles[x];
    return col ? (col[z] ?? null) : null;
  }

  getTileTopPosition(x: number, z: number): Vector3 | null {
    const tile = this.getTile(x, z);
    if (!tile) return null;
    const { tileSize } = this.config;
    return new Vector3(
      (x - this.config.width / 2 + 0.5) * tileSize,
      (this.config.gridElevation ?? 0) + 1 + tile.elevation,   // Surface Y
      z * tileSize
    );
  }

  getReachableTiles(
    fromX: number,
    fromZ: number,
    range: number,
    jumpHeight: number,
    occupiedTiles?: Set<string> 
  ): TileData[] {
    const result: TileData[] = [];
    const originTile = this.getTile(fromX, fromZ);
    if (!originTile) return result;

    const queue: Array<[number, number, number]> = [[fromX, fromZ, 0]];
    const visited = new Set<string>([`${fromX},${fromZ}`]);
    const occupied = occupiedTiles || new Set<string>();

    const directions: Array<[number, number]> = [
      [0, -1], [0, 1], [-1, 0], [1, 0]
    ];

    while (queue.length > 0) {
      const [cx, cz, steps] = queue.shift()!;

      for (const [dx, dz] of directions) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;

        if (visited.has(key)) continue;

        const tile = this.getTile(nx, nz);
        if (!tile || !tile.walkable) continue;

        if (occupied.has(key)) continue;

        const currentTile = this.getTile(cx, cz);
        if (!currentTile) continue;
        const heightDiff = Math.abs(tile.elevation - currentTile.elevation);
        if (heightDiff > jumpHeight) continue;

        const newSteps = steps + 1;
        if (newSteps > range) continue;

        visited.add(key);
        result.push(tile);
        queue.push([nx, nz, newSteps]);
      }
    }

    return result;
  }

  getAttackableTiles(fromX: number, fromZ: number, range: number): TileData[] {
    const result: TileData[] = [];
    for (let x = 0; x < this.config.width; x++) {
      for (let z = 0; z < this.config.depth; z++) {
        const manhattan = Math.abs(x - fromX) + Math.abs(z - fromZ);
        if (manhattan === 0 || manhattan > range) continue;
        const t = this.getTile(x, z);
        if (t) result.push(t);
      }
    }
    return result;
  }

  selectTile(x: number, z: number): void {
    const t = this.getTile(x, z);
    if (t) t.mesh.material = this.matSelected;
  }

  showReachable(tiles: TileData[]): void {
    this.clearMoveOverlays();
    for (const t of tiles) {
      this.ensureMoveOverlay(t);
      t.mesh.renderOutline = true;
      t.mesh.outlineColor = new Color3(0.20, 0.74, 1.0);
      t.mesh.outlineWidth = 0.075;
    }
    this.setupDeploymentAnimation();
  }

  showAttackable(tiles: TileData[]): void {
    for (const t of tiles) t.mesh.material = this.matAttackable;
  }

  clearHighlights(): void {
    this.clearMoveOverlays();
    for (let x = 0; x < this.config.width; x++) {
      for (let z = 0; z < this.config.depth; z++) {
        const t = this.tiles[x]?.[z];
        if (t) {
          const baseMat = this.mats.get(t.type);
          t.mesh.material = baseMat ?? null;
          
          if (t.isDeploymentTile && baseMat) {
            this.ensureDeploymentOverlay(t);
            t.mesh.renderOutline = true;
            t.mesh.outlineColor = new Color3(0.0, 0.8, 1.0);
            t.mesh.outlineWidth = 0.11;
          } else {
            t.mesh.renderOutline = false;
            this.removeDeploymentOverlay(x, z);
          }
        }
      }
    }
    this.setupDeploymentAnimation();
  }

  private setupDeploymentAnimation(): void {
    if (this._deploymentAnimationObs) return;

    let time = 0;
    this._deploymentAnimationObs = this.scene.onBeforeRenderObservable.add(() => {
      time += this.scene.getEngine().getDeltaTime() * 0.005; // Faster pulse
      const pulse = (Math.sin(time) + 1) / 2; // 0 to 1
      const intensity = 0.48 + pulse * 0.26;
      this.matDeployment.alpha = intensity;
      this.matDeployment.emissiveColor.set(0.04 + pulse * 0.04, 0.36 + pulse * 0.16, 0.58 + pulse * 0.24);
      this.matMoveOverlay.alpha = 0.40 + pulse * 0.22;
      this.matMoveOverlay.emissiveColor.set(0.03 + pulse * 0.03, 0.22 + pulse * 0.12, 0.52 + pulse * 0.26);
    });
  }

  private ensureMoveOverlay(tile: TileData): void {
    const key = `${tile.x},${tile.z}`;
    let overlay = this.moveOverlays.get(key);
    if (!overlay) {
      overlay = MeshBuilder.CreatePlane(
        `move_overlay_${tile.x}_${tile.z}`,
        { width: this.config.tileSize * 0.92, height: this.config.tileSize * 0.92 },
        this.scene
      );
      overlay.rotation.x = Math.PI / 2;
      overlay.parent = this.rootMesh;
      overlay.isPickable = false;
      overlay.renderingGroupId = 2;
      overlay.material = this.matMoveOverlay;
      this.moveOverlays.set(key, overlay);
    }

    const pos = this.getTileTopPosition(tile.x, tile.z);
    if (pos) {
      overlay.position = pos.add(new Vector3(0, 0.06, 0));
    }
    overlay.setEnabled(true);
  }

  private clearMoveOverlays(): void {
    this.moveOverlays.forEach(overlay => overlay.dispose());
    this.moveOverlays.clear();
  }

  private ensureDeploymentOverlay(tile: TileData): void {
    const key = `${tile.x},${tile.z}`;
    let overlay = this.deploymentOverlays.get(key);
    if (!overlay) {
      overlay = MeshBuilder.CreatePlane(
        `deployment_overlay_${tile.x}_${tile.z}`,
        { width: this.config.tileSize * 0.88, height: this.config.tileSize * 0.88 },
        this.scene
      );
      overlay.rotation.x = Math.PI / 2;
      overlay.parent = this.rootMesh;
      overlay.isPickable = false;
      overlay.renderingGroupId = 2;
      overlay.material = this.matDeployment;
      this.deploymentOverlays.set(key, overlay);
    }

    const pos = this.getTileTopPosition(tile.x, tile.z);
    if (pos) {
      overlay.position = pos.add(new Vector3(0, 0.07, 0));
    }
    overlay.setEnabled(true);
  }

  private removeDeploymentOverlay(x: number, z: number): void {
    const key = `${x},${z}`;
    const overlay = this.deploymentOverlays.get(key);
    if (!overlay) return;
    overlay.dispose();
    this.deploymentOverlays.delete(key);
  }

  private clearDeploymentOverlays(): void {
    this.deploymentOverlays.forEach(overlay => overlay.dispose());
    this.deploymentOverlays.clear();
  }

  resetDeploymentTiles(): void {
    if (this._deploymentAnimationObs) {
      this.scene.onBeforeRenderObservable.remove(this._deploymentAnimationObs);
      this._deploymentAnimationObs = null;
    }

    for (let x = 0; x < this.config.width; x++) {
      for (let z = 0; z < this.config.depth; z++) {
        const t = this.tiles[x]?.[z];
        if (t) {
          if (t.isDeploymentTile && t.mesh.material && t.mesh.material.name.includes('_deploy_mat')) {
            const mat = t.mesh.material;
            t.mesh.material = this.mats.get(t.type) ?? null;
            mat.dispose(); 
          }
          t.isDeploymentTile = false;
          t.mesh.renderOutline = false;
          this.removeDeploymentOverlay(x, z);
        }
      }
    }
    this.clearHighlights();
  }

  get width(): number  { return this.config.width; }
  get depth(): number  { return this.config.depth; }
  get tileSize(): number { return this.config.tileSize; }

  get maxElevationY(): number {
    let max = this.config.gridElevation ?? 0;
    for (let x = 0; x < this.config.width; x++)
      for (let z = 0; z < this.config.depth; z++)
        max = Math.max(max, (this.config.gridElevation ?? 0) + (this.tiles[x]?.[z]?.elevation ?? 0) + 1);
    return max;
  }

  private clearTiles(): void {
    this.clearStageFloorOverlay();
    this.clearMoveOverlays();
    this.clearDeploymentOverlays();
    for (let x = 0; x < (this.tiles.length ?? 0); x++)
      for (let z = 0; z < (this.tiles[x]?.length ?? 0); z++)
        this.tiles[x]?.[z]?.mesh.dispose();
    this.tiles = [];
  }

  dispose(): void {
    this.clearTiles();
    this.mats.forEach(m => m.dispose());
    this.tileGroundTextures.forEach(texture => texture.dispose());
    this.tileGroundTextures = [];
    this.surfaceDetailMats.forEach(m => m.dispose());
    this.surfaceDetailMats = [];
    this.deploymentOverlayTexture?.dispose();
    this.deploymentOverlayTexture = null;
    this.moveOverlayTexture?.dispose();
    this.moveOverlayTexture = null;
    this.matSelected.dispose();
    this.matReachable.dispose();
    this.matAttackable.dispose();
    this.matDeployment.dispose();
    this.matMoveOverlay.dispose();
    this.rootMesh.dispose();
  }

  private getBiomePalette(
    biome: string,
    floorConfig?: { baseColor: string; stripeColor: string; accentColor: string }
  ): BiomeGridPalette {
    const source = floorConfig ?? this.getFallbackFloorColors(biome);
    const base = this.hexColor(source.baseColor);
    const stripe = this.hexColor(source.stripeColor);
    const accent = this.hexColor(source.accentColor);

    const top = this.lightenColor(base, 0.08);
    const topAlt = this.mixColors(base, accent, 0.18);
    const side = this.lightenColor(this.mixColors(stripe, base, 0.6), 0.06);
    const edge = this.mixColors(top, side, 0.45);

    return {
      top,
      topAlt,
      side,
      edge: new Color4(edge.r, edge.g, edge.b, 0.16),
      specular: new Color3(0.08, 0.08, 0.07),
      glow: this.mixColors(top, accent, 0.15).scale(0.06),
    };
  }

  private tintForTileType(type: TileType, palette: BiomeGridPalette): Color3 {
    switch (type) {
      case TileType.Forest:
        return this.mixColors(palette.top, palette.topAlt, 0.24);
      case TileType.Hill:
        return this.mixColors(palette.top, palette.side, 0.18);
      case TileType.Mountain:
        return this.mixColors(palette.topAlt, palette.side, 0.28);
      case TileType.Water:
        return palette.topAlt;
      case TileType.Plain:
      default:
        return palette.top;
    }
  }

  private hexColor(hex: string): Color3 {
    return Color3.FromHexString(hex);
  }

  private mixColors(a: Color3, b: Color3, t: number): Color3 {
    return new Color3(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t,
    );
  }

  private lightenColor(color: Color3, amount: number): Color3 {
    return this.mixColors(color, new Color3(1, 1, 1), amount);
  }

  private colorToRgba(color: Color3 | Color4, alpha: number): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private makeDetailRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private seedForTileType(type: TileType): number {
    switch (type) {
      case TileType.Forest:
        return 31;
      case TileType.Hill:
        return 47;
      case TileType.Mountain:
        return 59;
      case TileType.Water:
        return 71;
      case TileType.Plain:
      default:
        return 19;
    }
  }

  private getFallbackFloorColors(biome: string): { baseColor: string; stripeColor: string; accentColor: string } {
    switch (biome) {
      case 'mountain':
        return { baseColor: '#5b5b52', stripeColor: '#4a4a42', accentColor: '#737168' };
      case 'city':
      case 'ruins':
        return { baseColor: '#5d594f', stripeColor: '#49453d', accentColor: '#7a7569' };
      case 'swamp':
        return { baseColor: '#384c24', stripeColor: '#2b381a', accentColor: '#4c6732' };
      case 'plains':
        return { baseColor: '#4a8c28', stripeColor: '#3a7020', accentColor: '#5aa030' };
      case 'forest':
      default:
        return { baseColor: '#2a5c18', stripeColor: '#1e4a10', accentColor: '#3a7020' };
    }
  }
}
