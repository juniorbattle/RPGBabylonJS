/**
 * CombatScene.ts
 * 3D Geometry Version based on Unique Persistent Scene.
 * Purely injectable and cleans up itself without scene destruction.
 */

import {
  Engine, Scene, HemisphericLight, DirectionalLight, SpotLight,
  Vector3, TransformNode, MeshBuilder, StandardMaterial, Color3, Color4,
  DefaultRenderingPipeline, Texture, DynamicTexture
} from '@babylonjs/core';

import { CombatGrid, GridConfig }                          from './CombatGrid';
import { CombatManager }                                   from './CombatManager';
import { CombatArtPreset, FloorConfig, SkyColors, SunConfig, getCombatArtPreset } from './CombatArtPresets';
import { SceneBackdropManager }                            from '../rendering/SceneBackdropManager';
import { SceneProps3DManager }                             from '../rendering/SceneProps3DManager';
import { SceneDioramaManager }                             from '../rendering/SceneDioramaManager';
import { ScenePostFX }                                     from '../rendering/ScenePostFX';
import type { SceneryConfig }                              from '../rendering/SceneryTypes';
import { getDefaultScenery }                               from '../biomes/forestBiome';
import type { SceneGroundLayerConfig }                     from '../rendering/SceneGroundTypes';
import { TacticalCamera, CameraMode }                      from '../camera/TacticalCamera';
import { ClanManager }                                     from '../data/ClanManager';
import { GameManager }                                     from '../data/GameManager';
import { DataManager }                                     from '../data/DataManager';

import { CombatHUD }      from '../ui/CombatHUD';
import { TurnOrderUI }    from '../ui/TurnOrderUI';
import { ActionBarUI }    from '../ui/ActionBarUI';
import { SkillMenuUI }    from '../ui/SkillMenuUI';
import { ItemMenuUI }     from '../ui/ItemMenuUI';
import { ObjectiveUI }    from '../ui/ObjectiveUI';
import { CombatPreview }  from '../ui/CombatPreview';
import { BattleResultUI } from '../ui/BattleResultUI';

interface ExportedCombatMapData {
  gridW?: number;
  gridD?: number;
  gridElevation?: number;
  floorY?: number;
  biome?: string;
  decorations?: ExportedDecorationData[];
  proceduralMeta?: {
    groundSeed?: number;
  };
  groundLayer?: Partial<SceneGroundLayerConfig>;
  /**
   * Diorama scenery (backdrop + 3D props + post-FX). Replaces the legacy
   * `sceneLayers` panel stack. If absent, the default preset for `biome`
   * is used (`getDefaultScenery`).
   */
  scenery?: Partial<SceneryConfig>;
}

interface ExportedDecorationData {
  file: string;
  x: number;
  y?: number;
  z: number;
  scaleMult?: number;
  scaleX: number;
  layer?: 'back' | 'mid' | 'front' | 'fore';
  animated?: boolean;
  animClip?: string | null;
}

type PropLayer = 'back' | 'mid' | 'front';

interface DecorLayerStyle {
  diffuse: Color3;
  emissive: Color3;
  alpha: number;
  scale: number;
  yOffset: number;
  zOffset: number;
  renderingGroupId: number;
}

interface AnimatedPropDef {
  file: string;
  type: string;
  scaleRange?: [number, number];
  cols: number;
  rows: number;
  fps: number;
  animations?: Record<string, { frames: number[]; fps?: number; loop?: boolean }>;
}

interface EditorManifestData {
  animatedProps?: AnimatedPropDef[];
}

interface CinematicOccluderMaterial {
  material: StandardMaterial;
  normalAlpha: number;
  cinematicAlpha: number;
}

export class CombatScene {

  private _engine: Engine;
  private _scene:  Scene;
  private _combatRoot: TransformNode;

  private _camera!: TacticalCamera;
  private _grid!:   CombatGrid;
  private _manager!: CombatManager;

  private _hud!:        CombatHUD;
  private _turnUI!:     TurnOrderUI;
  private _actionBar!:  ActionBarUI;
  private _skillMenu!:  SkillMenuUI;
  private _itemMenu!:   ItemMenuUI;
  private _objectives!: ObjectiveUI;
  private _preview!:    CombatPreview;
  private _battleResultUI!: BattleResultUI;
  
  private _renderingPipeline: DefaultRenderingPipeline | null = null;
  private _dofObserver: any = null;
  private _currentSceneryRoot: TransformNode | null = null;
  private _sceneryObservers: any[] = [];
  private _editorManifestPromise: Promise<EditorManifestData | null> | null = null;
  private _activeArtPreset: CombatArtPreset | null = null;
  private _cinematicOccluders: CinematicOccluderMaterial[] = [];
  private _propShadowMat: StandardMaterial | null = null;

  // Diorama scenery pipeline (replaces legacy SceneLayerManager).
  private _backdrop: SceneBackdropManager | null = null;
  private _props3D: SceneProps3DManager | null = null;
  private _diorama: SceneDioramaManager | null = null;
  private _postFX: ScenePostFX | null = null;
  private _activeScenery: SceneryConfig | null = null;

  constructor(scene: Scene, _canvas: HTMLCanvasElement, engine: Engine) {
    this._scene = scene;
    this._engine = engine;
    this._combatRoot = new TransformNode("CombatRootNode", this._scene);
    this._combatRoot.setEnabled(false);
  }

  public setVisible(visible: boolean): void {
    this._combatRoot.setEnabled(visible);
    
    // Fix Domain Leak: Hide the dynamic 2D sky layer manually as it ignores TransformNodes
    const skyLayer = this._scene.layers.find(l => l.name === 'skyBg');
    if (skyLayer) {
        skyLayer.layerMask = visible ? 0x0FFFFFFF : 0x00000000;
    }

    if (visible && this._camera) {
        this._scene.activeCamera = this._camera.babylonCamera;
    }
  }

  public async startCombat(): Promise<void> {
    const gm = GameManager.getInstance();
    const config = gm.activeCombatConfig;
    const customMapData = await this.loadConfiguredMapData(config?.mapFile ?? null);

    const gridW = customMapData?.gridW ?? config?.gridW ?? 8;
    const gridD = customMapData?.gridD ?? config?.gridD ?? 8;
    const biome = customMapData?.biome ?? config?.biome ?? "forest";
    const gridElevation = customMapData?.gridElevation ?? customMapData?.floorY ?? 0;
    const artPreset = getCombatArtPreset(biome);
    this._activeArtPreset = artPreset;

    this._scene.clearColor = artPreset.clearColor;

    this.setupLighting(artPreset);
    
    await this.buildDioramaScenery(gridW * 2, gridD * 2, biome, customMapData, artPreset);

    this._camera = new TacticalCamera(this._scene);
    this._scene.activeCamera = this._camera.babylonCamera;

    // Set up Tilt-Shift & HD-2D Post Processing
    this.setupPostProcessing(artPreset);

    // Wire diorama scenery (backdrop + 3D props + scenery-aware post-FX) now
    // that the TacticalCamera exists. The terrain ground + ambient particles
    // were already built earlier in buildDioramaScenery.
    this.setupSceneryWithCamera();
    
    // GRID DIMENSIONS SYNC
    // Configuration beaucoup plus douce pour matcher la ref Pixel Art (Sol plat avec légères irrégularités)
    const gridConfig: GridConfig = {
      width: gridW, 
      depth: gridD,
      tileSize: 2,
      biome,
      floorConfig: {
        baseColor: artPreset.floor.baseColor,
        stripeColor: artPreset.floor.stripeColor,
        accentColor: artPreset.floor.accentColor,
      },
      baseHeight: 0, 
      maxHeight: 0.4, // Très faible variation, comme des pavés ou de l'herbe inégale
      noiseScale: 0, 
      flat: true,
      gridElevation
    };
    
    this._grid = new CombatGrid(this._scene, gridConfig);
    
    this._camera.configureForMap(gridConfig.width, gridConfig.depth, gridConfig.tileSize, 0);
    this._camera.setOverviewMode();

    this._manager = new CombatManager(
      this._scene, this._grid, this._camera,
      {
        onBattleEnd: (w: string, p?: string[]) => this.onBattleEnd(w, p),
        onLog: (m: string) => console.log(m),
      },
      [], // Actions will be loaded from Units/DataManager
    );
    this._manager.stageManager.setCinematicHooks({
      setDepthMode: (enabled: boolean) => this.setCinematicDepthMode(enabled),
      setPostMode: (enabled: boolean) => this.setCinematicPostMode(enabled),
    });

    // POSITIONING FIX: Mark deployment columns (X = 0, 1) on the left side
    // ONLY IF the tile is strictly walkable!
    for (let x = 0; x < 2; x++) {
        for (let z = 0; z < gridConfig.depth; z++) {
            const tile = this._grid.getTile(x, z);
            if (tile && tile.walkable) {
                tile.isDeploymentTile = true;
            }
        }
    }
    
    this._grid.clearHighlights(); // Pulse is activated inside grid logic

    const clan = ClanManager.getInstance();
    // Starter clan is now pre-initialized in SceneManager from units.json
    this.attachUI();

    const dm = DataManager.getInstance();
    const enemies = Array.isArray(config?.enemies) ? config.enemies : ["goblin_scout"];
    enemies.forEach((enemyId: string, index: number) => {
        const enemyData = dm.getEnemy(enemyId);
        if (enemyData) {
            // Distribute enemies over the last 2 columns to avoid stacking
            const targetX = (index % 2 === 0) ? gridConfig.width - 1 : gridConfig.width - 2;
            const targetZ = Math.floor(index / 2) % gridConfig.depth;
            this._manager.addUnit(enemyData, targetX, targetZ);
        }
    });

    this._scene.meshes.forEach(m => {
        if (!m.parent && m.name !== "WorldRootNode" && m.name !== "CombatRootNode") {
            m.parent = this._combatRoot;
        }
    });

    // CRITICAL: Ensure all skills are loaded into the actionsMap
    dm.getAllSkills().forEach(skill => {
        this._manager.addSkillToActionMap(skill);
    });

    this._manager.startBattle();
    console.log("⚔️ Battle Arena Injected.");
  }

  private attachUI(): void {
    // 🛡️ RE-INITIALIZE THE ACTUAL FUNCTIONAL HUD INSTANCES
    this._hud        = new CombatHUD();
    this._turnUI     = new TurnOrderUI();
    this._skillMenu      = new SkillMenuUI();
    this._itemMenu       = new ItemMenuUI();
    this._objectives     = new ObjectiveUI();
    this._battleResultUI = new BattleResultUI();
    this._preview        = new CombatPreview();

    // The placeholders in CombatManager will be replaced by THESE instances
    this._manager.attachUI(this._hud, this._turnUI, (null as any), this._skillMenu, this._itemMenu, this._objectives);
    
    // Inject Objective Text from GameManager Combat Config
    const config = GameManager.getInstance().activeCombatConfig;
    if (config && config.objectiveText) {
        this._objectives.setText(config.objectiveText);
    } else {
        this._objectives.setText("Vaincre tous les ennemis !");
    }
  }

  public endCombat(): void {
    // 🧹 SAFETY: DETACH EFFECTS EARLY BEFORE CAMERA DIES
    if (this._dofObserver) {
        this._scene.onBeforeRenderObservable.remove(this._dofObserver);
        this._dofObserver = null;
    }
    
    if (this._renderingPipeline && this._camera && this._camera.babylonCamera) {
      this._scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("hd2dPipeline", this._camera.babylonCamera);
    }

    if (this._renderingPipeline) {
        this._renderingPipeline.dispose();
        this._renderingPipeline = null;
    }

    this._sceneryObservers.forEach(observer => {
        this._scene.onBeforeRenderObservable.remove(observer);
    });
    this._sceneryObservers = [];
    this._cinematicOccluders = [];
    this._activeArtPreset = null;
    this._propShadowMat?.dispose();
    this._propShadowMat = null;

    this._backdrop?.dispose();
    this._backdrop = null;
    this._props3D?.dispose();
    this._props3D = null;
    this._diorama?.dispose();
    this._diorama = null;
    this._postFX?.dispose();
    this._postFX = null;
    this._activeScenery = null;

    // Reset scene fog so it doesn't leak into other scenes (equipment, etc.).
    this._scene.fogMode = Scene.FOGMODE_NONE;
    this._scene.fogDensity = 0;

    if (this._currentSceneryRoot) {
        this._currentSceneryRoot.dispose(false, true);
        this._currentSceneryRoot = null;
    }

    // 🧹 UI CLEANUP
    if (this._hud)        this._hud.dispose();
    if (this._turnUI)     this._turnUI.dispose();
    if (this._skillMenu)  this._skillMenu.dispose();
    if (this._itemMenu)   this._itemMenu.dispose();
    if (this._objectives) this._objectives.dispose();
    if (this._preview)    this._preview.dispose();
    if (this._battleResultUI) this._battleResultUI.dispose();
    if (this._actionBar)  this._actionBar.dispose();

    // 🧊 SYSTEM CLEANUP
    if (this._manager) this._manager.dispose();
    if (this._grid)    this._grid.dispose();
    if (this._camera)  this._camera.dispose();
    
    // Explicitly destroy the persistent sky layer
    const skyLayer = this._scene.layers.find(l => l.name === 'skyBg');
    if (skyLayer) {
        if (skyLayer.texture) skyLayer.texture.dispose();
        skyLayer.dispose();
    }

    this._scene.lights.slice().forEach(l => {
        if (
            l.name === 'sunCombat' ||
            l.name === 'ambCombat' ||
            l.name === 'rimCombat' ||
            l.name === 'heroSpotCombat'
        ) l.dispose();
    });
  }

  /**
   * Dramatic HD-2D lighting stack :
   *   - Hemispheric ambient (boosted) so shadow zones still read.
   *   - Warm directional sun coming front-right-above, the signature
   *     Octopath / Triangle Strategy key light.
   *   - Cool blue rim-light coming from behind so prop silhouettes
   *     detach cleanly from the backdrop.
   *   - Magical hero spotlight aimed straight down at the plateau
   *     center so combatants are clearly the focal point.
   *
   * All four lights are tagged with the "Combat" suffix so endCombat()
   * disposes them in one sweep.
   */
  private setupLighting(preset: CombatArtPreset): void {
    // HD-2D 3-point lighting tuned for the frontal Focus/Normal cameras :
    // crushed ambient + warm key + saturated teal back-rim + tight hero
    // spot. Gives clean directional shadow on the plateau, luminous edges
    // on every 3D prop, and a sharp stage pool on the combatants.

    // 1. AMBIENT — dropped to ×0.85 so the unlit side of props actually
    //    goes dark. The previous ×1.15 was lifting everything and reading
    //    as overcast on the frontal angle.
    const amb = new HemisphericLight('ambCombat', new Vector3(0, 1, 0), this._scene);
    amb.diffuse = preset.ambient.diffuse;
    amb.groundColor = preset.ambient.ground;
    amb.intensity = preset.ambient.intensity * 0.85;

    // 2. SUN — warm directional key. Intensity kept at ×1.55, but specular
    //    scaled down so the warm highlights stay matte-cinematic instead of
    //    going plastic-shiny on rocks and the plateau.
    const sun = new DirectionalLight('sunCombat', preset.sun.direction, this._scene);
    sun.diffuse = preset.sun.diffuse;
    sun.specular = preset.sun.specular.scale(0.65);
    sun.intensity = preset.sun.intensity * 1.55;
    sun.position = preset.sun.position;

    // 3. RIM-LIGHT — saturated jade back-light. Direction made noticeably
    //    more horizontal (Y -0.10 vs the old -0.30) so it grazes the SIDES
    //    of props instead of their tops — the classic moonlight-through-
    //    canopy edge glow. Colour pushed and intensity bumped to 1.40 so
    //    it survives the deep fog and reads from the frontal camera.
    const rim = new DirectionalLight(
      'rimCombat',
      new Vector3(0.55, -0.10, -1.0).normalize(),
      this._scene
    );
    rim.diffuse = new Color3(0.30, 0.78, 0.72);
    rim.specular = new Color3(0.18, 0.52, 0.48);
    rim.intensity = 1.40;

    // 4. HERO SPOTLIGHT — tighter (~47° cone) and hotter so the stage pool
    //    sits right around the combatants instead of bleeding into the
    //    back row. Position lowered (Y 26 → 22) to tighten the falloff
    //    radius on the plateau without making the cone harsh.
    const heroSpot = new SpotLight(
      'heroSpotCombat',
      new Vector3(8, 22, 6),
      new Vector3(0, -1, 0),
      Math.PI / 3.8,
      8,
      this._scene
    );
    heroSpot.diffuse = new Color3(1.0, 0.86, 0.62);
    heroSpot.specular = new Color3(0.45, 0.40, 0.32);
    heroSpot.intensity = 1.80;
    heroSpot.range = 30;
  }

  private setupPostProcessing(preset: CombatArtPreset): void {
    if (this._renderingPipeline) {
        this._renderingPipeline.dispose();
    }

    this._renderingPipeline = new DefaultRenderingPipeline(
        "hd2dPipeline",     
        true,               
        this._scene,        
        [this._camera.babylonCamera] 
    );

    // 1. Anti-Aliasing 
    this._renderingPipeline.samples = 4;
    this._renderingPipeline.fxaaEnabled = true;

    // 2. Color Grading : Muted to make the Grid pop
    this._renderingPipeline.imageProcessingEnabled = true;
    this._renderingPipeline.imageProcessing.contrast = preset.post.contrast;
    this._renderingPipeline.imageProcessing.exposure = preset.post.exposure;
    this._renderingPipeline.imageProcessing.vignetteEnabled = true;
    this._renderingPipeline.imageProcessing.vignetteWeight = 1.72;
    this._renderingPipeline.imageProcessing.vignetteStretch = 0.62;
    this._renderingPipeline.imageProcessing.vignetteColor = new Color4(0.012, 0.026, 0.016, 1.0);

    // 3. Bloom (soft, painterly) — kernel widened so the warm god rays
    //    and jade rim glow read as a true halo instead of a sharp ring.
    this._renderingPipeline.bloomEnabled = true;
    this._renderingPipeline.bloomThreshold = preset.post.bloomThreshold;
    this._renderingPipeline.bloomWeight = preset.post.bloomWeight;
    this._renderingPipeline.bloomKernel = 72;

    // Animated grain : subtle film texture that glues the procedural
    // backdrop and the 3D stage together. Intensity tuned per camera
    // mode by applyPerModePostFX.
    this._renderingPipeline.grainEnabled = true;
    this._renderingPipeline.grain.intensity = 4.5;
    this._renderingPipeline.grain.animated = true;

    // 4. HD-2D TILT-SHIFT (DEPTH OF FIELD VERY AGGRESSIVE)
    this._renderingPipeline.depthOfFieldEnabled = true;
    // Lowering focal length/distance drastically to force standard blur on edges
    this._renderingPipeline.depthOfField.fStop = preset.post.dofFStop;
    this._renderingPipeline.depthOfField.focalLength = preset.post.dofFocalLength;
    this._renderingPipeline.depthOfField.lensSize = preset.post.dofLensSize;
    
    if (this._dofObserver) {
        this._scene.onBeforeRenderObservable.remove(this._dofObserver);
    }
    
    this._dofObserver = this._scene.onBeforeRenderObservable.add(() => {
        if (!this._renderingPipeline || !this._camera || !this._camera.babylonCamera) return;
        if (this._camera.babylonCamera.isDisposed()) return;

        const camTarget = this._camera.babylonCamera.getTarget();
        // Le point focal est littéralement la grille.
        const distance = Vector3.Distance(this._camera.babylonCamera.position, camTarget);
        this._renderingPipeline.depthOfField.focusDistance = distance * 1000; 
    });

    // Apply the initial per-mode profile (Normal). The TacticalCamera will
    // flip to Overview on startCombat and re-trigger this via onModeChanged.
    this.applyPerModePostFX(CameraMode.Normal);
  }

  /**
   * Adjusts the post-FX baseline per active camera mode :
   *  - Overview : tactical readability — light vignette, neutral DOF, mild grain.
   *  - Normal   : baseline cinematic — standard vignette/DOF tuned per preset.
   *  - Focus    : dramatic close-up — heavy vignette, shallow DOF, hotter grain.
   *
   * Called every time TacticalCamera flips mode (via onModeChanged) AND
   * once at the end of setupPostProcessing for the initial frame. Independent
   * from setCinematicPostMode() which is layered on top during attack/skill
   * sequences.
   */
  private applyPerModePostFX(mode: CameraMode): void {
    if (!this._renderingPipeline || !this._activeArtPreset) return;
    const post = this._activeArtPreset.post;

    let vignetteWeight: number;
    let dofFStop: number;
    let dofFocalLength: number;
    let dofLensSize: number;
    let grain: number;
    let contrastAdj = 0;
    let exposureMul = 1.0;

    switch (mode) {
      case CameraMode.Overview:
        // Tactical view : pull back the cinematic effects so the grid
        // stays crisp and readable from the high tilt.
        vignetteWeight  = 1.22;
        dofFStop        = 6.0;
        dofFocalLength  = 26;
        dofLensSize     = 18;
        grain           = 3.5;
        break;

      case CameraMode.Focus:
        // Cinematic close-up : push everything for the drama. The aggressive
        // shallow DOF + heavy vignette + hot grain reads as the signature
        // HD-2D attack closeup.
        vignetteWeight  = 1.95;
        dofFStop        = 1.10;
        dofFocalLength  = 62;
        dofLensSize     = 58;
        grain           = 6.5;
        contrastAdj     = 0.06;
        exposureMul     = 0.94;
        break;

      case CameraMode.Normal:
      default:
        // Baseline frontal play view — mild DOF on backdrop, moderate vignette.
        vignetteWeight  = 1.72;
        dofFStop        = post.dofFStop;
        dofFocalLength  = post.dofFocalLength;
        dofLensSize     = post.dofLensSize;
        grain           = 4.5;
        break;
    }

    this._renderingPipeline.imageProcessing.contrast = post.contrast + contrastAdj;
    this._renderingPipeline.imageProcessing.exposure = post.exposure * exposureMul;
    this._renderingPipeline.imageProcessing.vignetteWeight = vignetteWeight;
    this._renderingPipeline.depthOfField.fStop = dofFStop;
    this._renderingPipeline.depthOfField.focalLength = dofFocalLength;
    this._renderingPipeline.depthOfField.lensSize = dofLensSize;
    this._renderingPipeline.grain.intensity = grain;
  }

  private registerCinematicOccluder(material: StandardMaterial, cinematicAlpha: number): void {
      if (this._cinematicOccluders.some(entry => entry.material === material)) return;
      this._cinematicOccluders.push({
          material,
          normalAlpha: material.alpha,
          cinematicAlpha,
      });
  }

  private setCinematicDepthMode(enabled: boolean): void {
      this._postFX?.setCinematicMode(enabled);

      this._cinematicOccluders.forEach(entry => {
          entry.material.alpha = enabled ? entry.cinematicAlpha : entry.normalAlpha;
      });
  }

  private setCinematicPostMode(enabled: boolean): void {
      if (!this._renderingPipeline || !this._activeArtPreset) return;

      const post = this._activeArtPreset.post;
      this._renderingPipeline.imageProcessing.contrast = enabled
          ? Math.max(1.24, post.contrast + 0.08)
          : post.contrast;
      this._renderingPipeline.imageProcessing.exposure = enabled
          ? Math.max(0.72, post.exposure * 0.92)
          : post.exposure;
      this._renderingPipeline.imageProcessing.vignetteWeight = enabled ? 1.95 : 1.72;

      this._renderingPipeline.bloomThreshold = enabled
          ? Math.max(0.46, post.bloomThreshold - 0.12)
          : post.bloomThreshold;
      this._renderingPipeline.bloomWeight = enabled
          ? Math.min(0.58, post.bloomWeight + 0.16)
          : post.bloomWeight;

      this._renderingPipeline.depthOfField.fStop = enabled
          ? Math.max(0.75, post.dofFStop * 0.68)
          : post.dofFStop;
      this._renderingPipeline.depthOfField.focalLength = enabled
          ? post.dofFocalLength + 16
          : post.dofFocalLength;
      this._renderingPipeline.depthOfField.lensSize = enabled
          ? post.dofLensSize + 18
          : post.dofLensSize;

      this._renderingPipeline.grain.intensity = enabled ? 7.0 : 5.5;
  }

  private async buildDioramaScenery(
      mapW: number,
      mapD: number,
      biome: string,
      mapData: ExportedCombatMapData | null,
      preset: CombatArtPreset
  ): Promise<void> {
      const sceneryRoot = new TransformNode("SceneryRoot", this._scene);
      sceneryRoot.parent = this._combatRoot;
      this._currentSceneryRoot = sceneryRoot;
      
      let baseSurfaceY = 0; 
      const gmMode = GameManager.getInstance().activeCombatConfig;

      // On tente d'abord de lire s'il y a un JSON Custom exporté défini dans plateaus.json => "combatConfig.mapFile"
      const customMapLoaded = !!mapData;
      if (mapData?.floorY !== undefined && mapData?.gridElevation === undefined) {
          baseSurfaceY = mapData.floorY;
      }
      // 0. SCENERY CONFIG : merge map override with biome default preset.
      // The override is intentionally shallow per-section so a partial JSON
      // (e.g. only `backdrop.gradient`) does not wipe the other defaults.
      // The `diorama` block is taken verbatim from the override when present
      // (or falls back to the preset's diorama if the biome ships one).
      const defaultScenery = getDefaultScenery(biome);
      const sceneryOverride = mapData?.scenery;
      const sceneryConfig: SceneryConfig = sceneryOverride
          ? {
              biome: (sceneryOverride.biome ?? defaultScenery.biome) as SceneryConfig['biome'],
              backdrop: { ...defaultScenery.backdrop, ...sceneryOverride.backdrop } as SceneryConfig['backdrop'],
              props: sceneryOverride.props ?? defaultScenery.props,
              postFX: { ...defaultScenery.postFX, ...sceneryOverride.postFX },
              ambient: { ...defaultScenery.ambient, ...sceneryOverride.ambient } as SceneryConfig['ambient'],
              diorama: sceneryOverride.diorama ?? defaultScenery.diorama,
          }
          : defaultScenery;
      this._activeScenery = sceneryConfig;

      // 1. GROUND (combat plateau surrounding plane) — optional. When the
      // map's `groundLayer.enabled` is false (or the section is omitted), no
      // surrounding plane is created at all : the combat plateau floats on
      // the backdrop ambiance. This is the canonical diorama-theater look.
      // Set `enabled: true` in `groundLayer` to bring it back (useful for
      // dioramas that need a soft tile under their feet).
      const groundLayer = mapData?.groundLayer;
      const groundEnabled = groundLayer?.enabled === true;
      const dioramaCfg = sceneryConfig.diorama;
      const dioramaActiveForGround = !!dioramaCfg && dioramaCfg.enabled !== false;

      if (groundEnabled) {
          const baseW = mapW * (groundLayer.widthScale ?? 8);
          const baseD = mapD * (groundLayer.depthScale ?? 8);
          const terrainPlane = MeshBuilder.CreateGround("terrainBase", { width: baseW, height: baseD }, this._scene);
          terrainPlane.position.x = groundLayer.xOffset ?? 0;
          terrainPlane.position.y = baseSurfaceY + (groundLayer.elevationOffset ?? 0);
          terrainPlane.position.z = mapD / 2 + (groundLayer.zOffset ?? 0);
          terrainPlane.isPickable = false;

          const terMat = new StandardMaterial("terrainMat", this._scene);

          if (groundLayer.mode === 'texture' && groundLayer.textureFile) {
              const groundTex = new Texture(`/assets/backgrounds/${groundLayer.textureFile}`, this._scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
              groundTex.wrapU = Texture.WRAP_ADDRESSMODE;
              groundTex.wrapV = Texture.WRAP_ADDRESSMODE;
              groundTex.uScale = groundLayer.repeatX ?? 8;
              groundTex.vScale = groundLayer.repeatY ?? 8;
              groundTex.hasAlpha = true;
              terMat.diffuseTexture = groundTex;
              terMat.useAlphaFromDiffuseTexture = true;
              terMat.diffuseColor = Color3.White();
              terMat.emissiveColor = new Color3(0.08, 0.10, 0.07);
              terMat.alpha = groundLayer.opacity ?? 1;
          } else if (groundLayer.mode === 'color') {
              const groundColor = Color3.FromHexString(groundLayer.color ?? '#163018');
              terMat.diffuseColor = groundColor;
              terMat.emissiveColor = groundColor.scale(0.18);
              terMat.alpha = groundLayer.opacity ?? 1;
          } else {
              terMat.diffuseColor = preset.terrainTint;
              const groundTex = await this.createProceduralGroundTexture(
                  biome,
                  mapData?.proceduralMeta?.groundSeed ?? 1,
                  preset.floor
              );
              groundTex.uScale = groundLayer.repeatX ?? 8;
              groundTex.vScale = groundLayer.repeatY ?? 8;
              terMat.diffuseTexture = groundTex;
              terMat.emissiveColor = preset.terrainEmissive;
              terMat.alpha = groundLayer.opacity ?? 1;
          }
          terMat.specularColor = new Color3(0, 0, 0);
          if (terMat.alpha < 1) {
              terMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
              terMat.disableDepthWrite = true;
          }
          terrainPlane.material = terMat;
          terrainPlane.parent = sceneryRoot;

          // Stage ground accent : soft grass disc that blends the plateau
          // into the surrounding terrain. Only meaningful when there *is*
          // a surrounding terrain, AND we don't have a diorama supplying
          // its own ground. Skipped completely if either is missing.
          if (!dioramaActiveForGround || dioramaCfg!.keepStageGroundAccent) {
              this.buildStageGroundAccent(sceneryRoot, mapW, mapD, baseSurfaceY, preset);
          }
      }

      // 2. DIORAMA SCENERY : single-plane backdrop + 3D props.
      // The TacticalCamera is built AFTER buildDioramaScenery, so we defer
      // the actual backdrop/props/postFX setup to a follow-up step (see below).
      this._currentSceneryRoot = sceneryRoot;

      // 3. LEGACY DECORATIONS (editor-exported 2D billboards) — kept for
      // backwards compatibility with maps still authored via the old editor.
      if (customMapLoaded && mapData && mapData.decorations && mapData.decorations.length > 0) {
          console.log(`🗺️ Custom Editor map layout '${gmMode.mapFile}' built perfectly from JSON!`);
          const editorManifest = await this.loadEditorManifest();
          this.buildDecorFromEditorJSON(sceneryRoot, mapData.decorations, baseSurfaceY, mapD, editorManifest?.animatedProps ?? []);
      } else {
          console.log(`🌲 No custom mapFile specified. Spawning pure combat grid purely.`);
      }

      // 4. AMBIENT PARTICLES — two layers stacked for depth :
      //    a) fireflies : larger billboards with organic figure-8 motion,
      //       split between warm amber and cool teal for that JRPG magic
      //       forest feel ;
      //    b) dust motes : a denser cloud of tiny scintillating specks that
      //       breathe their alpha to suggest atmosphere thickness.
      const ambient = sceneryConfig.ambient ?? { color: [0.4, 1, 0.2], count: 22, alpha: [0.08, 0.26] };
      const fireflyCount = Math.max(12, Math.round(ambient.count * 0.55));
      const dustCount    = Math.max(30, Math.round(ambient.count * 1.8));
      const [alphaMin, alphaMax] = ambient.alpha;

      // -- Firefly glow texture : warm-white center fading through the
      // biome ambient hue to a transparent rim. Used by both warm and cool
      // fireflies — the per-mesh emissiveColor handles the actual tint.
      const fireflyTex = new DynamicTexture('combatFireflyGlowTex', { width: 64, height: 64 }, this._scene, false);
      fireflyTex.hasAlpha = true;
      const fireflyCtx = fireflyTex.getContext() as CanvasRenderingContext2D;
      fireflyCtx.clearRect(0, 0, 64, 64);
      const fireflyGradient = fireflyCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
      fireflyGradient.addColorStop(0.00, 'rgba(255,255,235,1.00)');
      fireflyGradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      fireflyGradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      fireflyCtx.fillStyle = fireflyGradient;
      fireflyCtx.fillRect(0, 0, 64, 64);
      fireflyTex.update(false);

      // -- Dust mote texture : a much softer point-glow without harsh
      // centre so a hundred of them don't aggregate into bright blotches.
      const dustTex = new DynamicTexture('combatDustMoteTex', { width: 32, height: 32 }, this._scene, false);
      dustTex.hasAlpha = true;
      const dustCtx = dustTex.getContext() as CanvasRenderingContext2D;
      dustCtx.clearRect(0, 0, 32, 32);
      const dustGradient = dustCtx.createRadialGradient(16, 16, 0.5, 16, 16, 14);
      dustGradient.addColorStop(0.00, 'rgba(255,255,255,0.85)');
      dustGradient.addColorStop(0.50, 'rgba(255,255,255,0.25)');
      dustGradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      dustCtx.fillStyle = dustGradient;
      dustCtx.fillRect(0, 0, 32, 32);
      dustTex.update(false);

      const WARM = new Color3(1.00, 0.82, 0.42);   // golden firefly
      const COOL = new Color3(0.45, 0.95, 1.00);   // teal-ice magical mote

      // --- Layer A : fireflies (organic figure-8 motion, mixed colours).
      for (let i = 0; i < fireflyCount; i++) {
          const isWarm = i % 2 === 0;
          const moteSize = 0.10 + Math.random() * 0.14;
          const fly = MeshBuilder.CreatePlane(`firefly_${i}`, { size: moteSize }, this._scene);
          fly.isPickable = false;
          fly.billboardMode = TransformNode.BILLBOARDMODE_ALL;
          fly.renderingGroupId = 1;

          const fMat = new StandardMaterial(`fireflyMat_${i}`, this._scene);
          fMat.diffuseTexture = fireflyTex;
          fMat.opacityTexture = fireflyTex;
          fMat.useAlphaFromDiffuseTexture = true;
          fMat.emissiveColor = isWarm ? WARM : COOL;
          fMat.disableLighting = true;
          fMat.disableDepthWrite = true;
          fMat.backFaceCulling = false;
          fMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
          fMat.alphaMode = 6;
          fMat.alpha = alphaMin * 1.6 + Math.random() * (alphaMax - alphaMin);
          fly.material = fMat;

          const baseX = (Math.random() - 0.5) * (mapW + 22);
          const baseY = baseSurfaceY + 1.2 + Math.random() * 3.6;
          const baseZ = (Math.random() - 0.5) * (mapD + 22);
          fly.position.set(baseX, baseY, baseZ);
          fly.parent = sceneryRoot;

          // Each firefly has its own phase + frequency triplet so the
          // overall swarm never feels synchronised.
          const meta = {
              phaseX: Math.random() * Math.PI * 2,
              phaseY: Math.random() * Math.PI * 2,
              phaseZ: Math.random() * Math.PI * 2,
              freqX: 0.30 + Math.random() * 0.35,
              freqY: 0.45 + Math.random() * 0.45,
              freqZ: 0.25 + Math.random() * 0.30,
              ampX: 0.6 + Math.random() * 0.9,
              ampY: 0.35 + Math.random() * 0.55,
              ampZ: 0.5 + Math.random() * 0.8,
          };

          const flyObserver = this._scene.onBeforeRenderObservable.add(() => {
              if (fly.isDisposed()) return;
              const t = performance.now() * 0.001;
              fly.position.x = baseX + Math.cos(t * meta.freqX + meta.phaseX) * meta.ampX;
              fly.position.y = baseY + Math.sin(t * meta.freqY + meta.phaseY) * meta.ampY;
              fly.position.z = baseZ + Math.sin(t * meta.freqZ + meta.phaseZ) * meta.ampZ;
          });
          this._sceneryObservers.push(flyObserver);
      }

      // --- Layer B : dust motes (tiny, dense, slow rise + alpha twinkle).
      for (let i = 0; i < dustCount; i++) {
          const moteSize = 0.04 + Math.random() * 0.06;
          const mote = MeshBuilder.CreatePlane(`dust_${i}`, { size: moteSize }, this._scene);
          mote.isPickable = false;
          mote.billboardMode = TransformNode.BILLBOARDMODE_ALL;
          mote.renderingGroupId = 1;

          const dMat = new StandardMaterial(`dustMat_${i}`, this._scene);
          dMat.diffuseTexture = dustTex;
          dMat.opacityTexture = dustTex;
          dMat.useAlphaFromDiffuseTexture = true;
          // Mostly white with a faint warm/cool drift for variety.
          dMat.emissiveColor = i % 3 === 0
              ? new Color3(0.95, 0.90, 0.75)
              : i % 3 === 1
                  ? new Color3(0.75, 0.95, 0.95)
                  : new Color3(1.00, 1.00, 1.00);
          dMat.disableLighting = true;
          dMat.disableDepthWrite = true;
          dMat.backFaceCulling = false;
          dMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
          dMat.alphaMode = 6;
          const baseAlpha = alphaMin * 0.6 + Math.random() * (alphaMax * 0.6);
          dMat.alpha = baseAlpha;
          mote.material = dMat;

          mote.position.set(
              (Math.random() - 0.5) * (mapW + 24),
              baseSurfaceY + 0.2 + Math.random() * 4.4,
              (Math.random() - 0.5) * (mapD + 24),
          );
          mote.parent = sceneryRoot;

          const meta = {
              speedY:     0.0015 + Math.random() * 0.004,
              driftX:     (Math.random() - 0.5) * 0.008,
              twinklePhase: Math.random() * Math.PI * 2,
              twinkleFreq:  1.2 + Math.random() * 1.8,
              twinkleAmp:   baseAlpha * 0.55,
              baseAlpha,
              ceilingY:   baseSurfaceY + 5.0,
              floorY:     baseSurfaceY + 0.1,
          };

          const dustObserver = this._scene.onBeforeRenderObservable.add(() => {
              if (mote.isDisposed()) return;
              const t = performance.now() * 0.001;
              mote.position.y += meta.speedY;
              mote.position.x += meta.driftX + Math.sin(t + i) * 0.004;
              if (mote.position.y > meta.ceilingY) mote.position.y = meta.floorY;
              // Twinkle : modulate alpha around its base value.
              dMat.alpha = Math.max(
                  0,
                  meta.baseAlpha + Math.sin(t * meta.twinkleFreq + meta.twinklePhase) * meta.twinkleAmp,
              );
          });
          this._sceneryObservers.push(dustObserver);
      }
  }

  /**
   * Wires the camera-dependent half of the diorama scenery :
   * - SceneBackdropManager (needs camera FOV + position)
   * - SceneProps3DManager  (places .glb / primitive props)
   * - ScenePostFX          (reconfigures the active rendering pipeline)
   *
   * Also subscribes to `TacticalCamera.onModeChanged` so the focus/idle
   * cinematic post-FX ramp follows mode transitions automatically.
   */
  private setupSceneryWithCamera(): void {
      if (!this._activeScenery || !this._currentSceneryRoot || !this._camera) return;

      this._backdrop?.dispose();
      this._props3D?.dispose();
      this._diorama?.dispose();
      this._postFX?.dispose();

      // Detect an active diorama : when present, it provides all the mid
      // decoration (volumes + light shafts) so we opt-out of the procedural
      // primitives and the additive god-rays quads by default, unless the
      // diorama config explicitly asks to keep them.
      const dioramaCfg = this._activeScenery.diorama;
      const dioramaActive = !!dioramaCfg && dioramaCfg.enabled !== false;
      const skipProceduralProps = dioramaActive && !dioramaCfg!.keepProceduralProps;
      const skipGodRays         = dioramaActive && !dioramaCfg!.keepGodRays;

      this._backdrop = new SceneBackdropManager(
          this._scene,
          this._currentSceneryRoot,
          this._camera.babylonCamera,
      );
      this._backdrop.setup(this._activeScenery.backdrop);

      this._props3D = new SceneProps3DManager(this._scene, this._currentSceneryRoot);
      if (!skipProceduralProps) {
          void this._props3D.placeProps(this._activeScenery.props);
      }

      // Optional .glb diorama mega-prop (Tripo3D / Blender authored).
      // Awaited asynchronously without blocking the rest of the setup. If the
      // load fails AND we had skipped the procedural props, place them now as
      // a fallback so the scene is not left without any mid decor.
      if (dioramaCfg) {
          this._diorama = new SceneDioramaManager(this._scene, this._currentSceneryRoot);
          const propsRef = this._props3D;
          const sceneryRef = this._activeScenery;
          void this._diorama.setup(dioramaCfg).then(() => {
              if (this._diorama && !this._diorama.isLoaded() && skipProceduralProps) {
                  console.info(
                      '[CombatScene] Diorama did not load — placing procedural props as fallback.',
                  );
                  void propsRef.placeProps(sceneryRef.props);
              }
          });
      }

      this._postFX = new ScenePostFX(this._scene, this._camera.babylonCamera);
      this._postFX.setup(this._activeScenery.postFX, this._renderingPipeline ?? undefined);

      // Exponential jade fog : reads as real aerial perspective on the back
      // half of the scene without crushing the plateau. Colour pulled down
      // to a deeper teal so the silhouettes of back-row meshes desaturate
      // into the backdrop instead of floating on it. Density bumped from
      // 0.012 → 0.016 to actually feel the haze at combat distance.
      this._scene.fogMode = Scene.FOGMODE_EXP2;
      this._scene.fogColor = new Color3(0.035, 0.095, 0.075);
      this._scene.fogDensity = 0.016;

      // God rays : five oblique shafts of light coming down-right, parented
      // to the scenery root so endCombat sweeps them away. Skipped when a
      // diorama supplies its own painted light shafts.
      if (!skipGodRays) {
          this.buildGodRays();
      }

      this._camera.onModeChanged = (mode) => {
          this.applyPerModePostFX(mode);
          this._postFX?.setCinematicMode(mode === CameraMode.Focus);
      };
  }

  /**
   * Creates a handful of additive translucent planes faking volumetric
   * "shafts of light" cutting through the forest canopy. Each shaft uses a
   * procedural texture with a vertical gradient (opaque at the top, fading
   * to transparent at the bottom) plus soft horizontal edges so the planes
   * read as real beams rather than rectangular billboards. The warm tint
   * gets picked up by post-FX bloom for the volumetric illusion at zero
   * shader cost.
   */
  private buildGodRays(): void {
      if (!this._currentSceneryRoot) return;

      const root = new TransformNode('godRaysRoot', this._scene);
      root.parent = this._currentSceneryRoot;

      const beamTex = this.createGodRayTexture();
      const mat = new StandardMaterial('godRayMat', this._scene);
      mat.diffuseTexture = beamTex;
      mat.opacityTexture = beamTex;
      mat.useAlphaFromDiffuseTexture = true;
      mat.emissiveColor = new Color3(0.95, 0.78, 0.45);   // warm amber, less saturated
      mat.diffuseColor = new Color3(0, 0, 0);
      mat.specularColor = new Color3(0, 0, 0);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.alphaMode = 1;                                   // ADD blend
      mat.disableDepthWrite = true;
      mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

      // Seven shafts placed BEHIND the plateau (Z=18..23) so they read as
      // atmospheric depth in the frontal Focus/Normal frames. Heights kept
      // SHORT (24) and Y_center LOW (5..8) so the brightest band of the
      // vertical gradient (top of texture, alpha 0.92) actually sits inside
      // the camera frustum — the previous Y=16, h=42 layout pushed the
      // bright cap to world Y~37 (well above the Normal-mode frame top
      // ~Y=10 at Z=20), so only the dim tail was visible and got crushed
      // by the deep teal fog.
      //
      // Two "hero" beams (idx 0 & 3) carry the bulk of the glow ; the rest
      // are secondaries that thicken the haze. One mid-stage filler at
      // Z=13 catches the back row of combatants in Focus close-ups.
      //
      // All beams share a consistent roll toward the sun source (the sun
      // light travels (-0.8,-1.2,+0.6), so the source sits camera-upper-
      // right ; we lean the tops to +X by ~14° to read as "coming from
      // the sun"). Slight yaw variation keeps them from looking stamped.
      const shafts: Array<{ x: number; y: number; z: number; w: number; yaw: number; roll: number; alpha: number; hero: boolean }> = [
          { x:  2, y: 5, z: 18, w: 3.0, yaw:  10, roll: -14, alpha: 0.78, hero: true  },
          { x:  5, y: 6, z: 21, w: 1.6, yaw:  -6, roll: -12, alpha: 0.48, hero: false },
          { x:  8, y: 7, z: 23, w: 2.0, yaw:   4, roll: -15, alpha: 0.56, hero: false },
          { x: 11, y: 5, z: 18, w: 3.4, yaw:  -8, roll: -13, alpha: 0.85, hero: true  },
          { x: 14, y: 7, z: 22, w: 1.7, yaw:   8, roll: -14, alpha: 0.50, hero: false },
          { x: 17, y: 6, z: 19, w: 1.8, yaw:  -4, roll: -12, alpha: 0.46, hero: false },
          { x:  9, y: 8, z: 13, w: 1.2, yaw:  12, roll: -16, alpha: 0.36, hero: false },
      ];

      shafts.forEach((s, i) => {
          const shaftMat = mat.clone(`godRayMat_${i}`);
          shaftMat.alpha = s.alpha;
          // Hero beams get a saturated warm emissive that punches above the
          // bloom threshold (0.58) — bright enough to register as a true
          // pillar of light. Secondaries stay warm but a notch softer.
          if (s.hero) {
              shaftMat.emissiveColor = new Color3(1.55, 1.25, 0.72);
          } else {
              shaftMat.emissiveColor = new Color3(1.18, 0.98, 0.58);
          }
          const plane = MeshBuilder.CreatePlane(`godRay_${i}`, { width: s.w, height: 24 }, this._scene);
          plane.material = shaftMat;
          plane.parent = root;
          plane.position.set(s.x, s.y, s.z);
          plane.rotation.set(
              (10 * Math.PI) / 180,           // pitch slightly forward
              (s.yaw * Math.PI) / 180,        // yaw for slight spread
              (s.roll * Math.PI) / 180,       // consistent lean toward sun
          );
          plane.isPickable = false;
          plane.renderingGroupId = 0;
          plane.alwaysSelectAsActiveMesh = true;
      });

      mat.dispose();  // base mat is no longer needed (we cloned per-shaft).
  }

  /**
   * Builds a one-shot procedural texture for the god-ray quads : opaque
   * white at the top, fading to fully transparent at the bottom, with
   * softened horizontal edges so the plane silhouettes do not show as
   * sharp rectangles. Tinted at draw time via material.emissiveColor.
   */
  private createGodRayTexture(): DynamicTexture {
      const tex = new DynamicTexture('godRayBeamTex', { width: 64, height: 256 }, this._scene, false);
      tex.hasAlpha = true;
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 64, 256);

      // Vertical body : strong opacity at the top, fade to zero at the
      // bottom. Multiple stops give a non-linear "shaft" feel.
      const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
      vGrad.addColorStop(0.00, 'rgba(255,255,255,0.92)');
      vGrad.addColorStop(0.30, 'rgba(255,255,255,0.55)');
      vGrad.addColorStop(0.65, 'rgba(255,255,255,0.20)');
      vGrad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, 64, 256);

      // Horizontal soft-edge mask : multiply the body by a centre-bright
      // radial-ish gradient so the side edges fade out cleanly.
      const hGrad = ctx.createLinearGradient(0, 0, 64, 0);
      hGrad.addColorStop(0.00, 'rgba(0,0,0,1.00)');
      hGrad.addColorStop(0.20, 'rgba(0,0,0,0.00)');
      hGrad.addColorStop(0.80, 'rgba(0,0,0,0.00)');
      hGrad.addColorStop(1.00, 'rgba(0,0,0,1.00)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = hGrad;
      ctx.fillRect(0, 0, 64, 256);
      ctx.globalCompositeOperation = 'source-over';

      tex.update(false);
      return tex;
  }

  private buildStageGroundAccent(
      root: TransformNode,
      mapW: number,
      mapD: number,
      baseSurfaceY: number,
      preset: CombatArtPreset
  ): void {
      const accentTex = this.createStageGroundAccentTexture('stageGroundAccent');
      const accentMat = new StandardMaterial('stageGroundAccentMat', this._scene);
      accentMat.diffuseTexture = accentTex;
      accentMat.opacityTexture = accentTex;
      accentMat.useAlphaFromDiffuseTexture = true;
      accentMat.disableLighting = true;
      accentMat.specularColor = new Color3(0, 0, 0);
      accentMat.emissiveColor = preset.terrainTint.scale(1.75);
      accentMat.alpha = 0.74;
      accentMat.backFaceCulling = false;

      const accent = MeshBuilder.CreateGround(
          'stageGroundAccent',
          { width: mapW * 1.72, height: mapD * 1.48 },
          this._scene
      );
      accent.position = new Vector3(0, baseSurfaceY + 0.018, mapD * 0.38);
      accent.material = accentMat;
      accent.parent = root;
      accent.isPickable = false;
      accent.renderingGroupId = 0;
  }

  private createStageGroundAccentTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 512, height: 384 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      const rng = this.makeRng(11891);
      ctx.clearRect(0, 0, 512, 384);

      const pool = ctx.createRadialGradient(256, 170, 36, 256, 186, 255);
      pool.addColorStop(0, 'rgba(160,168,92,0.42)');
      pool.addColorStop(0.48, 'rgba(118,132,70,0.22)');
      pool.addColorStop(0.78, 'rgba(48,78,34,0.10)');
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, 512, 384);

      for (let i = 0; i < 34; i++) {
          const x = 40 + rng() * 432;
          const y = 48 + rng() * 250;
          const rx = 16 + rng() * 46;
          const ry = 5 + rng() * 16;
          const alpha = 0.04 + rng() * 0.10;
          ctx.fillStyle = `rgba(${88 + rng() * 56},${104 + rng() * 62},${48 + rng() * 30},${alpha})`;
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
      }

      const lowerFade = ctx.createLinearGradient(0, 184, 0, 384);
      lowerFade.addColorStop(0, 'rgba(0,0,0,0)');
      lowerFade.addColorStop(1, 'rgba(0,0,0,0.46)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = lowerFade;
      ctx.fillRect(0, 184, 512, 200);
      ctx.globalCompositeOperation = 'source-over';

      texture.update(false);
      return texture;
  }


  /**
   * Recreates the HD-2D decor based exactly on an exported JSON from `MapEditor`.
   * Bypass all Random functions and symetrics, it obeys coordinates pixel perfectly.
   * Path resolution assumes the `v3.0` global `/assets/decorations/` architecture.
   */
  private buildDecorFromEditorJSON(
      root: TransformNode,
      decorations: ExportedDecorationData[],
      fallbackGroundY: number,
      mapDepth: number,
      animatedProps: AnimatedPropDef[] = []
  ): void {
      const sharedMats: Map<string, StandardMaterial> = new Map();
      const animatedByFile = new Map(animatedProps.map(prop => [prop.file, prop]));
      
      const getMatAndTex = (filename: string, layer: PropLayer): { mat: StandardMaterial, tex: Texture } => {
          const key = `${filename}:${layer}`;
          if (sharedMats.has(key)) {
              return { mat: sharedMats.get(key)!, tex: sharedMats.get(key)!.diffuseTexture as Texture };
          }
          const layerStyle = this.getDecorationLayerStyle(layer);
          const mat = new StandardMaterial(`propMat_${filename}`, this._scene);
          mat.backFaceCulling = false;
          // Force pure diffuse calculation to leave Alpha doing its job
          mat.diffuseColor = layerStyle.diffuse;
          mat.emissiveColor = layerStyle.emissive;
          mat.alpha = layerStyle.alpha;
          
          const tex = new Texture(`/assets/decorations/${filename}`, this._scene, false, true, Texture.BILINEAR_SAMPLINGMODE,
              () => {}, () => { mat.diffuseTexture = null; }
          ); 
          
          // The MAGIC PIXELS Fix : prevent Babylon from converting darker pixels (PNG drop shadows/smoothing) into opaque blocks !
          tex.hasAlpha = true;
          tex.getAlphaFromRGB = false; 
          
          mat.diffuseTexture = tex;
          mat.useAlphaFromDiffuseTexture = true;
          // Alpha Test (binary clipping) instead of standard Alpha blending, preventing depth-sorting glitches
          mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
          mat.specularColor = new Color3(0, 0, 0); 
          
          sharedMats.set(key, mat);
          return { mat, tex };
      };

      decorations.forEach((dec: ExportedDecorationData, idx: number) => {
          const layer = this.resolveDecorationLayer(dec, mapDepth);
          const layerStyle = this.getDecorationLayerStyle(layer);

          if (dec.animated) {
              const def = animatedByFile.get(dec.file);
              if (def) {
                  this.buildAnimatedDecorFromEditorJSON(root, dec, def, fallbackGroundY, mapDepth, idx);
                  return;
              }
          }

          const { mat } = getMatAndTex(dec.file, layer);
          if (layer === 'front') {
              this.registerCinematicOccluder(mat, 0.18);
          }
          
          // Re-Calcul scale exactly as editor did it natively
          let finalW = 2.0; let finalH = 2.0;
          if (dec.file.includes('tree')) {
              finalW = 4.7; finalH = finalW * 1.4; 
          } else if (dec.file.includes('boulder')) {
              finalW = 2.3; finalH = finalW * 0.7; 
          } else if (dec.file.includes('grass') || dec.file.includes('fern')) {
              finalW = 1.25; finalH = finalW; 
          } else if (dec.file.includes('ruins')) {
              finalW = 2.4; finalH = 2.8;
          } else if (dec.file.includes('altar')) {
              finalW = 2.2; finalH = 1.8;
          } else if (dec.file.includes('torch')) {
              finalW = 0.9; finalH = 2.6;
          } else if (dec.file.includes('statue')) {
              finalW = 1.8; finalH = 3.2;
          }

          // Apply potential Editor-defined object custom scaling (v4 feature fallback)
          const objScale = (dec.scaleMult !== undefined) ? dec.scaleMult : 1.0;
          finalW *= objScale * layerStyle.scale;
          finalH *= objScale * layerStyle.scale;

          // Compatibility with v1 JSON (no fixed exact Y) vs v2 JSON
          const sinkValue = (dec.file.includes('boulder') ? 0.3 : 0.05) * objScale;
          let calculatedY = fallbackGroundY - sinkValue;
          
          if (dec.y !== undefined && dec.y !== null) {
              calculatedY = dec.y; // The absolute baked world height coordinate from Editor v2.0 !
          }
          calculatedY += layerStyle.yOffset;

          const pivotAlign = new TransformNode(`loader_pivot_${idx}`, this._scene);
          pivotAlign.position = new Vector3(dec.x, calculatedY, dec.z + layerStyle.zOffset);
          pivotAlign.parent = root;

          this.createPropGroundShadow(root, dec.x, calculatedY, dec.z + layerStyle.zOffset, finalW, layer);
          
          const spritePlane = MeshBuilder.CreatePlane(`loader_node_${idx}`, { width: finalW, height: finalH }, this._scene);
          spritePlane.material = mat;
          spritePlane.parent = pivotAlign;
          spritePlane.position.y = finalH / 2.0; 
          spritePlane.renderingGroupId = layerStyle.renderingGroupId;
          
          pivotAlign.billboardMode = TransformNode.BILLBOARDMODE_ALL;
          
          // Editor encoded mirrored objects as scaleX -1 and regular 1.
          if (dec.scaleX < 0) {
              pivotAlign.scaling.x = -1;
          }
      });
  }

  private buildAnimatedDecorFromEditorJSON(
      root: TransformNode,
      dec: ExportedDecorationData,
      def: AnimatedPropDef,
      fallbackGroundY: number,
      mapDepth: number,
      idx: number
  ): void {
      const layer = this.resolveDecorationLayer(dec, mapDepth);
      const layerStyle = this.getDecorationLayerStyle(layer);
      const objScale = dec.scaleMult !== undefined ? dec.scaleMult : 1.0;
      const size = this.getDecorBaseSize(def.type, dec.file);
      const finalW = size.width * objScale * layerStyle.scale;
      const finalH = size.height * objScale * layerStyle.scale;
      const calculatedY = (dec.y !== undefined && dec.y !== null ? dec.y : fallbackGroundY - 0.05 * objScale) + layerStyle.yOffset;

      const pivot = new TransformNode(`loader_anim_pivot_${idx}`, this._scene);
      pivot.position = new Vector3(dec.x, calculatedY, dec.z + layerStyle.zOffset);
      pivot.parent = root;
      pivot.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      if (dec.scaleX < 0) {
          pivot.scaling.x = -1;
      }

      this.createPropGroundShadow(root, dec.x, calculatedY, dec.z + layerStyle.zOffset, finalW, layer);

      const tex = new Texture(`/assets/decorations/${def.file}`, this._scene, false, true, Texture.NEAREST_SAMPLINGMODE);
      tex.hasAlpha = true;
      tex.wrapU = Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      tex.uScale = 1 / Math.max(1, def.cols);
      tex.vScale = 1 / Math.max(1, def.rows);

      const mat = new StandardMaterial(`loader_anim_mat_${idx}`, this._scene);
      mat.diffuseTexture = tex;
      mat.useAlphaFromDiffuseTexture = true;
      mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      mat.diffuseColor = layerStyle.diffuse;
      mat.emissiveColor = layerStyle.emissive;
      mat.alpha = layerStyle.alpha;
      if (layer === 'front') {
          this.registerCinematicOccluder(mat, 0.18);
      }

      const plane = MeshBuilder.CreatePlane(`loader_anim_node_${idx}`, { width: finalW, height: finalH }, this._scene);
      plane.material = mat;
      plane.parent = pivot;
      plane.position.y = finalH / 2;
      plane.isPickable = false;
      plane.renderingGroupId = layerStyle.renderingGroupId;

      const clip = def.animations?.[dec.animClip ?? 'idle'] ?? def.animations?.idle;
      const frames = clip?.frames?.length ? clip.frames : Array.from({ length: def.cols * def.rows }, (_, frame) => frame);
      const fps = clip?.fps ?? def.fps ?? 8;
      let cursor = 0;
      let accumulator = 0;

      const setFrame = (frameIndex: number) => {
          const cols = Math.max(1, def.cols);
          const rows = Math.max(1, def.rows);
          const safeFrame = Math.max(0, Math.min(frameIndex, cols * rows - 1));
          const col = safeFrame % cols;
          const row = Math.floor(safeFrame / cols);
          tex.uOffset = col / cols;
          tex.vOffset = 1 - ((row + 1) / rows);
      };

      setFrame(frames[0] ?? 0);
      const observer = this._scene.onBeforeRenderObservable.add(() => {
          if (plane.isDisposed() || !frames.length) return;
          accumulator += this._scene.getEngine().getDeltaTime() / 1000;
          const frameDuration = 1 / Math.max(fps, 1);
          while (accumulator >= frameDuration) {
              accumulator -= frameDuration;
              cursor = (cursor + 1) % frames.length;
              setFrame(frames[cursor]);
          }
      });
      this._sceneryObservers.push(observer);
  }

  private createPropGroundShadow(
      root: TransformNode,
      x: number,
      y: number,
      z: number,
      visualWidth: number,
      layer: PropLayer
  ): void {
      const layerScale = layer === 'front' ? 1.12 : layer === 'back' ? 0.72 : 0.92;
      const shadow = MeshBuilder.CreatePlane(
          `propGroundShadow_${layer}_${Math.round(x * 100)}_${Math.round(z * 100)}`,
          { width: visualWidth * 0.76 * layerScale, height: Math.max(0.28, visualWidth * 0.26 * layerScale) },
          this._scene
      );
      shadow.rotation.x = Math.PI / 2;
      shadow.position = new Vector3(x, y + 0.018, z);
      shadow.parent = root;
      shadow.isPickable = false;
      shadow.renderingGroupId = 0;
      shadow.material = this.getPropShadowMaterial();
  }

  private getPropShadowMaterial(): StandardMaterial {
      if (this._propShadowMat) return this._propShadowMat;

      const mat = new StandardMaterial('propGroundShadowMat', this._scene);
      mat.disableLighting = true;
      mat.disableDepthWrite = true;
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      mat.emissiveColor = new Color3(0, 0, 0);
      mat.alpha = 0.34;
      mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

      const tex = new DynamicTexture('propGroundShadowTex', { width: 192, height: 96 }, this._scene, false);
      tex.hasAlpha = true;
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 192, 96);
      const gradient = ctx.createRadialGradient(96, 48, 8, 96, 48, 84);
      gradient.addColorStop(0, 'rgba(0,0,0,0.76)');
      gradient.addColorStop(0.46, 'rgba(0,0,0,0.28)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 192, 96);
      tex.update(false);

      mat.diffuseTexture = tex;
      mat.opacityTexture = tex;
      mat.useAlphaFromDiffuseTexture = true;
      this._propShadowMat = mat;
      return mat;
  }

  private resolveDecorationLayer(dec: ExportedDecorationData, mapDepth: number): PropLayer {
      if (dec.layer === 'back' || dec.layer === 'mid' || dec.layer === 'front') {
          return dec.layer;
      }
      if (dec.layer === 'fore') {
          return 'front';
      }

      // Legacy map exports did not include a layer. In the front-facing camera,
      // negative/near Z reads as foreground, high Z reads as background.
      if (dec.z <= -0.75) return 'front';
      if (dec.z >= mapDepth + 1.0) return 'back';
      return 'mid';
  }

  private getDecorationLayerStyle(layer: PropLayer): DecorLayerStyle {
      switch (layer) {
          case 'back':
              return {
                  diffuse: new Color3(0.70, 0.80, 0.68),
                  emissive: new Color3(0.036, 0.052, 0.038),
                  alpha: 0.72,
                  scale: 0.82,
                  yOffset: -0.05,
                  zOffset: 0.54,
                  renderingGroupId: 0,
              };
          case 'front':
              return {
                  diffuse: new Color3(0.50, 0.61, 0.48),
                  emissive: new Color3(0.010, 0.020, 0.010),
                  alpha: 0.82,
                  scale: 1.16,
                  yOffset: 0.03,
                  zOffset: -0.48,
                  renderingGroupId: 2,
              };
          case 'mid':
          default:
              return {
                  diffuse: new Color3(1, 1, 1),
                  emissive: new Color3(0.055, 0.054, 0.045),
                  alpha: 0.96,
                  scale: 1.0,
                  yOffset: 0,
                  zOffset: 0,
                  renderingGroupId: 1,
              };
      }
  }

  private getDecorBaseSize(type: string, file: string): { width: number; height: number } {
      if (type === 'tree' || type === 'tree_sway' || file.includes('tree')) return { width: 4.7, height: 6.58 };
      if (type === 'boulder' || type === 'rock' || file.includes('boulder')) return { width: 2.3, height: 1.61 };
      if (type === 'grass' || type === 'grass_wind' || type === 'fern' || file.includes('grass') || file.includes('fern')) return { width: 1.25, height: 1.25 };
      if (type === 'bush' || type === 'bush_wind' || file.includes('bush')) return { width: 1.4, height: 1.2 };
      if (type === 'flower' || type === 'flower_sway' || file.includes('flower')) return { width: 1.0, height: 1.0 };
      if (type === 'ruins' || file.includes('ruins')) return { width: 2.4, height: 2.8 };
      if (type === 'altar' || file.includes('altar')) return { width: 2.2, height: 1.8 };
      if (type === 'torch' || type === 'torch_flicker' || file.includes('torch')) return { width: 0.9, height: 2.6 };
      if (type === 'statue' || file.includes('statue')) return { width: 1.8, height: 3.2 };
      if (type === 'waterfall') return { width: 3.0, height: 2.0 };
      return { width: 2.0, height: 2.0 };
  }

  private onBattleEnd(winner: string, participants: string[] = []): void {
    if (winner === 'TeamA') {
        const gm = GameManager.getInstance();
        const dm = DataManager.getInstance();
        const cm = ClanManager.getInstance();

        // 1. Calculate Rewards from Config
        let totalXP = 0;
        let totalGold = 0;
        const drops: any[] = []; // InventoryItem[]
        const enemyIds = gm.activeCombatConfig?.enemies || [];

        enemyIds.forEach((eid: string) => {
            const enemy = dm.getEnemy(eid);
            if (enemy) {
                totalXP += enemy.xpReward || 0;
                totalGold += enemy.goldReward || 0;
                
                if (enemy.drops) {
                    enemy.drops.forEach((d: any) => {
                        if (Math.random() <= d.rate) {
                            const item = dm.getItemData(d.itemId);
                            if (item) drops.push({ itemData: item, quantity: 1 });
                        }
                    });
                }
            }
        });

        // 2. Distribute
        const xpReport = cm.distributeCombatXP(totalXP, participants);
        cm.addGold(totalGold);
        cm.incrementVictories();
        drops.forEach(drop => cm.addItem(drop.itemData, drop.quantity));

        // 3. Show UI
        this._battleResultUI.showVictory(
            { 
                gold: totalGold, 
                xpPerUnit: totalXP, 
                items: drops, 
                turnsTaken: this._manager.turnManager.currentTurn || 0,
                victoriesCount: cm.getVictories() 
            }, 
            xpReport, 
            () => {
                gm.resolveCombat(true);
            }
        );
    } else {
        this._battleResultUI.showGameOver(() => {
            GameManager.getInstance().resolveCombat(false);
        });
    }
  }

  public dispose(): void {
    this.endCombat();
    this._combatRoot.dispose();
  }

  private async loadConfiguredMapData(mapFile: string | null): Promise<ExportedCombatMapData | null> {
    if (!mapFile) {
      return null;
    }

    try {
      const response = await fetch(`/data/maps/${mapFile}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json() as ExportedCombatMapData;
    } catch (error) {
      console.warn(`Failed to load combat map '${mapFile}'.`, error);
      return null;
    }
  }

  private async loadEditorManifest(): Promise<EditorManifestData | null> {
    if (!this._editorManifestPromise) {
      this._editorManifestPromise = fetch('/data/editor_manifest.json')
        .then(async response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return await response.json() as EditorManifestData;
        })
        .catch(error => {
          console.warn('Failed to load editor manifest for animated combat props.', error);
          this._editorManifestPromise = null;
          return null;
        });
    }

    return this._editorManifestPromise;
  }

  private async createProceduralGroundTexture(biome: string, seed: number, floor: FloorConfig): Promise<DynamicTexture> {
    const texture = new DynamicTexture(`combatGround_${biome}`, { width: 512, height: 512 }, this._scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    this.paintGround(ctx, floor, seed);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.update(false);

    return texture;
  }

  private createProceduralSkyTexture(biome: string, preset: CombatArtPreset): DynamicTexture {
    const texture = new DynamicTexture(`combatSky_${biome}`, { width: 512, height: 256 }, this._scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    this.paintSky(ctx, preset.sky, preset.skySun);
    texture.update(false);

    return texture;
  }

  private paintGround(ctx: CanvasRenderingContext2D, cfg: FloorConfig, seed: number): void {
    const width = 512;
    const height = 512;
    const rng = this.makeRng(seed);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = cfg.baseColor;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = cfg.stripeColor;
    ctx.lineWidth = cfg.stripeWidth;
    for (let x = -height; x < width + height; x += cfg.stripeWidth * 7) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }
    ctx.restore();

    const [ar, ag, ab] = this.hexToRgb(cfg.accentColor);
    const patchCount = 18 + Math.floor(rng() * 12);
    for (let i = 0; i < patchCount; i++) {
      const px = rng() * width;
      const py = rng() * height;
      const pr = 20 + rng() * 55;
      const pa = 0.08 + rng() * 0.16;
      const squash = 0.45 + rng() * 0.4;
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, pr);
      gradient.addColorStop(0, `rgba(${ar},${ag},${ab},${pa})`);
      gradient.addColorStop(0.6, `rgba(${ar},${ag},${ab},${pa * 0.5})`);
      gradient.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = gradient;
      ctx.save();
      ctx.scale(1, squash);
      ctx.beginPath();
      ctx.arc(px, py / squash, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const [br, bg, bb] = this.hexToRgb(cfg.baseColor);
    const [sr, sg, sb] = this.hexToRgb(cfg.stripeColor);
    const dotCount = Math.floor(width * height / 28);
    for (let i = 0; i < dotCount; i++) {
      const dx = rng() * width;
      const dy = rng() * height;
      const dr = 1.5 + rng() * cfg.noiseAmp * 0.6;
      const mix = rng();
      const r = Math.round(br + (sr - br) * mix);
      const g = Math.round(bg + (sg - bg) * mix);
      const b = Math.round(bb + (sb - bb) * mix);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.06 + rng() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(dx, dy, dr, dr * (0.4 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  private paintSky(ctx: CanvasRenderingContext2D, colors: SkyColors, sun: SunConfig): void {
    const width = 512;
    const height = 256;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colors.zenith);
    gradient.addColorStop(0.58, colors.horizon);
    gradient.addColorStop(1, colors.ground);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const [sr, sg, sb] = this.hexToRgb(sun.color);
    const sx = sun.x * width;
    const sy = sun.y * height;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sun.glowRadius);
    glow.addColorStop(0, `rgba(${sr},${sg},${sb},0.55)`);
    glow.addColorStop(0.45, `rgba(${sr},${sg},${sb},0.18)`);
    glow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, sun.glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = sun.color;
    ctx.beginPath();
    ctx.arc(sx, sy, sun.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private hexToRgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
}
