/**
 * CombatScene.ts
 * 3D Geometry Version based on Unique Persistent Scene.
 * Purely injectable and cleans up itself without scene destruction.
 */

import {
  Engine, Scene, HemisphericLight, DirectionalLight,
  Vector3, TransformNode, MeshBuilder, StandardMaterial, Color3, Color4,
  DefaultRenderingPipeline, Texture, DynamicTexture
} from '@babylonjs/core';

import { CombatGrid, GridConfig }                          from './CombatGrid';
import { CombatManager }                                   from './CombatManager';
import { CombatArtPreset, FloorConfig, SkyColors, SunConfig, getCombatArtPreset } from './CombatArtPresets';
import { BiomeLayerManager, BIOME_LAYER_PRESETS } from './BiomeLayerSystem';
import { TacticalCamera }                                  from '../camera/TacticalCamera';
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
  layerOverrides?: Record<string, any>;
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
  private _layerManager: BiomeLayerManager | null = null;

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
    
    await this.buildDioramaScenery(gridW * 2, gridD * 2, biome, customMapData, artPreset, gridElevation);

    this._camera = new TacticalCamera(this._scene);
    this._scene.activeCamera = this._camera.babylonCamera; 
    
    // Set up Tilt-Shift & HD-2D Post Processing
    this.setupPostProcessing(artPreset);
    
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

    this._layerManager?.dispose();
    this._layerManager = null;

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
        if (l.name === "sunCombat" || l.name === "ambCombat") l.dispose();
    });
  }

  private setupLighting(preset: CombatArtPreset): void {
    const amb = new HemisphericLight('ambCombat', new Vector3(0, 1, 0), this._scene);
    amb.diffuse = preset.ambient.diffuse;
    amb.groundColor = preset.ambient.ground;
    amb.intensity = preset.ambient.intensity;
    
    const sun = new DirectionalLight('sunCombat', preset.sun.direction, this._scene);
    sun.diffuse = preset.sun.diffuse;
    sun.specular = preset.sun.specular;
    sun.intensity = preset.sun.intensity;
    sun.position = preset.sun.position;
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

    // 3. Bloom (soft)
    this._renderingPipeline.bloomEnabled = true;
    this._renderingPipeline.bloomThreshold = preset.post.bloomThreshold;
    this._renderingPipeline.bloomWeight = preset.post.bloomWeight;
    this._renderingPipeline.bloomKernel = 58;

    this._renderingPipeline.grainEnabled = true;
    this._renderingPipeline.grain.intensity = 5.5;
    this._renderingPipeline.grain.animated = false;

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
      this._layerManager?.setCinematicMode(enabled);

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
      preset: CombatArtPreset,
      gridElevation: number = 0
  ): Promise<void> {
      const sceneryRoot = new TransformNode("SceneryRoot", this._scene);
      sceneryRoot.parent = this._combatRoot;
      this._currentSceneryRoot = sceneryRoot;
      
      let baseSurfaceY = gridElevation; 
      const gmMode = GameManager.getInstance().activeCombatConfig;

      // On tente d'abord de lire s'il y a un JSON Custom exporté défini dans plateaus.json => "combatConfig.mapFile"
      const customMapLoaded = !!mapData;
      if (mapData?.gridElevation !== undefined) {
          baseSurfaceY = mapData.gridElevation;
      } else if (mapData?.floorY !== undefined) {
          baseSurfaceY = mapData.floorY;
      }
      const layerPreset = BIOME_LAYER_PRESETS[biome] ?? BIOME_LAYER_PRESETS['forest'];
      const hasAuthoredLayerSet = biome === 'forest' || !!mapData?.layerOverrides?.[biome]?.background?.file;
      const usesLayerBackdrop = hasAuthoredLayerSet && !!(mapData?.layerOverrides?.[biome]?.background?.file ?? layerPreset.background.file);
      
      // 1. LE SOL INFINI (Terrain Plane texturé HD-2D)
      // Remplace notre "Diorama Box / Table épaisse" d'avant par une plaine plate sur laquelle on répète l'image d'herbe.
      const baseW = mapW * 8; 
      const baseD = mapD * 8; 
      const terrainPlane = MeshBuilder.CreateGround("terrainBase", { width: baseW, height: baseD }, this._scene);
      terrainPlane.position.y = baseSurfaceY; 
      terrainPlane.position.z = mapD / 2; // Centré un peu en arrière
      terrainPlane.isPickable = false;
      
      const terMat = new StandardMaterial("terrainMat", this._scene);
      
      // Récupération de la couleur naturelle mais avec une ombre globale atténuée 
      if (usesLayerBackdrop) {
          terMat.diffuseColor = new Color3(0.005, 0.014, 0.006);
          terMat.emissiveColor = new Color3(0.002, 0.010, 0.004);
          terMat.alpha = 0.16;
          terMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
          terMat.disableDepthWrite = true;
      } else {
          terMat.diffuseColor = preset.terrainTint;
          const groundTex = await this.createProceduralGroundTexture(
              biome,
              mapData?.proceduralMeta?.groundSeed ?? 1,
              preset.floor
          );
          groundTex.uScale = 8; 
          groundTex.vScale = 8;
          terMat.diffuseTexture = groundTex;
          terMat.emissiveColor = preset.terrainEmissive;
      }
      terMat.specularColor = new Color3(0.0, 0.0, 0.0);
      terrainPlane.material = terMat;
      terrainPlane.parent = sceneryRoot;

      if (!usesLayerBackdrop) {
          this.buildStageGroundAccent(sceneryRoot, mapW, mapD, baseSurfaceY, preset);
      }

      // 2. BACKGROUND HD-2D — Layers PNG par biome
      // Le background procédural est remplacé par 4 plans PNG empilés
      // gérés par BiomeLayerManager : background, midground, fxOverlay, foreground.
      this._layerManager = new BiomeLayerManager(
          this._scene,
          sceneryRoot,
          mapW,
          mapD,
          baseSurfaceY
      );

      // Surcharges optionnelles exportées depuis le MapEditor.
      const layerOverrides = mapData?.layerOverrides?.[biome] ?? undefined;
      this._layerManager.buildLayers(biome, layerOverrides);

      // The PNG layer stack owns the cinematic shafts and foreground frame now.
      // Re-adding the old procedural shafts here would double the haze over units.

      // 3. SPAWNS: IMPORT JSON CUSTOM EDITOR OU ARÈNE VIDE (FIN DE LA GÉNÉRATION PROCÉDURALE)
      if (customMapLoaded && mapData && mapData.decorations && mapData.decorations.length > 0) {
          console.log(`🗺️ Custom Editor map layout '${gmMode.mapFile}' built perfectly from JSON!`);
          const editorManifest = await this.loadEditorManifest();
          this.buildDecorFromEditorJSON(sceneryRoot, mapData.decorations, baseSurfaceY, mapD, editorManifest?.animatedProps ?? []);
      } else {
          console.log(`🌲 No custom mapFile specified. Spawning pure combat grid purely.`);
      }
      
      // 4. MAGICAL FIREFLIES (Lucicles volantes - ambiance d'arène minimale)
      // Legacy depth cards are skipped: the layer PNGs now provide scene depth.

      const dustCount = layerPreset.particleCount;
      const [pr, pg, pb] = layerPreset.particleColor;
      const [alphaMin, alphaMax] = layerPreset.particleAlpha;
      const fireflyTex = new DynamicTexture('combatFireflyGlowTex', { width: 64, height: 64 }, this._scene, false);
      fireflyTex.hasAlpha = true;
      const fireflyCtx = fireflyTex.getContext() as CanvasRenderingContext2D;
      fireflyCtx.clearRect(0, 0, 64, 64);
      const fireflyGradient = fireflyCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
      fireflyGradient.addColorStop(0, 'rgba(255,255,210,1)');
      fireflyGradient.addColorStop(0.30, 'rgba(160,255,92,0.82)');
      fireflyGradient.addColorStop(1, 'rgba(60,255,48,0)');
      fireflyCtx.fillStyle = fireflyGradient;
      fireflyCtx.fillRect(0, 0, 64, 64);
      fireflyTex.update(false);

      for (let i = 0; i < dustCount; i++) {
          const moteSize = 0.08 + Math.random() * 0.08;
          const mote = MeshBuilder.CreatePlane(`dust_${i}`, { size: moteSize }, this._scene);
          mote.isPickable = false;
          mote.billboardMode = TransformNode.BILLBOARDMODE_ALL; // Billboad complet (7)
          
          const mMat = new StandardMaterial(`mMat_${i}`, this._scene);
          mMat.diffuseTexture = fireflyTex;
          mMat.opacityTexture = fireflyTex;
          mMat.useAlphaFromDiffuseTexture = true;
          mMat.emissiveColor = new Color3(pr, pg, pb);
          mMat.disableLighting = true;
          mMat.disableDepthWrite = true;
          mMat.backFaceCulling = false;
          mMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
          mMat.alphaMode = 6;
          mMat.alpha = alphaMin + Math.random() * (alphaMax - alphaMin);
          mote.material = mMat;
          mote.renderingGroupId = 1;
          
          mote.position = new Vector3(
              (Math.random() - 0.5) * (mapW + 20),
              baseSurfaceY + 0.2 + Math.random() * 4.0, 
              (Math.random() - 0.5) * (mapD + 20)
          );
          
          mote.metadata = {
              speedY: 0.002 + Math.random() * 0.006,
              speedX: (Math.random() - 0.5) * 0.015,
              startY: mote.position.y
          };
          
          mote.parent = sceneryRoot;
          
          const dustObserver = this._scene.onBeforeRenderObservable.add(() => {
              if (mote.isDisposed()) return;
              mote.position.y += mote.metadata.speedY;
              mote.position.x += mote.metadata.speedX + Math.sin(Date.now() * 0.001 + i) * 0.01;
              
              if (mote.position.y > (baseSurfaceY + 5.0)) {
                  mote.position.y = baseSurfaceY + 0.1; // Reset en bas
              }
          });
          this._sceneryObservers.push(dustObserver);
      }
  }

  private buildStageLightShafts(
      root: TransformNode,
      mapW: number,
      mapD: number,
      baseSurfaceY: number,
      preset: CombatArtPreset
  ): void {
      const shaftTex = this.createStageLightShaftTexture('stageLightShafts');
      const shaftMat = new StandardMaterial('stageLightShaftsMat', this._scene);
      shaftMat.diffuseTexture = shaftTex;
      shaftMat.opacityTexture = shaftTex;
      shaftMat.useAlphaFromDiffuseTexture = true;
      shaftMat.disableLighting = true;
      shaftMat.disableDepthWrite = true;
      shaftMat.specularColor = new Color3(0, 0, 0);
      shaftMat.emissiveColor = preset.sun.diffuse.scale(1.15);
      shaftMat.alpha = 0.52;
      shaftMat.backFaceCulling = false;
      shaftMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

      const shaftWall = MeshBuilder.CreatePlane('stageLightShaftsBack', { width: mapW * 2.0, height: 11.5 }, this._scene);
      shaftWall.position = new Vector3(0, baseSurfaceY + 4.4, mapD + 5.2);
      shaftWall.material = shaftMat;
      shaftWall.parent = root;
      shaftWall.isPickable = false;
      shaftWall.renderingGroupId = 1;

      const floorTex = this.createStageFloorMistTexture('stageFloorMist');
      const mistMat = new StandardMaterial('stageFloorMistMat', this._scene);
      mistMat.diffuseTexture = floorTex;
      mistMat.opacityTexture = floorTex;
      mistMat.useAlphaFromDiffuseTexture = true;
      mistMat.disableLighting = true;
      mistMat.disableDepthWrite = true;
      mistMat.specularColor = new Color3(0, 0, 0);
      mistMat.emissiveColor = new Color3(0.38, 0.48, 0.30);
      mistMat.alpha = 0.38;
      mistMat.backFaceCulling = false;
      mistMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

      const mist = MeshBuilder.CreateGround('stageFloorMist', { width: mapW * 1.85, height: mapD * 1.22 }, this._scene);
      mist.position = new Vector3(0, baseSurfaceY + 0.045, mapD * 0.48);
      mist.material = mistMat;
      mist.parent = root;
      mist.isPickable = false;
      mist.renderingGroupId = 1;
  }

  private buildDepthLayers(
      root: TransformNode,
      mapW: number,
      mapD: number,
      baseSurfaceY: number,
      biome: string,
      preset: CombatArtPreset
  ): void {
      const makeLayerMaterial = (
          name: string,
          texture: DynamicTexture,
          emissive: Color3,
          alpha: number
      ): StandardMaterial => {
          const mat = new StandardMaterial(name, this._scene);
          mat.diffuseTexture = texture;
          mat.opacityTexture = texture;
          mat.useAlphaFromDiffuseTexture = true;
          mat.disableLighting = true;
          mat.specularColor = new Color3(0, 0, 0);
          mat.emissiveColor = emissive;
          mat.alpha = alpha;
          mat.backFaceCulling = false;
          return mat;
      };

      const foreTex = this.createForegroundFoliageTexture(`${biome}_foregroundFoliage`);
      const foreMat = makeLayerMaterial(
          'foregroundFoliageMat',
          foreTex,
          preset.depth.foregroundEmissive,
          preset.depth.foregroundAlpha
      );
      this.registerCinematicOccluder(foreMat, 0.14);

      const leftFore = MeshBuilder.CreatePlane('foregroundFoliageLeft', { width: 14, height: 5.2 }, this._scene);
      leftFore.position = new Vector3(-mapW * 0.72, baseSurfaceY + 2.0, -2.8);
      leftFore.material = foreMat;
      leftFore.parent = root;
      leftFore.isPickable = false;
      leftFore.renderingGroupId = 3;

      const rightFore = MeshBuilder.CreatePlane('foregroundFoliageRight', { width: 14, height: 5.2 }, this._scene);
      rightFore.position = new Vector3(mapW * 0.72, baseSurfaceY + 2.0, -2.6);
      rightFore.scaling.x = -1;
      rightFore.material = foreMat;
      rightFore.parent = root;
      rightFore.isPickable = false;
      rightFore.renderingGroupId = 3;

      const stageFrameTex = this.createForegroundStageFrameTexture(`${biome}_foregroundStageFrame`);
      const stageFrameMat = makeLayerMaterial(
          'foregroundStageFrameMat',
          stageFrameTex,
          preset.depth.grassEmissive,
          preset.depth.grassAlpha * 0.62
      );
      this.registerCinematicOccluder(stageFrameMat, 0.10);

      const leftFrame = MeshBuilder.CreatePlane('foregroundStageFrameLeft', { width: mapW * 0.62, height: 2.4 }, this._scene);
      leftFrame.position = new Vector3(-mapW * 0.46, baseSurfaceY + 0.34, -4.7);
      leftFrame.material = stageFrameMat;
      leftFrame.parent = root;
      leftFrame.isPickable = false;
      leftFrame.renderingGroupId = 3;

      const rightFrame = MeshBuilder.CreatePlane('foregroundStageFrameRight', { width: mapW * 0.62, height: 2.4 }, this._scene);
      rightFrame.position = new Vector3(mapW * 0.46, baseSurfaceY + 0.34, -4.7);
      rightFrame.scaling.x = -1;
      rightFrame.material = stageFrameMat;
      rightFrame.parent = root;
      rightFrame.isPickable = false;
      rightFrame.renderingGroupId = 3;

      const hazeTex = this.createHazeTexture(`${biome}_stageHaze`);
      const hazeMat = makeLayerMaterial(
          'stageHazeMat',
          hazeTex,
          preset.depth.hazeEmissive,
          preset.depth.hazeAlpha
      );
      const haze = MeshBuilder.CreatePlane('stageBackgroundHaze', { width: mapW * 2.2, height: 9.0 }, this._scene);
      haze.position = new Vector3(0, baseSurfaceY + 4.0, mapD + 10);
      haze.material = hazeMat;
      haze.parent = root;
      haze.isPickable = false;
      haze.renderingGroupId = 0;
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

  private createStageLightShaftTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 768, height: 512 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      const rng = this.makeRng(43017);
      ctx.clearRect(0, 0, 768, 512);

      const topGlow = ctx.createRadialGradient(154, 0, 0, 154, 0, 390);
      topGlow.addColorStop(0, 'rgba(255,231,152,0.34)');
      topGlow.addColorStop(0.44, 'rgba(255,214,116,0.11)');
      topGlow.addColorStop(1, 'rgba(255,214,116,0)');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, 768, 512);

      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 8; i++) {
          const x = -100 + i * 106 + rng() * 42;
          const width = 72 + rng() * 94;
          const drift = 95 + rng() * 170;
          const gradient = ctx.createLinearGradient(x, 0, x + drift, 512);
          gradient.addColorStop(0, `rgba(255,229,145,${0.16 + rng() * 0.09})`);
          gradient.addColorStop(0.55, `rgba(236,214,132,${0.035 + rng() * 0.04})`);
          gradient.addColorStop(1, 'rgba(236,214,132,0)');

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + width, 0);
          ctx.lineTo(x + width + drift, 512);
          ctx.lineTo(x + drift - width * 0.28, 512);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();
          ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';

      const fade = ctx.createLinearGradient(0, 0, 0, 512);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(0.70, 'rgba(0,0,0,0.10)');
      fade.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 768, 512);
      ctx.globalCompositeOperation = 'source-over';

      texture.update(false);
      return texture;
  }

  private createStageFloorMistTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 768, height: 384 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      const rng = this.makeRng(52193);
      ctx.clearRect(0, 0, 768, 384);

      const center = ctx.createRadialGradient(384, 188, 42, 384, 192, 335);
      center.addColorStop(0, 'rgba(196,206,128,0.20)');
      center.addColorStop(0.42, 'rgba(130,160,94,0.10)');
      center.addColorStop(1, 'rgba(60,90,52,0)');
      ctx.fillStyle = center;
      ctx.fillRect(0, 0, 768, 384);

      for (let i = 0; i < 24; i++) {
          const x = 40 + rng() * 688;
          const y = 70 + rng() * 230;
          const rx = 70 + rng() * 175;
          const ry = 12 + rng() * 34;
          const puff = ctx.createRadialGradient(x, y, 0, x, y, rx);
          puff.addColorStop(0, `rgba(150,180,106,${0.025 + rng() * 0.045})`);
          puff.addColorStop(1, 'rgba(150,180,106,0)');
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(1, ry / rx);
          ctx.fillStyle = puff;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
      }

      texture.update(false);
      return texture;
  }

  private createForegroundFoliageTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 512, height: 256 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 512, 256);

      const rng = this.makeRng(9137);
      const colors = ['rgba(4,26,10,0.92)', 'rgba(6,42,17,0.82)', 'rgba(12,54,23,0.72)'];
      for (let i = 0; i < 34; i++) {
          const x = -30 + rng() * 230;
          const y = 54 + rng() * 160;
          const rx = 34 + rng() * 62;
          const ry = 18 + rng() * 48;
          ctx.fillStyle = colors[i % colors.length];
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
      }

      for (let i = 0; i < 12; i++) {
          const x = 4 + rng() * 160;
          const h = 70 + rng() * 130;
          ctx.strokeStyle = 'rgba(6,28,12,0.82)';
          ctx.lineWidth = 8 + rng() * 10;
          ctx.beginPath();
          ctx.moveTo(x, 260);
          ctx.quadraticCurveTo(x + 18, 180, x + rng() * 54, 260 - h);
          ctx.stroke();
      }

      texture.update(false);
      return texture;
  }

  private createForegroundStageFrameTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 512, height: 192 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      const rng = this.makeRng(2811);
      ctx.clearRect(0, 0, 512, 192);

      const shadow = ctx.createRadialGradient(90, 172, 16, 90, 172, 190);
      shadow.addColorStop(0, 'rgba(2,18,7,0.62)');
      shadow.addColorStop(0.58, 'rgba(3,24,8,0.34)');
      shadow.addColorStop(1, 'rgba(3,24,8,0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, 290, 192);

      const leafColors = [
          'rgba(4,28,10,0.70)',
          'rgba(8,42,16,0.58)',
          'rgba(16,58,22,0.42)'
      ];
      for (let i = 0; i < 28; i++) {
          const x = -12 + rng() * 230;
          const y = 108 + rng() * 86;
          const rx = 24 + rng() * 54;
          const ry = 10 + rng() * 25;
          ctx.fillStyle = leafColors[i % leafColors.length];
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
      }

      for (let i = 0; i < 54; i++) {
          const x = -10 + rng() * 210;
          const h = 18 + rng() * 50;
          const sway = 8 + rng() * 22;
          ctx.strokeStyle = `rgba(${10 + rng() * 18},${42 + rng() * 38},${15 + rng() * 18},${0.24 + rng() * 0.22})`;
          ctx.lineWidth = 1.4 + rng() * 2.2;
          ctx.beginPath();
          ctx.moveTo(x, 192);
          ctx.quadraticCurveTo(x + sway * 0.45, 192 - h * 0.52, x + sway, 192 - h);
          ctx.stroke();
      }

      texture.update(false);
      return texture;
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

  private createHazeTexture(name: string): DynamicTexture {
      const texture = new DynamicTexture(name, { width: 512, height: 256 }, this._scene, false);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      const rng = this.makeRng(7403);
      ctx.clearRect(0, 0, 512, 256);

      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, 'rgba(80,120,92,0)');
      gradient.addColorStop(0.48, 'rgba(98,138,96,0.18)');
      gradient.addColorStop(1, 'rgba(40,72,42,0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 256);

      for (let i = 0; i < 14; i++) {
          const x = rng() * 512;
          const y = 64 + rng() * 130;
          const r = 44 + rng() * 95;
          const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
          puff.addColorStop(0, 'rgba(150,190,125,0.12)');
          puff.addColorStop(1, 'rgba(150,190,125,0)');
          ctx.fillStyle = puff;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
      }

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
