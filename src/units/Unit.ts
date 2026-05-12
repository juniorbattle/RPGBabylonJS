/**
 * Unit.ts
 * Visual and logical representation of a unit in the Babylon.js scene.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Observer,
  DynamicTexture,
  Texture,
  TransformNode,
} from '@babylonjs/core';

import { UnitData, UnitAnimationClip, UnitAnimationName, UnitFrameOffset, UnitVisualProfile } from '../data/types/UnitData';
import { TurnStatus } from './TurnStatus';
import { TileData } from '../combat/CombatGrid';

const DEFAULT_SPRITE_SIZE = 2.4;
const DEFAULT_SHADOW_SIZE = 1.8;
const DEFAULT_GROUND_OFFSET = 0.1;
const UNIT_SPRITE_RENDER_GROUP = 3;
const UNIT_ICON_RENDER_GROUP = 4;

// Keep this type explicit for clip selection.
type ClipName = UnitAnimationName;

interface FrameAnchor {
  offsetX: number;
  offsetY: number;
}

interface FrameAnchorSet {
  anchors: Map<number, FrameAnchor>;
  referenceCenterX: number;
  referenceBottom: number;
}

interface FrameUvMetrics {
  uScale: number;
  vScale: number;
}

interface ResolvedSpriteSheetSource {
  texture: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
}

export class Unit {
  readonly status: TurnStatus;
  readonly mesh: Mesh;

  // Core visuals
  private scene: Scene;
  private spriteRoot: TransformNode;
  private spriteMesh: Mesh;
  private shadowMesh: Mesh;
  private groundAuraMesh: Mesh;
  private shadowMat: StandardMaterial;
  private groundAuraMat: StandardMaterial;
  private spriteTexture: Texture | DynamicTexture;
  private visualProfile: UnitVisualProfile | null;
  private spriteBaseY = 0;
  private spritePlaneWidth: number;
  private spritePlaneHeight: number;

  private mat: StandardMaterial;
  private baseMat: StandardMaterial;
  private activeMat: StandardMaterial;

  // Icon system
  private iconRoot: Mesh | null = null;
  private iconMesh: Mesh | null = null;
  private iconMat: StandardMaterial | null = null;
  private iconAnimationObs: Observer<Scene> | null = null;

  // Sprite animation runtime
  private animationObs: Observer<Scene> | null = null;
  private currentClipName: ClipName | null = null;
  private currentClip: UnitAnimationClip | null = null;
  private currentFrameCursor = 0;
  private frameAccumulator = 0;
  private oneShotResolve: (() => void) | null = null;
  private oneShotReturnToIdle = true;
  private frameAnchors = new Map<number, FrameAnchor>();
  private frameAnchorCache = new Map<string, FrameAnchorSet>();
  private activeSheetSource: ResolvedSpriteSheetSource | null = null;
  private activeSheetSourceKey = '';
  private activeReferenceCenterX = 0.5;
  private activeReferenceBottom = 1.0;
  private spriteBaseX = 0;

  private isDisposed = false;

  constructor(scene: Scene, data: UnitData) {
    this.scene = scene;
    this.status = new TurnStatus(data);
    this.visualProfile = data.visualProfile ?? null;

    this.mesh = new Mesh(`unitRoot_${data.id}`, scene);
    this.mesh.isPickable = false;

    // Main sprite plane
    const scale = this.visualProfile?.scale ?? 1;
    const width = DEFAULT_SPRITE_SIZE * scale;
    const height = DEFAULT_SPRITE_SIZE * scale;
    this.spritePlaneWidth = width;
    this.spritePlaneHeight = height;

    this.spriteRoot = new TransformNode(`unitSpriteRoot_${data.id}`, scene);
    this.spriteRoot.parent = this.mesh;
    this.spriteRoot.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    this.spriteMesh = MeshBuilder.CreatePlane(
      `unitSprite_${data.id}`,
      { width, height },
      scene
    );
    this.spriteMesh.isPickable = false;
    this.spriteMesh.parent = this.spriteRoot;
    this.spriteMesh.renderingGroupId = UNIT_SPRITE_RENDER_GROUP;
    this.spriteMesh.alwaysSelectAsActiveMesh = true;

    this.refreshSpriteBasePlacement();
    this.spriteMesh.position.x = this.spriteBaseX;
    this.spriteMesh.position.y = this.spriteBaseY;

    this.spriteTexture = this.createSpriteTexture(data);

    this.baseMat = this.createUnitMaterial(`unitMat_${data.id}`, this.spriteTexture, new Color3(1.14, 1.14, 1.14));
    this.activeMat = this.createUnitMaterial(`unitActiveMat_${data.id}`, this.spriteTexture, new Color3(1.28, 1.24, 1.12));
    this.mat = this.baseMat;
    this.spriteMesh.material = this.mat;

    // Floor shadow
    const shadowScale = this.visualProfile?.shadowScale ?? 1;
    const shadowSize = DEFAULT_SHADOW_SIZE * shadowScale;

    this.shadowMesh = MeshBuilder.CreatePlane(
      `unitShadow_${data.id}`,
      { width: shadowSize, height: shadowSize },
      scene
    );
    this.shadowMesh.isPickable = false;
    this.shadowMesh.parent = this.mesh;
    this.shadowMesh.rotation.x = Math.PI / 2;
    this.shadowMesh.position.y = 0.03;

    this.shadowMat = this.createShadowMaterial(`shadowMat_${data.id}`);
    this.shadowMesh.material = this.shadowMat;

    this.groundAuraMesh = MeshBuilder.CreatePlane(
      `unitGroundAura_${data.id}`,
      { width: shadowSize * 1.26, height: shadowSize * 0.68 },
      scene
    );
    this.groundAuraMesh.isPickable = false;
    this.groundAuraMesh.parent = this.mesh;
    this.groundAuraMesh.rotation.x = Math.PI / 2;
    this.groundAuraMesh.position.y = 0.055;
    this.groundAuraMesh.renderingGroupId = 1;

    this.groundAuraMat = this.createGroundAuraMaterial(`groundAuraMat_${data.id}`, data.team === 'TeamA');
    this.groundAuraMesh.material = this.groundAuraMat;

    // Metadata for tile picking + mapping
    this.spriteMesh.metadata = { unitId: data.id };
    this.mesh.metadata = { unitId: data.id };

    this.buildIconSystem();

    // Start idle loop if this unit has a sprite-sheet profile.
    this.playIdle();
  }

  private createUnitMaterial(name: string, texture: Texture | DynamicTexture, emissiveColor: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.specularPower = 0;
    mat.emissiveColor = emissiveColor;
    mat.alpha = 1;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
    mat.alphaCutOff = 0.08;
    mat.separateCullingPass = true;
    return mat;
  }

  private createSpriteTexture(data: UnitData): Texture | DynamicTexture {
    if (this.visualProfile) {
      const initialSource = this.resolveSheetSource(this.getClip('idle'));
      this.activeSheetSource = initialSource;
      this.activeSheetSourceKey = this.getSheetSourceKey(initialSource);
      const texture = this.createSheetTexture(initialSource);
      void this.loadFrameAnchors(initialSource, this.getClip('idle')?.frames ?? [0]);
      return texture;
    }

    // Fallback token texture for units that do not provide sprite sheets.
    const texSize = 256;
    const tex = new DynamicTexture(`tex_${data.id}`, { width: texSize, height: texSize }, this.scene, false);
    tex.hasAlpha = true;

    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, texSize, texSize);

    const teamHex = data.team === 'TeamA' ? '#3b82f6' : '#ef4444';
    const cx = texSize / 2;
    const cy = texSize / 2;
    const r = texSize / 2 - 16;

    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = teamHex;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(0, 0, 0, texSize);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.fill();

    const letter = (data.characterClass.charAt(0) || data.unitName.charAt(0)).toUpperCase();
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 110px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(letter, cx, cy + 8);

    tex.update();
    return tex;
  }

  private createShadowMaterial(name: string): StandardMaterial {
    const shadowMat = new StandardMaterial(name, this.scene);
    shadowMat.emissiveColor = new Color3(0, 0, 0);
    shadowMat.disableLighting = true;
    shadowMat.alpha = 0.5;

    const shadowTex = new DynamicTexture(`${name}_tex`, { width: 128, height: 128 }, this.scene, false);
    shadowTex.hasAlpha = true;
    const sCtx = shadowTex.getContext() as CanvasRenderingContext2D;
    sCtx.clearRect(0, 0, 128, 128);

    const radGrad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
    radGrad.addColorStop(0, 'rgba(0,0,0,1)');
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = radGrad;
    sCtx.fillRect(0, 0, 128, 128);
    shadowTex.update();

    shadowMat.diffuseTexture = shadowTex;
    shadowMat.useAlphaFromDiffuseTexture = true;

    return shadowMat;
  }

  private createGroundAuraMaterial(name: string, isAlly: boolean): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = isAlly ? new Color3(0.20, 0.64, 1.0) : new Color3(1.0, 0.25, 0.18);
    mat.alpha = 0.20;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

    const auraTex = new DynamicTexture(`${name}_tex`, { width: 160, height: 96 }, this.scene, false);
    auraTex.hasAlpha = true;
    const ctx = auraTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 160, 96);

    const color = isAlly ? { r: 72, g: 166, b: 255 } : { r: 255, g: 78, b: 60 };
    const glow = ctx.createRadialGradient(80, 48, 6, 80, 48, 72);
    glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.72)`);
    glow.addColorStop(0.42, `rgba(${color.r},${color.g},${color.b},0.24)`);
    glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 160, 96);

    ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.48)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(80, 48, 62, 25, 0, 0, Math.PI * 2);
    ctx.stroke();

    auraTex.update();
    mat.diffuseTexture = auraTex;
    mat.opacityTexture = auraTex;
    mat.useAlphaFromDiffuseTexture = true;

    return mat;
  }

  private buildIconSystem(): void {
    const data = this.status.unit;
    this.iconRoot = new Mesh(`unitIconRoot_${data.id}`, this.scene);
    this.iconRoot.isPickable = false;
    this.iconRoot.parent = this.mesh;
    this.iconRoot.position = new Vector3(0, 2.0, 0);
    this.iconRoot.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.updateIconRootPlacement();

    this.iconMat = new StandardMaterial(`unitIconMat_${data.id}`, this.scene);
    this.iconMat.emissiveColor = Color3.White();
    this.iconMat.disableLighting = true;
  }

  private updateIconRootPlacement(): void {
    if (!this.iconRoot) return;
    const spriteTop = this.spriteMesh.position.y + this.spritePlaneHeight * 0.5;
    this.iconRoot.position = new Vector3(this.spriteMesh.position.x, spriteTop + 0.30, 0);
  }

  showActionIcon(type: 'caster' | 'target', color: Color3 = Color3.White()): void {
    this.hideActionIcon();
    if (!this.iconRoot || !this.iconMat) return;

    if (type === 'caster') {
      this.iconMesh = MeshBuilder.CreateBox(`icon_${this.id}`, { size: 0.25 }, this.scene);
      this.iconMesh.rotation.z = Math.PI / 4;
      this.iconMesh.rotation.x = Math.PI / 4;
    } else {
      this.iconMesh = MeshBuilder.CreateSphere(`icon_${this.id}`, { diameter: 0.2 }, this.scene);
    }

    this.iconMesh.isPickable = false;
    this.iconMesh.parent = this.iconRoot;
    this.iconMesh.renderingGroupId = UNIT_ICON_RENDER_GROUP;
    this.iconMesh.material = this.iconMat;
    this.iconMat.emissiveColor = color;

    this.iconAnimationObs = this.scene.onBeforeRenderObservable.add(() => {
      if (this.iconMesh) {
        this.iconMesh.rotation.y += 0.05;
      }
    });
  }

  hideActionIcon(): void {
    if (this.iconAnimationObs) {
      this.scene.onBeforeRenderObservable.remove(this.iconAnimationObs);
      this.iconAnimationObs = null;
    }

    if (this.iconMesh) {
      this.iconMesh.dispose();
      this.iconMesh = null;
    }
  }

  private getClip(name: ClipName): UnitAnimationClip | null {
    if (!this.visualProfile) return null;
    const clip = this.visualProfile.animations[name];
    if (!clip || !clip.frames || clip.frames.length === 0) return null;
    return clip;
  }

  private ensureAnimationObserver(): void {
    if (!this.visualProfile || this.animationObs) return;

    this.animationObs = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.currentClip || this.isDisposed) return;

      const fps = Math.max(this.currentClip.fps ?? this.visualProfile?.defaultFps ?? 10, 1);
      const frameDuration = 1 / fps;
      this.frameAccumulator += this.scene.getEngine().getDeltaTime() / 1000;

      while (this.frameAccumulator >= frameDuration) {
        this.frameAccumulator -= frameDuration;
        this.advanceClip();
      }
    });
  }

  private stopAnimationObserver(): void {
    if (!this.animationObs) return;
    this.scene.onBeforeRenderObservable.remove(this.animationObs);
    this.animationObs = null;
  }

  private setFrame(frameIndex: number): void {
    if (!this.visualProfile || !(this.spriteTexture instanceof Texture) || !this.activeSheetSource) return;

    const columns = this.activeSheetSource.columns;
    const rows = this.activeSheetSource.rows;
    const safeFrame = Math.max(0, Math.min(frameIndex, columns * rows - 1));
    const uvMetrics = this.getFrameUvMetrics(this.spriteTexture);

    const col = safeFrame % columns;
    const row = Math.floor(safeFrame / columns);

    // Babylon V is bottom-up. Convert top-row indexing to texture UV.
    this.spriteTexture.uOffset = col * uvMetrics.uScale;
    this.spriteTexture.vOffset = 1 - ((row + 1) * uvMetrics.vScale);

    this.applyFrameAnchor(frameIndex);
  }

  private applyTextureFrameMetrics(texture: Texture): void {
    const uvMetrics = this.getFrameUvMetrics(texture);
    texture.uScale = uvMetrics.uScale;
    texture.vScale = uvMetrics.vScale;
  }

  private getFrameUvMetrics(texture: Texture): FrameUvMetrics {
    if (!this.activeSheetSource) {
      return { uScale: 1, vScale: 1 };
    }

    const fallback = {
      uScale: 1 / this.activeSheetSource.columns,
      vScale: 1 / this.activeSheetSource.rows,
    };

    const baseSize = texture.getBaseSize();
    if (!baseSize.width || !baseSize.height) {
      return fallback;
    }

    const frameWidth = this.activeSheetSource.frameWidth;
    const frameHeight = this.activeSheetSource.frameHeight;
    if (frameWidth <= 0 || frameHeight <= 0) {
      return fallback;
    }

    return {
      uScale: Math.min(1, frameWidth / baseSize.width),
      vScale: Math.min(1, frameHeight / baseSize.height),
    };
  }

  private applyFrameAnchor(frameIndex: number): void {
    const anchor = this.frameAnchors.get(frameIndex) ?? { offsetX: 0, offsetY: 0 };
    const clipName = this.currentClipName;
    const manualOffset = this.visualProfile
      ? this.getManualFrameOffset(this.visualProfile, clipName, this.currentFrameCursor, frameIndex)
      : {};
    const offsetX = clipName === 'idle'
      ? (manualOffset.x ?? 0)
      : anchor.offsetX + (manualOffset.x ?? 0);
    const offsetY = anchor.offsetY + (manualOffset.y ?? 0);

    this.spriteMesh.position.x = this.spriteBaseX - (offsetX * this.spritePlaneWidth);
    this.spriteMesh.position.y = this.spriteBaseY + (offsetY * this.spritePlaneHeight);
    this.updateIconRootPlacement();
  }

  private async loadFrameAnchors(source: ResolvedSpriteSheetSource, referenceFrames: number[]): Promise<void> {
    const cacheKey = this.getSheetSourceKey(source);
    const cachedAnchorSet = this.frameAnchorCache.get(cacheKey);
    if (cachedAnchorSet) {
      this.applyAnchorSet(cachedAnchorSet);
      const currentFrame = this.currentClip?.frames[this.currentFrameCursor] ?? 0;
      this.applyFrameAnchor(currentFrame);
      return;
    }

    try {
      const image = await this.loadSourceImage(source.texture);
      if (this.isDisposed) return;

      const anchorSet = this.buildFrameAnchors(image, source, referenceFrames);
      this.frameAnchorCache.set(cacheKey, anchorSet);

      if (this.activeSheetSourceKey !== cacheKey) return;
      this.applyAnchorSet(anchorSet);
      const currentFrame = this.currentClip?.frames[this.currentFrameCursor] ?? 0;
      this.applyFrameAnchor(currentFrame);
    } catch {
      // Silent fallback: animations still work even if automatic frame stabilization fails.
      this.applyAnchorSet({
        anchors: new Map<number, FrameAnchor>(),
        referenceCenterX: 0.5,
        referenceBottom: 1.0,
      });
    }
  }

  private applyAnchorSet(anchorSet: FrameAnchorSet): void {
    this.frameAnchors = anchorSet.anchors;
    this.activeReferenceCenterX = anchorSet.referenceCenterX;
    this.activeReferenceBottom = anchorSet.referenceBottom;
    this.refreshSpriteBasePlacement();
  }

  private loadSourceImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load sprite source: ${src}`));
      img.src = src;
    });
  }

  private buildFrameAnchors(
    image: HTMLImageElement,
    source: ResolvedSpriteSheetSource,
    referenceFrames: number[]
  ): FrameAnchorSet {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        anchors: new Map<number, FrameAnchor>(),
        referenceCenterX: 0.5,
        referenceBottom: 1.0,
      };
    }

    ctx.drawImage(image, 0, 0);

    const totalFrames = source.columns * source.rows;
    const metrics: Array<{ centerX: number; bottom: number }> = [];

    for (let frame = 0; frame < totalFrames; frame++) {
      metrics.push(this.analyzeFrameAnchor(ctx, image.width, image.height, source, frame));
    }

    const safeReferenceFrames = referenceFrames.filter(frame => frame >= 0 && frame < metrics.length);
    const finalReferenceFrames = safeReferenceFrames.length > 0 ? safeReferenceFrames : [0];

    const referenceCenterX = finalReferenceFrames.reduce((sum, frame) => sum + metrics[frame].centerX, 0) / finalReferenceFrames.length;
    const referenceBottom = finalReferenceFrames.reduce((sum, frame) => sum + metrics[frame].bottom, 0) / finalReferenceFrames.length;

    const anchors = new Map<number, FrameAnchor>();
    metrics.forEach((metric, frame) => {
      const rawOffsetX = metric.centerX - referenceCenterX;
      const rawOffsetY = referenceBottom - metric.bottom;

      // Clamp anchor compensation so one stray frame cannot visibly yank the sprite.
      const autoOffsetX = Math.max(-0.12, Math.min(0.12, rawOffsetX));
      const offsetY = Math.max(-0.08, Math.min(0.08, rawOffsetY));

      anchors.set(frame, {
        offsetX: autoOffsetX,
        offsetY,
      });
    });

    return {
      anchors,
      referenceCenterX,
      referenceBottom,
    };
  }

  private getManualFrameOffset(
    profile: UnitVisualProfile,
    clipName: ClipName | null,
    clipFrameIndex: number,
    sheetFrameIndex: number
  ): UnitFrameOffset {
    if (clipName && profile.clipFrameOffsets?.[clipName]) {
      const clipOffsets = profile.clipFrameOffsets[clipName];
      if (clipOffsets) {
        return clipOffsets[String(sheetFrameIndex)] ?? clipOffsets[String(clipFrameIndex)] ?? {};
      }
    }

    if (!profile.frameOffsets) return {};
    return profile.frameOffsets[String(sheetFrameIndex)] ?? profile.frameOffsets[String(clipFrameIndex)] ?? {};
  }

  private resolveGroundOffset(profile: UnitVisualProfile | null): number {
    if (!profile) return DEFAULT_GROUND_OFFSET;
    if (profile.groundOffset !== undefined) return profile.groundOffset;

    // Legacy compatibility: old yOffset values were inconsistent. Small values
    // are treated as normalized lift; large values are ignored.
    if (profile.yOffset !== undefined && Math.abs(profile.yOffset) <= 0.5) {
      return profile.yOffset;
    }

    return DEFAULT_GROUND_OFFSET;
  }

  private resolveCenterOffset(profile: UnitVisualProfile | null): number {
    return profile?.centerOffset ?? 0;
  }

  private refreshSpriteBasePlacement(): void {
    const groundOffset = this.resolveGroundOffset(this.visualProfile);
    const centerOffset = this.resolveCenterOffset(this.visualProfile);
    this.spriteBaseX = ((0.5 - this.activeReferenceCenterX) + centerOffset) * this.spritePlaneWidth;
    this.spriteBaseY = ((this.activeReferenceBottom - 0.5) + groundOffset) * this.spritePlaneHeight;
  }

  private analyzeFrameAnchor(
    ctx: CanvasRenderingContext2D,
    imageWidth: number,
    imageHeight: number,
    source: ResolvedSpriteSheetSource,
    frameIndex: number
  ): { centerX: number; bottom: number } {
    const col = frameIndex % source.columns;
    const row = Math.floor(frameIndex / source.columns);

    const startX = Math.floor((col * imageWidth) / source.columns);
    const endX = Math.floor(((col + 1) * imageWidth) / source.columns);
    const startY = Math.floor((row * imageHeight) / source.rows);
    const endY = Math.floor(((row + 1) * imageHeight) / source.rows);

    const cellWidth = Math.max(1, endX - startX);
    const cellHeight = Math.max(1, endY - startY);
    const actorBandStartY = Math.floor(cellHeight * 0.18);
    const actorBandEndY = Math.floor(cellHeight * 0.72);
    const centralZoneStartX = Math.floor(cellWidth * 0.2);
    const centralZoneEndX = Math.ceil(cellWidth * 0.8);

    const { data } = ctx.getImageData(startX, startY, cellWidth, cellHeight);

    let minX = cellWidth;
    let maxX = -1;
    let maxY = -1;

    let actorMinX = cellWidth;
    let actorMaxX = -1;
    let centralBottomY = -1;

    for (let y = 0; y < cellHeight; y++) {
      for (let x = 0; x < cellWidth; x++) {
        const alpha = data[((y * cellWidth) + x) * 4 + 3];
        if (alpha <= 24) continue;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        // Horizontal anchoring should follow the character body, not the soft
        // ground shadow or trailing VFX near the feet.
        if (alpha > 56 && y >= actorBandStartY && y <= actorBandEndY) {
          if (x < actorMinX) actorMinX = x;
          if (x > actorMaxX) actorMaxX = x;
        }

        // Bottom anchoring should ignore wide FX spill near the extreme sides.
        if (alpha > 40 && x >= centralZoneStartX && x <= centralZoneEndX && y > centralBottomY) {
          centralBottomY = y;
        }
      }
    }

    const fallbackCenter = 0.5;
    const fallbackBottom = 1.0;

    if (maxX < 0 || maxY < 0) {
      return { centerX: fallbackCenter, bottom: fallbackBottom };
    }

    const centerXSource = actorMaxX >= 0
      ? (actorMinX + actorMaxX) / 2
      : (minX + maxX) / 2;

    const bottomSource = centralBottomY >= 0 ? centralBottomY : maxY;

    return {
      centerX: centerXSource / cellWidth,
      bottom: bottomSource / cellHeight,
    };
  }

  private startClip(name: ClipName, forceRestart = false): boolean {
    const clip = this.getClip(name);
    if (!clip) return false;

    if (!forceRestart && this.currentClipName === name) {
      return true;
    }

    this.currentClipName = name;
    this.currentClip = clip;
    this.currentFrameCursor = 0;
    this.frameAccumulator = 0;
    this.ensureClipSheetSource(clip);

    this.setFrame(clip.frames[0]);
    this.ensureAnimationObserver();

    return true;
  }

  private advanceClip(): void {
    if (!this.currentClip) return;

    const frames = this.currentClip.frames;
    const isLoop = this.currentClip.loop ?? false;

    this.currentFrameCursor += 1;

    if (this.currentFrameCursor >= frames.length) {
      if (isLoop) {
        this.currentFrameCursor = 0;
        this.setFrame(frames[this.currentFrameCursor]);
        return;
      }

      this.currentFrameCursor = frames.length - 1;
      this.setFrame(frames[this.currentFrameCursor]);

      if (this.oneShotResolve) {
        const resolve = this.oneShotResolve;
        this.oneShotResolve = null;
        if (this.oneShotReturnToIdle) {
          this.playIdle();
        }
        resolve();
      }
      return;
    }

    this.setFrame(frames[this.currentFrameCursor]);
  }

  private playIdle(): void {
    this.startClip('idle', false);
  }

  private async playClipOnce(name: ClipName, returnToIdle = true): Promise<boolean> {
    const clip = this.getClip(name);
    if (!clip) return false;

    // Avoid stale one-shot completion callback overlap.
    if (this.oneShotResolve) {
      const previous = this.oneShotResolve;
      this.oneShotResolve = null;
      previous();
    }

    return new Promise<boolean>((resolve) => {
      this.oneShotReturnToIdle = returnToIdle;
      this.oneShotResolve = () => resolve(true);
      this.startClip(name, true);

      // Safety: if a clip is configured as loop=true by mistake,
      // resolve it after one visual cycle and return to idle.
      if ((clip.loop ?? false) === true) {
        const fps = Math.max(clip.fps ?? this.visualProfile?.defaultFps ?? 10, 1);
        const durationMs = Math.max(60, Math.floor((clip.frames.length / fps) * 1000));
        setTimeout(() => {
          if (!this.oneShotResolve) return;
          const done = this.oneShotResolve;
          this.oneShotResolve = null;
          if (this.oneShotReturnToIdle) {
            this.playIdle();
          }
          done();
        }, durationMs);
      }
    });
  }

  async playAttackAnimation(): Promise<void> {
    const played = await this.playClipOnce('attack');
    if (!played) {
      await this.playJuice(0.15, 0.25);
    }
  }

  async playCastAnimation(): Promise<void> {
    const played = await this.playClipOnce('cast');
    if (!played) {
      await this.playJuice(0.1, 0.2);
    }
  }

  async playHitAnimation(): Promise<void> {
    const played = await this.playClipOnce('hit');
    if (!played) {
      await this.playJuice(0.25, 0.15);
    }
  }

  setVisible(visible: boolean): void {
    this.mesh.setEnabled(visible);
    this.setVisualAlpha(visible ? 1 : 0);
  }

  async fadeVisible(visible: boolean, duration = 0.4): Promise<void> {
    if (visible) this.mesh.setEnabled(true);

    const startAlpha = this.baseMat.alpha;
    const endAlpha = visible ? 1 : 0;
    let elapsed = 0;

    return new Promise((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);
        const alpha = startAlpha + (endAlpha - startAlpha) * t;

        this.setVisualAlpha(alpha);

        if (t >= 1) {
          if (!visible) this.mesh.setEnabled(false);
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  placeOnTile(tile: TileData, surfaceWorldPos: Vector3): void {
    this.status.gridX = tile.x;
    this.status.gridZ = tile.z;
    this.status.elevation = tile.elevation;
    this.mesh.position.copyFrom(surfaceWorldPos);
  }

  async moveTo(targetPos: Vector3): Promise<void> {
    const moveStarted = this.startClip('move', true);

    try {
      const type = this.status.unit.movementType || 'default';
      switch (type) {
        case 'teleport':
          await this.moveTeleport(targetPos);
          break;
        case 'jump':
          await this.moveJump(targetPos);
          break;
        case 'dash':
          await this.moveDash(targetPos);
          break;
        default:
          await this.moveSlide(targetPos);
          break;
      }
    } finally {
      if (moveStarted) this.playIdle();
    }
  }

  private async moveSlide(targetPos: Vector3, duration = 0.35): Promise<void> {
    const start = this.mesh.position.clone();
    let elapsed = 0;

    return new Promise((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);
        const s = t * t * (3 - 2 * t);

        this.mesh.position = Vector3.Lerp(start, targetPos, s);

        // If no sprite-sheet animation is active, keep a little walking bounce.
        if (!this.visualProfile) {
          this.spriteMesh.position.y = this.spriteBaseY + Math.abs(Math.sin(t * Math.PI * 4)) * 0.3;
        }

        if (t >= 1) {
          this.mesh.position.copyFrom(targetPos);
          this.spriteMesh.position.y = this.spriteBaseY;
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  private async moveTeleport(targetPos: Vector3): Promise<void> {
    await this.animateAlpha(1, 0, 0.25);
    this.mesh.position.copyFrom(targetPos);
    await this.animateAlpha(0, 1, 0.25);
  }

  private async moveJump(targetPos: Vector3): Promise<void> {
    const startPos = this.mesh.position.clone();

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const duration = 0.3;

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);

        this.mesh.position.y = startPos.y + t * 2.0;
        const alpha = 1 - t;
        this.setVisualAlpha(alpha);

        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });

    this.mesh.position.copyFrom(targetPos);
    this.mesh.position.y += 2.0;

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const duration = 0.2;
      const startY = this.mesh.position.y;

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);

        this.mesh.position.y = startY + (targetPos.y - startY) * (t * t);
        this.setVisualAlpha(t);

        if (t >= 1) {
          this.mesh.position.copyFrom(targetPos);
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });

    await this.playJuice(0.3, 0.15);
  }

  private async moveDash(targetPos: Vector3): Promise<void> {
    const start = this.mesh.position.clone();
    const direction = targetPos.subtract(start).normalize();

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const duration = 0.15;

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);

        this.mesh.position = start.subtract(direction.scale(t * 0.5));
        this.spriteMesh.scaling.y = 1 - t * 0.2;

        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const duration = 0.15;
      const dashStart = this.mesh.position.clone();

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);
        const s = t * t * t * t;

        this.mesh.position = Vector3.Lerp(dashStart, targetPos, s);
        this.spriteMesh.scaling.y = 0.8 + s * 0.2;
        this.spriteMesh.scaling.x = 1 + s * 0.5;

        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });

    this.spriteMesh.scaling = new Vector3(1, 1, 1);
    this.mesh.position.copyFrom(targetPos);
  }

  private async animateAlpha(from: number, to: number, duration: number): Promise<void> {
    let elapsed = 0;

    return new Promise((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = Math.min(elapsed / duration, 1);
        const alpha = from + (to - from) * t;

        this.setVisualAlpha(alpha);

        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  setActive(active: boolean): void {
    this.spriteMesh.material = active ? this.activeMat : this.baseMat;
    this.groundAuraMat.alpha = active ? 0.36 : 0.20;
  }

  private setVisualAlpha(alpha: number): void {
    this.baseMat.alpha = alpha;
    this.activeMat.alpha = alpha;
    this.shadowMat.alpha = alpha * 0.5;
    this.groundAuraMat.alpha = alpha * (this.spriteMesh.material === this.activeMat ? 0.36 : 0.20);
  }

  setOutline(enabled: boolean, color: Color3 = Color3.White()): void {
    this.spriteMesh.renderOutline = enabled;
    this.spriteMesh.outlineColor = color;
    this.spriteMesh.outlineWidth = 0.05;
  }

  async flashColor(flashColor: Color3, duration = 0.6): Promise<void> {
    const activeMaterial = (this.spriteMesh.material as StandardMaterial) || this.baseMat;
    const originalEmissive = activeMaterial.emissiveColor
      ? activeMaterial.emissiveColor.clone()
      : Color3.White();

    let elapsed = 0;

    return new Promise((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = elapsed / duration;

        const pulse = (Math.sin(elapsed * 20) + 1) / 2;
        const mixed = Color3.Lerp(originalEmissive, flashColor, pulse * (1 - t));

        this.baseMat.emissiveColor = mixed;
        this.activeMat.emissiveColor = mixed;

        if (t >= 1) {
          this.baseMat.emissiveColor = Color3.White();
          this.activeMat.emissiveColor = Color3.White();
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  async flashRed(duration = 0.6): Promise<void> {
    await Promise.all([
      this.flashColor(new Color3(1, 0, 0), duration),
      this.playHitAnimation(),
    ]);
  }

  async playJuice(intensity = 0.2, duration = 0.2): Promise<void> {
    const startScaling = new Vector3(1, 1, 1);
    let elapsed = 0;

    return new Promise((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        const t = elapsed / duration;

        if (t <= 0.5) {
          const factor = t / 0.5;
          this.spriteMesh.scaling.y = 1 - intensity * factor;
          this.spriteMesh.scaling.x = 1 + intensity * factor * 0.5;
        } else if (t <= 1) {
          const factor = (t - 0.5) / 0.5;
          this.spriteMesh.scaling.y = (1 - intensity) + intensity * factor;
          this.spriteMesh.scaling.x = (1 + intensity * 0.5) - intensity * factor * 0.5;
        }

        if (t >= 1) {
          this.spriteMesh.scaling.copyFrom(startScaling);
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  async playAttackJuice(): Promise<void> {
    await this.playAttackAnimation();
  }

  async playHitJuice(): Promise<void> {
    await this.playHitAnimation();
  }

  async playDeathAnimation(): Promise<void> {
    if (this.iconRoot) this.iconRoot.setEnabled(false);

    const played = await this.playClipOnce('death', false);
    if (!played) {
      await new Promise<void>((resolve) => {
        let elapsed = 0;
        const totalDuration = 0.7;

        const obs = this.scene.onBeforeRenderObservable.add(() => {
          elapsed += this.scene.getEngine().getDeltaTime() / 1000;
          const t = Math.min(elapsed / totalDuration, 1);

          this.spriteMesh.position.y -= 0.05;
          this.spriteMesh.rotation.z += 0.02;

          this.setVisualAlpha(1 - t);

          if (t >= 1) {
            this.scene.onBeforeRenderObservable.remove(obs);
            resolve();
          }
        });
      });
    } else {
      // Smooth fade after death clip.
      await this.animateAlpha(1, 0, 0.35);
      this.setVisualAlpha(0);
    }

    if (this.iconMesh) {
      this.iconMesh.dispose();
      this.iconMesh = null;
    }

    if (this.iconRoot) {
      this.iconRoot.dispose();
      this.iconRoot = null;
    }

    this.mesh.dispose(false, true);
  }

  get id(): string {
    return this.status.unit.id;
  }

  get name(): string {
    return this.status.unit.unitName;
  }

  get team(): 'TeamA' | 'TeamB' {
    return this.status.team;
  }

  get isDead(): boolean {
    return this.status.isDead;
  }

  get teamColorHex(): string {
    return this.team === 'TeamA' ? '#3388ff' : '#e64d33';
  }

  get worldPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  private resolveSheetSource(clip: UnitAnimationClip | null): ResolvedSpriteSheetSource {
    if (!this.visualProfile) {
      throw new Error('resolveSheetSource called without visualProfile');
    }

    return {
      texture: clip?.texture ?? this.visualProfile.texture,
      frameWidth: clip?.frameWidth ?? this.visualProfile.frameWidth,
      frameHeight: clip?.frameHeight ?? this.visualProfile.frameHeight,
      columns: clip?.columns ?? this.visualProfile.columns,
      rows: clip?.rows ?? this.visualProfile.rows,
    };
  }

  private getSheetSourceKey(source: ResolvedSpriteSheetSource): string {
    return [
      source.texture,
      source.frameWidth,
      source.frameHeight,
      source.columns,
      source.rows,
    ].join('|');
  }

  private createSheetTexture(source: ResolvedSpriteSheetSource): Texture {
    const texture = new Texture(
      source.texture,
      this.scene,
      false,
      true,
      Texture.NEAREST_SAMPLINGMODE
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.activeSheetSource = source;
    this.applyTextureFrameMetrics(texture);
    texture.onLoadObservable.add(() => {
      if (this.isDisposed || this.spriteTexture !== texture) return;
      this.applyTextureFrameMetrics(texture);
      const currentFrame = this.currentClip?.frames[this.currentFrameCursor] ?? 0;
      this.setFrame(currentFrame);
    });
    return texture;
  }

  private ensureClipSheetSource(clip: UnitAnimationClip): void {
    if (!this.visualProfile) return;

    const source = this.resolveSheetSource(clip);
    const sourceKey = this.getSheetSourceKey(source);
    if (this.activeSheetSourceKey === sourceKey) {
      void this.loadFrameAnchors(source, clip.frames);
      return;
    }

    const previousTexture = this.spriteTexture instanceof Texture ? this.spriteTexture : null;
    const nextTexture = this.createSheetTexture(source);
    this.activeSheetSource = source;
    this.activeSheetSourceKey = sourceKey;
    this.spriteTexture = nextTexture;
    this.baseMat.diffuseTexture = nextTexture;
    this.baseMat.emissiveTexture = nextTexture;
    this.activeMat.diffuseTexture = nextTexture;
    this.activeMat.emissiveTexture = nextTexture;
    void this.loadFrameAnchors(source, clip.frames);

    if (previousTexture) {
      previousTexture.dispose();
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.stopAnimationObserver();

    if (this.iconAnimationObs) {
      this.scene.onBeforeRenderObservable.remove(this.iconAnimationObs);
      this.iconAnimationObs = null;
    }

    this.iconMesh?.dispose();
    this.iconRoot?.dispose();
    this.iconMat?.dispose();

    this.baseMat.dispose();
    this.activeMat.dispose();
    this.shadowMat.dispose();
    this.groundAuraMat.dispose();
    this.spriteTexture.dispose();

    this.mesh.dispose();
  }
}
