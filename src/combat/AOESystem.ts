/**
 * AOESystem.ts
 * AOE targeting system — port of Unity's AOECircleController.cs
 *
 * Displays a movable circle that follows the mouse:
 *  - Red  = damage action
 *  - Green= heal action
 *  - Grey = out of range
 *
 * Uses Babylon.js PointerObservable for mouse tracking.
 * Detection uses horizontal (XZ) distance only (identical to Unity).
 */

import {
  Scene, Mesh, MeshBuilder, StandardMaterial,
  Color3, Color4, Vector3, PointerEventTypes,
  Observer, PointerInfo, DynamicTexture,
} from '@babylonjs/core';

import { ActData, TypeAction } from '../data/types/ActData';
import { TileData, CombatGrid } from './CombatGrid';
import { Unit } from '../units/Unit';
import { CombatPreview } from '../ui/CombatPreview';

// ─── AOE Result ───────────────────────────────────────────────────────────────

export interface AOEResult {
  centerTile:    TileData;
  targets:       Unit[];
  affectedTiles: TileData[];
}

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface AOECallbacks {
  /** Called when player left-clicks and targets are valid */
  onConfirm: (result: AOEResult) => void;
  /** Called when player right-clicks or presses Escape */
  onCancel:  () => void;
}

// ─── AOESystem ────────────────────────────────────────────────────────────────

export class AOESystem {

  private scene:        Scene;
  private grid:         CombatGrid;

  // Visual meshes
  private discMesh:     Mesh | null   = null;
  private torusMesh:    Mesh | null   = null;
  private rangeMesh:    Mesh | null   = null; // ◄ Max range circle
  private deadZoneMesh: Mesh | null   = null; // ◄ Min range circle

  private preview?:     CombatPreview;

  // Materials
  private matValid!:   StandardMaterial;
  private matHeal!:    StandardMaterial;
  private matInvalid!: StandardMaterial;
  private matBorder!:  StandardMaterial;
  private matRange!:   StandardMaterial; // ◄ Light grey for range
  private discTexture: DynamicTexture | null = null;
  private rangeTexture: DynamicTexture | null = null;

  // State
  public  visualsDisabled: boolean     = false; // ◄ Block mesh creation during stage
  private active:       boolean       = false;
  private action:       ActData | null = null;
  private casterUnit:   Unit | null   = null;
  private centerTile:   TileData | null = null;
  private maxRange:     number        = 0;
  private allUnits:     Unit[]        = [];

  // Pointer observer handle
  private pointerObs: Observer<PointerInfo> | null = null;

  private readonly overlayDiscLift = 0.32;
  private readonly overlayRingLift = 0.39;
  private readonly overlayRangeLift = 0.25;
  private readonly overlayDeadZoneLift = 0.28;

  // Keyboard cancel
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: Scene, grid: CombatGrid) {
    this.scene = scene;
    this.grid  = grid;
    this.buildMaterials();
  }

  // ─── Materials ─────────────────────────────────────────────────────────────

  private buildMaterials(): void {
    // Two distinct overlay shapes :
    //  - discTexture : filled soft disc, used by the target-cursor overlays
    //    (matValid / matHeal / matInvalid). Marks the tiles actually
    //    affected by the action, so the centre reads as a solid coloured
    //    pool, not just a contour.
    //  - rangeTexture : hollow contour ring, used by matRange to mark the
    //    caster's max reach without obscuring everything inside.
    this.discTexture = this.createSoftCircleTexture('aoe_soft_disc_texture', 0.82, 0.22);
    this.rangeTexture = this.createSoftRingTexture('aoe_soft_ring_texture');

    // Damage AOE — semi-transparent red
    this.matValid = new StandardMaterial('aoe_valid', this.scene);
    this.matValid.diffuseTexture = this.discTexture;
    this.matValid.opacityTexture = this.discTexture;
    this.matValid.useAlphaFromDiffuseTexture = true;
    this.matValid.diffuseColor   = new Color3(1.0, 0.15, 0.10);
    this.matValid.emissiveColor  = new Color3(0.64, 0.10, 0.06);
    this.matValid.alpha          = 0.38;
    this.matValid.backFaceCulling= false;
    this.configureOverlayMaterial(this.matValid, -8);

    // Heal AOE — semi-transparent green
    this.matHeal = new StandardMaterial('aoe_heal', this.scene);
    this.matHeal.diffuseTexture = this.discTexture;
    this.matHeal.opacityTexture = this.discTexture;
    this.matHeal.useAlphaFromDiffuseTexture = true;
    this.matHeal.diffuseColor    = new Color3(0.10, 0.90, 0.35);
    this.matHeal.emissiveColor   = new Color3(0.06, 0.54, 0.22);
    this.matHeal.alpha           = 0.36;
    this.matHeal.backFaceCulling = false;
    this.configureOverlayMaterial(this.matHeal, -8);

    // Out-of-range — grey
    this.matInvalid = new StandardMaterial('aoe_invalid', this.scene);
    this.matInvalid.diffuseTexture = this.discTexture;
    this.matInvalid.opacityTexture = this.discTexture;
    this.matInvalid.useAlphaFromDiffuseTexture = true;
    this.matInvalid.diffuseColor   = new Color3(0.48, 0.50, 0.52);
    this.matInvalid.emissiveColor  = new Color3(0.12, 0.12, 0.12);
    this.matInvalid.alpha          = 0.24;
    this.matInvalid.backFaceCulling= false;
    this.configureOverlayMaterial(this.matInvalid, -8);

    // Border torus — recolored per targeting mode
    this.matBorder = new StandardMaterial('aoe_border', this.scene);
    this.matBorder.diffuseColor  = new Color3(1.0, 0.58, 0.42);
    this.matBorder.emissiveColor = new Color3(0.92, 0.24, 0.14);
    this.matBorder.alpha         = 0.94;
    this.configureOverlayMaterial(this.matBorder, -10);

    // Range limit — visible contour ring. Bumped alpha and emissive so the
    // circle survives the combat scene's exponential fog + vignette.
    this.matRange = new StandardMaterial('aoe_range_limit', this.scene);
    this.matRange.diffuseTexture = this.rangeTexture;
    this.matRange.opacityTexture = this.rangeTexture;
    this.matRange.useAlphaFromDiffuseTexture = true;
    this.matRange.diffuseColor   = new Color3(1.00, 0.78, 0.52);
    this.matRange.emissiveColor  = new Color3(0.85, 0.50, 0.22);
    this.matRange.alpha          = 0.85;
    this.matRange.backFaceCulling= false;
    this.configureOverlayMaterial(this.matRange, -6);
  }

  /**
   * Paints a filled soft disc : opaque core that fades smoothly toward the
   * edge. Used for the target-cursor overlays so the affected area reads
   * as a solid coloured pool.
   */
  private createSoftCircleTexture(name: string, coreAlpha: number, edgeAlpha: number): DynamicTexture {
    const texture = new DynamicTexture(name, { width: 256, height: 256 }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);

    const glow = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    glow.addColorStop(0.00, `rgba(255,255,255,${coreAlpha})`);
    glow.addColorStop(0.48, `rgba(255,255,255,${Math.max(edgeAlpha, coreAlpha * 0.55)})`);
    glow.addColorStop(0.82, `rgba(255,255,255,${edgeAlpha})`);
    glow.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();

    texture.update(false);
    return texture;
  }

  /**
   * Paints a thick contour ring : transparent core (so the grid stays
   * readable inside the range), strong opaque band near the outer edge
   * (so the max-range limit is clearly visible against a foggy scene),
   * faint halo outside. Used as both diffuse and opacity texture on the
   * range mesh so a single MeshBuilder.CreateDisc renders as a ring.
   */
  private createSoftRingTexture(name: string): DynamicTexture {
    const texture = new DynamicTexture(name, { width: 256, height: 256 }, this.scene, false);
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);

    // Stops are radial fractions of the 124-pixel radius.
    // 0.00 -> 0.62 : fully transparent core (grid stays readable).
    // 0.62 -> 0.78 : ramp up to opaque white (band start).
    // 0.78 -> 0.90 : opaque peak (the visible contour).
    // 0.90 -> 1.00 : ramp back down to transparent (outer halo).
    const ring = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    ring.addColorStop(0.00, 'rgba(255,255,255,0.00)');
    ring.addColorStop(0.62, 'rgba(255,255,255,0.00)');
    ring.addColorStop(0.72, 'rgba(255,255,255,0.55)');
    ring.addColorStop(0.82, 'rgba(255,255,255,1.00)');
    ring.addColorStop(0.92, 'rgba(255,255,255,0.55)');
    ring.addColorStop(1.00, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();

    texture.update(false);
    return texture;
  }

  private configureOverlayMaterial(mat: StandardMaterial, zOffset: number): void {
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mat.zOffset = zOffset;
  }

  // ─── Activate ──────────────────────────────────────────────────────────────

  /**
   * Start AOE targeting mode.
   * @param action     The action being targeted
   * @param caster     The unit using the action
   * @param allUnits   All units in the scene (for target detection)
   * @param callbacks  onConfirm / onCancel handlers
   */
  activate(
    action: ActData,
    caster: Unit,
    allUnits: Unit[],
    callbacks: AOECallbacks,
    previewUI?: CombatPreview
  ): void {
    this.deactivate(); // Clean up any previous state

    this.action     = action;
    this.casterUnit = caster;
    this.allUnits   = allUnits;
    this.maxRange   = action.range;
    this.active     = true;
    this.preview    = previewUI;

    // Build the AOE visual (disc + torus ring)
    this.createVisual(action.aoe?.radius ?? 0);
    this.createRangeVisual(caster, action.range, action.minRange ?? 0);

    // ── Pointer events ──────────────────────────────────────────────────────
    this.pointerObs = this.scene.onPointerObservable.add((info: PointerInfo) => {
      if (!this.active) return;

      const tile = this.pickTile(info);

      if (info.type === PointerEventTypes.POINTERMOVE && tile) {
        this.updatePosition(tile);
      }

      if (info.type === PointerEventTypes.POINTERDOWN) {
        if (info.event.button === 0 && tile) {
          // Left click — confirm
          this.tryConfirm(tile, callbacks.onConfirm);
        } else if (info.event.button === 2) {
          // Right click — cancel
          callbacks.onCancel();
          this.deactivate();
        }
      }
    });

    // ── Keyboard cancel ─────────────────────────────────────────────────────
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        callbacks.onCancel();
        this.deactivate();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // ─── Deactivate ────────────────────────────────────────────────────────────

  deactivate(): void {
    this.active     = false;
    this.centerTile = null;
    this.preview?.hide();

    // Remove visuals
    this.discMesh?.dispose();
    this.torusMesh?.dispose();
    this.rangeMesh?.dispose();
    this.deadZoneMesh?.dispose();
    this.discMesh  = null;
    this.torusMesh = null;
    this.rangeMesh = null;
    this.deadZoneMesh = null;

    // Remove status icons (ONLY for targets, keep caster icon)
    for (const u of this.allUnits) {
        if (u !== this.casterUnit) u.hideActionIcon();
    }

    // Remove highlights (clear any remaining artifacts)
    this.grid.clearHighlights();

    // Remove observers
    if (this.pointerObs) {
      this.scene.onPointerObservable.remove(this.pointerObs);
      this.pointerObs = null;
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  // ─── AI silent simulation ──────────────────────────────────────────────────

  /**
   * Silently compute AOE result at a tile (no visual).
   * Used by NPCAI to evaluate best attack position.
   */
  simulate(
    action: ActData,
    caster: Unit,
    targetTile: TileData,
    allUnits: Unit[],
  ): AOEResult {
    this.allUnits = allUnits;
    const radius   = action.aoe?.radius ?? 0;
    const affected = this.getTilesInRadius(targetTile, radius);
    const targets  = this.getTargetsIn(affected, caster, action);

    return { centerTile: targetTile, targets, affectedTiles: affected };
  }

  /**
   * Show brief AI visual feedback (~1.2s) without blocking player input.
   */
  async showAIFeedback(action: ActData, targetTile: TileData, caster?: Unit): Promise<void> {
    if (caster) this.casterUnit = caster;
    
    const radius = action.aoe?.radius ?? 0;
    this.createVisual(radius);

    // range visualization for NPC
    if (this.casterUnit) {
      this.createRangeVisual(this.casterUnit, action.range, action.minRange ?? 0);
      // Brief delay to ensure range mesh is established
      await new Promise<void>(r => setTimeout(r, 100));
    }

    const pos = this.getTileTopSurface(targetTile);
    if (this.discMesh)  this.discMesh.position  = pos.clone().add(new Vector3(0, this.overlayDiscLift, 0));
    if (this.torusMesh) this.torusMesh.position = pos.clone().add(new Vector3(0, this.overlayRingLift, 0));

    // Color for action type
    const isHeal = action.typeAction === TypeAction.HEAL || action.typeAction === TypeAction.BUFF;
    const mat = isHeal ? this.matHeal : this.matValid;
    if (this.discMesh) this.discMesh.material  = mat;

    const affected = this.getTilesInRadius(targetTile, radius);
    
    // NPC targeting feedback: Icon above targets
    const targets = this.getTargetsIn(affected, this.casterUnit!, action);
    const iconColor = isHeal ? Color3.Green() : Color3.Red();
    
    if (!this.visualsDisabled) {
        for (const target of targets) {
            target.showActionIcon('target', iconColor);
        }
    }

    await new Promise<void>(r => setTimeout(r, 1200));

    this.discMesh?.dispose();
    this.torusMesh?.dispose();
    this.rangeMesh?.dispose();
    this.discMesh  = null;
    this.torusMesh = null;
    this.rangeMesh = null;
    
    // Clear icons only for targets (caster icon normally stays during turn via CombatManager)
    for (const u of this.allUnits) {
        if (u !== this.casterUnit) u.hideActionIcon();
    }
  }

  // ─── Visual creation ───────────────────────────────────────────────────────

  private createVisual(aoeRadius: number): void {
    if (this.visualsDisabled) return; // ◄ Security check
    // Disc (flat cylinder) — radius in units
    const visualRadius = Math.max(aoeRadius * this.grid.tileSize, this.grid.tileSize * 0.34);

    this.discMesh = MeshBuilder.CreateDisc(
      'aoe_disc',
      { radius: visualRadius, tessellation: 64 },
      this.scene
    );
    this.discMesh.rotation.x = Math.PI / 2; // Lay flat
    this.discMesh.material   = this.matValid;
    this.discMesh.isPickable = false;
    this.discMesh.renderingGroupId = 2;

    // Torus ring (border)
    this.torusMesh = MeshBuilder.CreateTorus(
      'aoe_ring',
      { diameter: visualRadius * 2, thickness: 0.055, tessellation: 72 },
      this.scene
    );
    this.torusMesh.material   = this.matBorder;
    this.torusMesh.isPickable = false;
    this.torusMesh.renderingGroupId = 2;
  }

  private createRangeVisual(caster: Unit, range: number, minRange: number): void {
    if (this.visualsDisabled) return; // ◄ Security check
    const rangeRadius = (range + 0.5) * this.grid.tileSize;
    
    this.rangeMesh = MeshBuilder.CreateDisc(
      'aoe_range_limit',
      { radius: rangeRadius, tessellation: 64 },
      this.scene
    );
    this.rangeMesh.rotation.x = Math.PI / 2;
    this.rangeMesh.material   = this.matRange;
    this.rangeMesh.isPickable = false;
    this.rangeMesh.renderingGroupId = 2;

    // Slightly above ground to avoid z-fighting
    const originTile = this.grid.getTile(caster.status.gridX, caster.status.gridZ);
    if (originTile) {
      const pos = this.getTileTopSurface(originTile);
      this.rangeMesh.position = pos.add(new Vector3(0, this.overlayRangeLift, 0));

      if (minRange > 0) {
        const deadRadius = (minRange - 0.5) * this.grid.tileSize;
        this.deadZoneMesh = MeshBuilder.CreateDisc(
          'aoe_dead_zone',
          { radius: deadRadius, tessellation: 64 },
          this.scene
        );
        this.deadZoneMesh.rotation.x = Math.PI / 2;
        this.deadZoneMesh.material   = this.matInvalid;
        this.deadZoneMesh.isPickable = false;
        this.deadZoneMesh.renderingGroupId = 2;
        // Slightly higher than rangeMesh to be visible
        this.deadZoneMesh.position = pos.add(new Vector3(0, this.overlayDeadZoneLift, 0));
      }
    }
  }

  // ─── Position update ───────────────────────────────────────────────────────

  private updatePosition(tile: TileData): void {
    this.centerTile = tile;

    const pos    = this.getTileTopSurface(tile);
    
    // Highlight affected targets with Icons
    const radius   = this.action?.aoe?.radius ?? 0;
    const affected = this.getTilesInRadius(tile, radius);
    
    // Logic: In Range if the impact area touches at least one tile within maxRange
    const inRange = this.isAreaInRange(affected);

    const isInspect = this.isInspectAction(this.action);
    const isHeal = !isInspect && (this.action?.typeAction === TypeAction.HEAL || this.action?.typeAction === TypeAction.BUFF);
    this.applyAOEVisualPalette(this.action, inRange);

    if (this.discMesh) {
      this.discMesh.position = pos.clone().add(new Vector3(0, this.overlayDiscLift, 0));
      this.discMesh.material = inRange
        ? (isHeal ? this.matHeal : this.matValid)
        : this.matInvalid;
    }
    if (this.torusMesh) {
      this.torusMesh.position = pos.clone().add(new Vector3(0, this.overlayRingLift, 0));
    }

    // Reset status icons (EXPLICITLY keep caster icon)
    for (const u of this.allUnits) {
        if (u !== this.casterUnit) u.hideActionIcon();
    }

    if (inRange && !this.visualsDisabled) {
      const targets = this.getTargetsIn(affected, this.casterUnit!, this.action!);
      const iconColor = isInspect ? new Color3(0.35, 0.75, 1.0) : (isHeal ? Color3.Green() : Color3.Red());
      
      for (const target of targets) {
        target.showActionIcon('target', iconColor);
      }
      
      // Update UI Preview
      this.preview?.show(this.casterUnit!, targets, this.action!);
    } else {
        this.preview?.hide();
    }
  }

  private applyAOEVisualPalette(action: ActData | null, inRange: boolean): void {
    const inspect = this.isInspectAction(action);
    const helpful = !inspect && (action?.typeAction === TypeAction.HEAL || action?.typeAction === TypeAction.BUFF);
    const invalidTint = new Color3(0.52, 0.54, 0.56);

    let disc = new Color3(1.0, 0.20, 0.12);
    let discGlow = new Color3(0.64, 0.10, 0.06);
    let ring = new Color3(1.0, 0.62, 0.44);
    let ringGlow = new Color3(0.96, 0.28, 0.14);
    let range = new Color3(1.00, 0.78, 0.52);
    let rangeGlow = new Color3(0.85, 0.50, 0.22);

    if (helpful) {
      disc = new Color3(0.12, 0.92, 0.42);
      discGlow = new Color3(0.06, 0.56, 0.24);
      ring = new Color3(0.58, 1.0, 0.72);
      ringGlow = new Color3(0.12, 0.82, 0.38);
      range = new Color3(0.58, 1.0, 0.76);
      rangeGlow = new Color3(0.18, 0.78, 0.34);
    } else if (inspect) {
      disc = new Color3(0.22, 0.58, 1.0);
      discGlow = new Color3(0.06, 0.28, 0.72);
      ring = new Color3(0.55, 0.86, 1.0);
      ringGlow = new Color3(0.12, 0.50, 1.0);
      range = new Color3(0.54, 0.80, 1.0);
      rangeGlow = new Color3(0.18, 0.46, 0.92);
    }

    if (!inRange) {
      ring = invalidTint;
      ringGlow = new Color3(0.18, 0.18, 0.18);
    }

    this.matValid.diffuseColor = disc;
    this.matValid.emissiveColor = discGlow;
    this.matHeal.diffuseColor = helpful ? disc : new Color3(0.10, 0.90, 0.35);
    this.matHeal.emissiveColor = helpful ? discGlow : new Color3(0.06, 0.54, 0.22);
    this.matBorder.diffuseColor = ring;
    this.matBorder.emissiveColor = ringGlow;
    this.matRange.diffuseColor = range;
    this.matRange.emissiveColor = rangeGlow;
  }

  private isInspectAction(action: ActData | null): boolean {
    if (!action) return false;
    return action.id === 'inspect_dummy' || action.nameAct.toLowerCase() === 'inspect';
  }

  // ─── Confirm ───────────────────────────────────────────────────────────────

  private tryConfirm(tile: TileData, onConfirm: (r: AOEResult) => void): void {
    const radius   = this.action?.aoe?.radius ?? 0;
    const affected = this.getTilesInRadius(tile, radius);

    if (!this.isAreaInRange(affected)) return;

    const targets  = this.getTargetsIn(affected, this.casterUnit!, this.action!);

    if (targets.length === 0) return; // Nothing to hit

    const result: AOEResult = {
      centerTile:    tile,
      targets,
      affectedTiles: affected,
    };

    this.deactivate();
    onConfirm(result);
  }

  // ─── Tile picking ──────────────────────────────────────────────────────────

  private pickTile(info: PointerInfo): TileData | null {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
    );
    if (!pick?.hit || !pick.pickedMesh) return null;

    // 1. Direct unit detection (Metadata check with bubble-up)
    let currentMesh: any = pick.pickedMesh;
    while (currentMesh) {
      if (currentMesh.metadata?.unitId) {
        const unit = this.allUnits.find(u => u.id === currentMesh.metadata.unitId && !u.isDead);
        if (unit) {
          return this.grid.getTile(unit.status.gridX, unit.status.gridZ);
        }
      }
      currentMesh = currentMesh.parent;
    }

    // 2. Fallback: Find tile by mesh name pattern "tile_x_z" (The ground beneath)
    const name = pick.pickedMesh.name;
    const match = name.match(/^tile_(\d+)_(\d+)$/);
    if (match) {
        return this.grid.getTile(parseInt(match[1]), parseInt(match[2]));
    }

    return null;
  }

  // ─── Range check ──────────────────────────────────────────────────────────

  /**
   * Check if the specific tile is within maxRange of the caster.
   * Uses Euclidean distance to match the "AOE circle limit" visual.
   */
  private isTileWithinRange(tile: TileData): boolean {
    if (!this.casterUnit || !this.action) return false;
    
    const ts = this.grid.tileSize;
    const cx = this.casterUnit.status.gridX;
    const cz = this.casterUnit.status.gridZ;

    // Euclidean distance in tile units
    const dx = tile.x - cx;
    const dz = tile.z - cz;
    const euclidDist = Math.sqrt(dx * dx + dz * dz);

    // Precise match with createRangeVisual logic: (range + 0.5)
    // We use + 0.7 to be generous and include any tile "touched" even partially by the circle
    return euclidDist <= (this.maxRange + 0.55);
  }

  /**
   * Check if any tile in the provided area is within range.
   * This allows "overlapping" AOE where the edge of the circle touches the range limit.
   */
  private isAreaInRange(affectedTiles: TileData[]): boolean {
    if (!this.casterUnit || !this.action || !this.centerTile) return false;
    
    const cx = this.casterUnit.status.gridX;
    const cz = this.casterUnit.status.gridZ;

    // 1. Minimum Range Check: Center of impact must be outside the deadzone
    const minRange = this.action.minRange ?? 0;
    const centerDist = Math.abs(this.centerTile.x - cx) + Math.abs(this.centerTile.z - cz);
    if (centerDist < minRange) return false; 

    // 2. Maximum Range Check: At least ONE tile in the impact area must be within range
    return affectedTiles.some(t => this.isTileWithinRange(t));
  }

  private isInRange(tile: TileData): boolean {
    return this.isTileWithinRange(tile);
  }

  // ─── Radius calculation (XZ only — same as Unity) ─────────────────────────

  private getTilesInRadius(center: TileData, radius: number): TileData[] {
    const result: TileData[] = [];
    const ts = this.grid.tileSize;

    // Convert tile radius to world units, then back to tile count
    const tileCount = Math.ceil(radius);

    for (let dx = -tileCount; dx <= tileCount; dx++) {
      for (let dz = -tileCount; dz <= tileCount; dz++) {
        // Horizontal (XZ) distance in world units
        const xzDist = Math.sqrt(
          (dx * ts) * (dx * ts) + (dz * ts) * (dz * ts)
        );
        if (xzDist <= radius * ts + 0.01) {
          const t = this.grid.getTile(center.x + dx, center.z + dz);
          if (t) result.push(t);
        }
      }
    }
    return result;
  }

  private getTargetsIn(tiles: TileData[], caster: Unit | null, action: ActData): Unit[] {
    const targets: Unit[] = [];
    if (!caster) return [];
    
    const casterTeam = caster.team;

    for (const tile of tiles) {
      const unit = this.allUnits.find(
        u => u.status.gridX === tile.x && u.status.gridZ === tile.z && !u.isDead
      );
      if (!unit) continue;

      const isEnemy = unit.team !== casterTeam;
      const isAlly  = unit.team === casterTeam;

      const isHelpful = action.typeAction === TypeAction.HEAL || action.typeAction === TypeAction.BUFF;

      if (isHelpful && isAlly) {
        targets.push(unit);
      } else if (!isHelpful && isEnemy) {
        targets.push(unit);
      }
    }
    return targets;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getTileTopSurface(tile: TileData): Vector3 {
    const pos = this.grid.getTileTopPosition(tile.x, tile.z);
    return pos ?? new Vector3(0, 0, 0);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.deactivate();
    this.discTexture?.dispose();
    this.discTexture = null;
    this.rangeTexture?.dispose();
    this.rangeTexture = null;
    this.matValid.dispose();
    this.matHeal.dispose();
    this.matInvalid.dispose();
    this.matBorder.dispose();
    this.matRange.dispose();
  }
}
