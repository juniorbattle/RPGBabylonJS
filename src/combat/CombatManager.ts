/**
 * CombatManager.ts
 * Orchestrates tactical combat flow using a State Machine.
 * Refactored to handle Weapon 1, Weapon 2, and Skills with clarified AP/Camera logic.
 */

import { Scene, Vector3, Color3, PointerEventTypes, Observer, PointerInfo, Material, StandardMaterial } from '@babylonjs/core';
import { CombatGrid, TileData } from './CombatGrid';
import { TurnManager }          from './TurnManager';
import { AOESystem, AOEResult } from './AOESystem';
import { CombatStageManager }   from './CombatStageManager';
import { NPCAI }                from './NPCAI';
import { Unit }                 from '../units/Unit';
import { StatType, WeaponData, UnitData } from '../data/types/UnitData';
import { ActData, TypeAction, EffectType }  from '../data/types/ActData';
import { TacticalCamera }       from '../camera/TacticalCamera';
import { CombatHUD }            from '../ui/CombatHUD';
import { CombatPreview }        from '../ui/CombatPreview';
import { TurnOrderUI }          from '../ui/TurnOrderUI';
import { ActionBarUI }          from '../ui/ActionBarUI';
import { SkillMenuUI }          from '../ui/SkillMenuUI';
import { ItemMenuUI }           from '../ui/ItemMenuUI';
import { DamagePopup, PopupType } from '../ui/DamagePopup';
import { ObjectiveUI }          from '../ui/ObjectiveUI';
import { DeploymentUI }         from '../ui/DeploymentUI';
import { ClanManager }          from '../data/ClanManager';
import { DataManager }          from '../data/DataManager';
import { ItemCategory, InventoryItem } from '../data/types/ItemData';
import { TickResult }           from '../units/TurnStatus';
import { GameManager }          from '../data/GameManager';

// ─── Combat states ────────────────────────────────────────────────────────────

export enum CombatState {
  IDLE                     = 'IDLE',
  DEPLOYMENT               = 'DEPLOYMENT',
  PLAYER_ACTION_MENU       = 'PLAYER_ACTION_MENU',
  PLAYER_SELECT_MOVE       = 'PLAYER_SELECT_MOVE',
  PLAYER_MOVING            = 'PLAYER_MOVING',
  PLAYER_SELECT_ATTACK     = 'PLAYER_SELECT_ATTACK',
  PLAYER_SELECT_SKILL      = 'PLAYER_SELECT_SKILL',
  PLAYER_SELECT_ITEM       = 'PLAYER_SELECT_ITEM',
  PLAYER_SELECT_SKILL_TARGET = 'PLAYER_SELECT_SKILL_TARGET',
  PLAYER_INSPECT           = 'PLAYER_INSPECT',
  PLAYER_ACTING            = 'PLAYER_ACTING',
  ENEMY_TURN               = 'ENEMY_TURN',
  BATTLE_END               = 'BATTLE_END',
}

export interface CombatResult {
  attackerName:   string;
  targetName:     string;
  actionName:     string;
  damageDone:     number;
  healDone:       number;
  effectsApplied: string[];
  isCritical:     boolean;
  targetDied:     boolean;
}

export interface CombatCallbacks {
  onStateChange?:  (state: CombatState) => void;
  onTurnStart?:    (unit: Unit, turnNum: number) => void;
  onActionResult?: (result: any) => void;
  onUnitDied?:     (unit: Unit) => void;
  onBattleEnd?:    (winner: 'TeamA' | 'TeamB' | 'draw', participants?: string[]) => void;
  onLog?:          (msg: string) => void;
}

export class CombatManager {

  readonly grid:        CombatGrid;
  readonly turnManager: TurnManager;
  readonly camera:      TacticalCamera;
  readonly aoeSystem:   AOESystem;
  readonly stageManager:CombatStageManager;

  private scene:      Scene;
  private units:      Unit[]       = [];
  private state:      CombatState  = CombatState.IDLE;
  private callbacks:  CombatCallbacks;
  private actionsMap: Map<string, ActData> = new Map();

  // UI panels
  private hud?:       CombatHUD;
  private preview?:   CombatPreview;
  private turnUI?:    TurnOrderUI;
  private actionBar?: ActionBarUI;
  private skillMenu?: SkillMenuUI;
  private itemMenu?:  ItemMenuUI;
  private damagePopup: DamagePopup;
  private objectiveUI?: ObjectiveUI;
  private deploymentUI?: DeploymentUI;
  private hoverObs:   Observer<PointerInfo> | null = null;
  private clickObs:   Observer<PointerInfo> | null = null;
  private moveTileHoverMat: StandardMaterial;
  private deploymentTileHoverMat: StandardMaterial;
  private hoveredTile: TileData | null = null;
  private hoveredTilePrevMaterial: Material | null = null;
  private tileHoverClearObs: Observer<PointerInfo> | null = null;

  // Deployment Phase
  private maxPlayerUnits: number = 4;
  private selectedUnitData: UnitData | null = null;
  private deploymentMap: Map<TileData, Unit> = new Map();

  private activeUnit: Unit | null = null;
  private npcAIs:     Map<string, NPCAI> = new Map();

  private canUndoMove: boolean = false;

  /** State saved at start of turn (or after an action) for Undo */
  private turnStartState: {
    tile: TileData;
    worldPos: Vector3;
    gridX: number;
    gridZ: number;
  } | null = null;

  constructor(scene: Scene, grid: CombatGrid, camera: TacticalCamera, callbacks: CombatCallbacks, allActions: ActData[]) {
    this.scene     = scene;
    this.grid      = grid;
    this.camera    = camera;
    this.callbacks = callbacks;
    this.aoeSystem    = new AOESystem(scene, grid);
    this.stageManager = new CombatStageManager(scene, camera);
    this.damagePopup  = new DamagePopup();
    this.moveTileHoverMat = new StandardMaterial('move_tile_hover_mat', this.scene);
    this.moveTileHoverMat.diffuseColor = new Color3(0.78, 0.92, 1.0);
    this.moveTileHoverMat.emissiveColor = new Color3(0.18, 0.38, 0.62);
    this.moveTileHoverMat.alpha = 1;

    this.deploymentTileHoverMat = new StandardMaterial('deployment_tile_hover_mat', this.scene);
    this.deploymentTileHoverMat.diffuseColor = new Color3(0.78, 0.92, 1.0);
    this.deploymentTileHoverMat.emissiveColor = new Color3(0.18, 0.38, 0.62);
    this.deploymentTileHoverMat.alpha = 1;

    for (const a of allActions) this.actionsMap.set(a.id, a);

    this.turnManager = new TurnManager();
    this.turnManager.onTurnStart = (unit, num, ticks) => {
        // SECURITY: Final check that unit data is fully mapped before turn begins
        const s = unit.status;
        const dm = DataManager.getInstance();
        if (s.unit.weaponIds && (!s.unit.weapons || s.unit.weapons.length === 0)) {
            s.unit.weapons = s.unit.weaponIds.map(id => dm.getWeaponData(id)).filter(w => !!w);
        }
        this.beginUnitTurn(unit, num, ticks);
    };
    this.turnManager.onBattleEnd = (winner) => {
      this.setState(CombatState.BATTLE_END);
      const participants = this.units
        .filter(u => u.team === 'TeamA')
        .map(u => u.id);
      this.callbacks.onBattleEnd?.(winner, participants);
    };
  }

  // ─── UI Wiring ────────────────────────────────────────────────────────────

  attachUI(hud: CombatHUD, turnUI: TurnOrderUI, actionBar: ActionBarUI, skillMenu: SkillMenuUI, itemMenu: ItemMenuUI, objectives?: ObjectiveUI): void {
    this.hud       = hud;
    this.preview   = new CombatPreview();
    
    this.deploymentUI = new DeploymentUI({
      onUnitSelect: (unit) => { 
        this.selectedUnitData = unit; 
        if (!unit) return;

        this.hud?.showUnitData(unit);
        this.hud?.show();
        // Force attributes open to see stats during placement
        if (this.hud) {
          this.hud.toggleStats();
          if (!(this.hud as any).showingStats) this.hud.toggleStats(); // Ensure it stays open
        }
      },
      onStartCombat: () => { this.finalizeDeployment(); }
    });
    this.deploymentUI.hide();

    this.turnUI    = turnUI;
    this.skillMenu = skillMenu;
    this.itemMenu  = itemMenu;
    this.objectiveUI = objectives;
    this.actionBar = new ActionBarUI({
      onMove:     () => this.prepareMove(),
      onUndoMove: () => this.executeUndoMove(),
      onWeapon:   (idx, w) => this.prepareAttack(idx, w),
      onSkills:   () => this.prepareSkills(),
      onItems:    () => this.prepareItems(),
      onInfo:     () => this.prepareInfoInspect(),
      onWait:     () => this.endTurn(),
    });

    // 🛡️ THE CRITICAL UI BRIDGE FIX
    if (this.skillMenu) this.skillMenu.bindActionBar(this.actionBar);
    if (this.itemMenu)  this.itemMenu.bindActionBar(this.actionBar);

    actionBar?.dispose(); 
  }

  get actionBarInstance() { return this.actionBar; }

  public addSkillToActionMap(skill: ActData): void {
      this.actionsMap.set(skill.id, skill);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  addUnit(data: any, x: number, z: number): void {
    // SECURITY: Ensure combat unit starts with full template data
    const runtimeData = this.hydrateRuntimeUnitData(data);
    const unit = new Unit(this.scene, runtimeData);
    const tile = this.grid.getTile(x, z);
    const pos  = this.grid.getTileTopPosition(x, z);
    if (tile && pos) {
      unit.placeOnTile(tile, pos);
      this.units.push(unit);
      if (data.team === 'TeamB') this.npcAIs.set(unit.id, new NPCAI(data.characterClass));
    }
  }

  startBattle(): void {
    this.setState(CombatState.DEPLOYMENT);
    this.deploymentUI?.show();
    this.camera.setOverviewMode();
    this.grid.clearHighlights();

    // 1. Tile Clicks
    this.grid.onTileClick = (tile) => this.onDeploymentInteraction(tile);
    this.grid.onTileHover = (tile) => {
      if (tile.isDeploymentTile) {
        this.showTileHover(tile, 'deployment');
      } else {
        this.clearTileHover();
      }
    };
    this.enableTileHoverClearObserver((tile) => !!tile.isDeploymentTile);

    // 2. Unit Clicks (Mapper)
    this.clickObs = this.scene.onPointerObservable.add((info) => {
      if (this.state !== CombatState.DEPLOYMENT) return;
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      if ((info.event as MouseEvent).button !== 0) return; // Left click only

      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      if (!pick?.hit || !pick.pickedMesh) return;

      // Detect if we hit a unit
      let curr: any = pick.pickedMesh;
      while (curr) {
        if (curr.metadata?.unitId) {
          const unit = this.units.find(u => u.id === curr.metadata.unitId);
          if (unit) {
            const tile = this.grid.getTile(unit.status.gridX, unit.status.gridZ);
            if (tile) this.onDeploymentInteraction(tile);
            return;
          }
        }
        curr = curr.parent;
      }
    });
  }

  private onDeploymentInteraction(tile: TileData): void {
    if (this.state !== CombatState.DEPLOYMENT) return;
    if (!tile.isDeploymentTile) return;

    const existingUnit = this.deploymentMap.get(tile);

    if (this.selectedUnitData) {
      const selected = this.selectedUnitData;
      const previousTile = this.findDeploymentTileByUnitId(selected.id);

      if (existingUnit?.id === selected.id) {
        this.undeployUnit(tile);
        this.selectedUnitData = null;
        this.deploymentUI?.clearSelection();
        return;
      }

      if (existingUnit) this.undeployUnit(tile);

      if (previousTile && previousTile !== tile) {
        this.undeployUnit(previousTile);
      }

      this.deployUnit(selected, tile);
    } else if (existingUnit) {
      this.undeployUnit(tile);
    }
  }

  private deployUnit(data: UnitData, tile: TileData): void {
    const previousTile = this.findDeploymentTileByUnitId(data.id);
    if (previousTile && previousTile !== tile) {
      this.undeployUnit(previousTile);
    }

    // Already unit here?
    if (this.deploymentMap.has(tile)) return;
    
    // Max units reached?
    if (this.deploymentMap.size >= this.maxPlayerUnits) return;
    
    // Create the unit instance with full weapon mapping
    const runtimeData = this.hydrateRuntimeUnitData(data);
    const unit = new Unit(this.scene, runtimeData);
    const pos = this.grid.getTileTopPosition(tile.x, tile.z)!;
    unit.placeOnTile(tile, pos);
    
    this.units.push(unit);
    this.deploymentMap.set(tile, unit);
    this.selectedUnitData = null; // Clear selection
    this.deploymentUI?.clearSelection();
    
    this.updateDeploymentStatus();
  }

  private undeployUnit(tile: TileData): void {
    const unit = this.deploymentMap.get(tile);
    if (!unit) return;

    unit.dispose();
    this.units = this.units.filter(u => u !== unit);
    this.deploymentMap.delete(tile);
    
    this.updateDeploymentStatus();
  }

  private findDeploymentTileByUnitId(unitId: string): TileData | null {
    for (const [tile, unit] of this.deploymentMap) {
      if (unit.id === unitId) return tile;
    }
    return null;
  }

  private updateDeploymentStatus(): void {
    const deployedIds = new Set(Array.from(this.deploymentMap.values()).map(u => u.id));
    this.deploymentUI?.updateStatus(this.deploymentMap.size, this.maxPlayerUnits, deployedIds);
  }

  private hydrateRuntimeUnitData(data: UnitData): UnitData {
    if (data.visualProfile) return data;

    const dataManager = DataManager.getInstance();
    const template = data.team === 'TeamA'
      ? dataManager.getUnitTemplate(data.id)
      : dataManager.getEnemy(data.id);
    const visualProfile = template?.visualProfile;

    if (visualProfile) {
      data.visualProfile = JSON.parse(JSON.stringify(visualProfile));
    }

    return data;
  }

  public finalizeDeployment(): void {
    if (this.deploymentMap.size === 0) return;

    this.deploymentUI?.hide();
    this.grid.onTileClick = undefined;
    this.grid.onTileHover = undefined;
    this.grid.resetDeploymentTiles(); // Remove deployment highlights and mode
    this.disableTileHoverClearObserver();
    this.clearTileHover();
    
    if (this.clickObs) {
      this.scene.onPointerObservable.remove(this.clickObs);
      this.clickObs = null;
    }

    // Transition to turn-based combat
    this.turnManager.setup(this.units);
    
    // 🛡️ SYNC INITIAL TURN UI
    this.turnUI?.show();
    this.refreshTurnOrderUI();

    this.turnManager.startBattle();
  }

  // ─── Turn Lifecycle ───────────────────────────────────────────────────────

  private async beginUnitTurn(unit: Unit, turnNum: number, ticks?: TickResult[]): Promise<void> {
    this.canUndoMove = true;

    // Unit inspection on hover (Only during main menu)
    this.enableInspectionHover();

    // SECURITY: If unit is dead, skip immediately
    if (unit.isDead) {
        console.warn(`⚠️ Skipped turn for dead unit: ${unit.name}`);
        this.endTurn();
        return;
    }

    // Hide icons from all units for fresh start
    for (const u of this.units) u.hideActionIcon();
    
    this.activeUnit = unit;
    // AP is already incremented by TurnManager calling unit.status.onTurnStart()
    unit.setActive(true);

    // 🛡️ SYNC TURN UI (Mise en avant)
    this.turnUI?.setActive(this.turnManager.getActiveIndex());

    // Force close attributes panel at each new turn
    this.hud?.forceCloseStats();
    
    // Show 'Caster' icon on active unit
    unit.showActionIcon('caster', Color3.Yellow());
    
    // SECURITY: Ensure combat unit skills are mapped beforeturn begins (Double Check)
    const s = unit.status;
    const dm = DataManager.getInstance();
    if (s.unit.weaponIds && (!s.unit.weapons || s.unit.weapons.length === 0)) {
        s.unit.weapons = s.unit.weaponIds.map(id => dm.getWeaponData(id)).filter(w => !!w);
    }

    // Save starting position for Undo logic
    const tile = this.grid.getTile(unit.status.gridX, unit.status.gridZ);
    if (tile) {
      this.turnStartState = {
        tile,
        gridX: unit.status.gridX,
        gridZ: unit.status.gridZ,
        worldPos: unit.worldPosition.clone()
      };
    }

    // Enable follow for the new unit turn
    this.camera.enableFollow();
    this.camera.setFollowTarget(unit.worldPosition);
    this.hud?.showUnit(unit);
    this.hud?.show();

    if (unit.team === 'TeamA') {
      // Transition to Normal view for the player turn
      await this.camera.setNormalMode();
      this.setState(CombatState.PLAYER_ACTION_MENU);
      this.refreshActionBar();
    } else {
      this.setState(CombatState.ENEMY_TURN);
      this.runEnemyAI(unit);
    }

    // Process DoT/Heal ticks
    if (ticks && ticks.length > 0) {
        for (const tick of ticks) {
            const worldPos = unit.worldPosition.add(new Vector3(0, 1.8, 0));
            const type = tick.type === 'damage' ? PopupType.Status : PopupType.Heal;
            this.damagePopup.show(worldPos, tick.value.toString(), type, this.scene);
            
            if (tick.type === 'damage') unit.flashRed(0.4);
            else unit.flashColor(new Color3(0.2, 1, 0.4), 0.4);

            if (unit.status.isDead) {
                await this.handleDeath(unit);
                return; // End turn early
            }
        }
    }

    this.callbacks.onTurnStart?.(unit, turnNum);
  }

  private endTurn(): void {
    this.activeUnit?.setActive(false);
    this.activeUnit?.hideActionIcon();
    this.grid.clearHighlights();
    this.actionBar?.hide();
    this.skillMenu?.hide();
    
    // Total Freeze: Clear follow target to stop camera updates between turns
    this.camera.setFollowTarget(null);
    this.camera.disableFollow();

    // Close unit details on turn end
    this.hud?.forceCloseStats();

    this.turnManager.nextTurn();
  }

  // ─── Player Actions ───────────────────────────────────────────────────────

  private prepareMove(): void {
    if (!this.activeUnit || !this.activeUnit.status.canMove()) return;
    
    // Disable hover inspection during move selection
    this.disableInspectionHover();

    this.setState(CombatState.PLAYER_SELECT_MOVE);
    this.switchView('Overview');
    
    const occupied = new Set(this.units.filter(u => !u.isDead && u !== this.activeUnit).map(u => `${u.status.gridX},${u.status.gridZ}`));
    
    // LIMITATION: Use unit-specific moveRange and jumpHeight
    const range = this.activeUnit.status.unit.baseStats.moveRange || 4;
    const jump = this.activeUnit.status.unit.baseStats.jumpHeight || 1;
    
    const tiles = this.grid.getReachableTiles(
      this.activeUnit.status.gridX, 
      this.activeUnit.status.gridZ, 
      range, 
      jump, 
      occupied
    );
    
    this.grid.showReachable(tiles);
    this.grid.onTileHover = (tile) => {
      if (tiles.includes(tile)) {
        this.showTileHover(tile, 'move');
      } else {
        this.clearTileHover();
      }
    };
    this.enableTileHoverClearObserver((tile) => tiles.includes(tile));
    
    // Enable click handlers
    this.grid.onTileClick = (tile) => {
      if (tiles.includes(tile)) this.executeMove(tile);
      else this.cancelAction();
    };

    // New: Right-click to cancel movement selection
    this.grid.enableRightClick();
    this.grid.onTileRightClick = () => {
      this.cancelAction();
    };
  }

  private async executeMove(tile: TileData): Promise<void> {
    if (!this.activeUnit) return;
    this.setState(CombatState.PLAYER_MOVING);
    this.grid.clearHighlights();
    this.grid.onTileClick = undefined;
    this.grid.onTileHover = undefined;
    this.grid.onTileRightClick = undefined;
    this.grid.disableRightClick();
    this.disableTileHoverClearObserver();
    this.clearTileHover();

    const pos = this.grid.getTileTopPosition(tile.x, tile.z);
    if (pos) {
      await this.activeUnit.moveTo(new Vector3(pos.x, pos.y + 0.6, pos.z));
    this.activeUnit.placeOnTile(tile, pos);
    this.activeUnit.status.hasMoved = true;
    
    // Update follow target after move to ensure camera tracks new position
      this.camera.setFollowTarget(this.activeUnit.worldPosition);
    }
    this.cancelAction(); // Back to menu
  }

  private prepareAttack(weaponIndex: number, weapon: WeaponData): void {
    if (!this.activeUnit || !this.activeUnit.status.canAct()) return;
    this.setState(CombatState.PLAYER_SELECT_ATTACK);
    
    // Weapon attack IS an AOE action (radius 0.4 for collision comfort)
    const act: ActData = {
      id: "atk", 
      nameAct: weapon.weaponName, 
      description: "", 
      typeAction: TypeAction.DAMAGE,
      point: 0, 
      range: weapon.range, 
      minRange: weapon.minRange ?? 0,
      power: weapon.damage, 
      successRate: 95, // Default weapon accuracy
      damageType: 'physical',
      aoe: { isAOE: true, radius: 0.4, shape: 'circle' }, 
      effects: []
    };
    this.startTargeting(act);
  }

  private prepareSkills(): void {
    if (!this.activeUnit) return;

    if (!this.activeUnit.status.canUseSkills()) {
        const popupPos = this.activeUnit.worldPosition.add(new Vector3(0, 1.2, 0));
        this.damagePopup.show(popupPos, 'MUTE', PopupType.Status, this.scene);
        return;
    }

    this.setState(CombatState.PLAYER_SELECT_SKILL);
    const skills = this.activeUnit.status.unit.skillIds.map(id => this.actionsMap.get(id)).filter(s => !!s) as ActData[];
    this.skillMenu?.showSkills(skills, this.activeUnit.status.currentActPoint, (s) => {
      this.setState(CombatState.PLAYER_SELECT_SKILL_TARGET);
      this.startTargeting(s);
    }, () => this.cancelAction());
  }

  private prepareInfoInspect(): void {
    if (!this.activeUnit) return;
    
    // Switch to Information state
    this.setState(CombatState.PLAYER_INSPECT);
    
    // Hide UI
    this.actionBar?.hide();
    this.turnUI?.hide();
    this.objectiveUI?.hide();

    // Enable detailed Overview analysis
    this.switchView('Overview');
    this.hud?.toggleStats();
    if (this.hud && !(this.hud as any).showingStats) this.hud.toggleStats(); // Force open
    
    // Create a dummy "Inspect" action with infinite range to leverage AOESystem's cursor
    const inspectAction: ActData = {
      id: "inspect_dummy",
      nameAct: "Inspect",
      description: "Scanner",
      typeAction: TypeAction.BUFF, // Neutre
      power: 0,
      successRate: 100,
      range: 99,       // Allow cursor anywhere on the map
      minRange: 0,
      point: 0,
      damageType: 'physical',
      aoe: { isAOE: true, radius: 0.1, shape: 'circle' }, // Smallest possible cursor (1 tile)
      effects: []
    };

    // Use AOESystem just for its precise pathfinding, grid highlight, and right-click cancel!
    this.aoeSystem.activate(inspectAction, this.activeUnit, this.units, {
      onConfirm: (res) => {
        // Clic gauche en mode inspect: on choisit de ne rien faire, ou on refresh juste la vue
        // On ne ferme pas le mode, on le maintient.
        if (res.targets.length > 0) {
            this.hud?.showUnit(res.targets[0]);
        }
      },
      onCancel: () => this.cancelAction()
    }, undefined); // En passant undefined pour le preview, on supprime la fenêtre UI du haut (Lanceur -> Inspect -> Cible)
    
    // Note: We don't want the visual AOE system to actually show "targets" as red damage highlights.
    // However, the base Hover system (enableInspectionHover) will continue to pick up 
    // the floor tile correctly even with AOESystem active.
  }

  private prepareItems(): void {
    if (!this.activeUnit) return;
    this.setState(CombatState.PLAYER_SELECT_ITEM);
    
    const clan = ClanManager.getInstance();
    const consumables = clan.getInventoryByType(ItemCategory.Consumable);

    this.itemMenu?.showItems(consumables, (invItem) => {
      this.executeItemTargeting(invItem);
    }, () => this.cancelAction());
  }

  private executeItemTargeting(invItem: InventoryItem): void {
    const item = invItem.itemData;
    // Map item properties to ActData for universal AOESystem support
    const itemAction: ActData = {
      id: item.id,
      nameAct: item.itemName,
      description: item.description,
      typeAction: item.typeAction || TypeAction.HEAL,
      power: item.power || 0,
      successRate: item.successRate || 100,
      range: 1, // Combat requirement: Items have range 1
      point: 0, // Items cost 0 AP but consume "Act"
      damageType: 'magical',
      aoe: { isAOE: true, radius: 0.4, shape: 'circle' },
      effects: item.effects || []
    };

    // Store custom payload for execution phase
    (itemAction as any)._inventoryItem = invItem;
    
    this.setState(CombatState.PLAYER_SELECT_SKILL_TARGET);
    this.startTargeting(itemAction);
  }

  private startTargeting(action: ActData): void {
    // Disable hover inspection during targeting
    this.disableInspectionHover();

    this.switchView('Overview');
    this.actionBar?.hide();
    
    this.aoeSystem.activate(action, this.activeUnit!, this.units, {
      onConfirm: (res) => this.executeAction(action, res, true), // Joueur termine ou retourne au menu via executeAction
      onCancel: () => this.cancelAction()
    }, this.preview);
  }

  private rollHitCheck(attacker: Unit, defender: Unit, action: ActData): boolean {
      // Port of provided C# formula:
      // finalAccuracy = baseAccuracy + (attackerDex / 2) - (defenderDex / 3);
      
      let finalAccuracy = action.successRate;
      const attackerDex = attacker.status.getModifiedStat(StatType.Dexterity);
      const defenderDex = defender.status.getModifiedStat(StatType.Dexterity);
      
      finalAccuracy += Math.floor(attackerDex / 2) - Math.floor(defenderDex / 3);

      // Blind penalty
      if (attacker.status.hasEffect(EffectType.BLIND)) {
          finalAccuracy -= 30;
      }

      finalAccuracy = Math.max(5, Math.min(95, finalAccuracy));
      
      const roll = Math.floor(Math.random() * 100);
      const hit = roll < finalAccuracy;
      
      const blindTxt = attacker.status.hasEffect(EffectType.BLIND) ? " [BLIND]" : "";
      console.log(`🎯 accuracy: ${finalAccuracy}%${blindTxt} (DEX ${attackerDex} vs ${defenderDex}) | Roll: ${roll} | ${hit ? 'HIT' : 'MISS'}`);
      return hit;
  }

  private async executeAction(action: ActData, result: AOEResult, autoEndTurnForNPC: boolean = true): Promise<void> {
    const unit = this.activeUnit;
    if (!unit) return;

    // 1. Instantly hide AND block targeting visuals (AOE circle, ranges, etc.)
    this.aoeSystem.visualsDisabled = true;
    this.aoeSystem.deactivate();
    
    // Hide UI entirely for pure Stage/Cinematic focus
    this.hud?.hide(); 

    this.setState(CombatState.PLAYER_ACTING);
    unit.status.isAnimating = true;
    // Focus is owned by CombatStageManager for actions so camera save/restore stays consistent.

    // 2. Pay AP
    unit.status.spendAP(action.point);
    this.hud?.refreshAP(unit.status.currentActPoint);

    // 3. Cinematic / Visual sequence (Systematic for all actions)
    await this.stageManager.playAOESequence(
      unit, 
      result.targets, 
      this.units,
      action,
      { 
        hud: this.hud, 
        turnOrder: this.turnUI, 
        actionBar: this.actionBar, 
        objectives: this.objectiveUI
      },
      async () => {
        // Show effects/damage popups via AOESystem feedback during the sequence
        await this.aoeSystem.showAIFeedback(action, result.centerTile, unit);

        for (const target of result.targets) {
          // Rehaussé à 2.3 pour que le texte apparaisse physiquement "au dessus" du token (haut de crâne / icône)
          const popupPos = target.worldPosition.add(new Vector3(0, 1.8, 0));
          let primaryActionShown = false;

          switch (action.typeAction) {
            case TypeAction.DAMAGE:
            case TypeAction.EFFECT: // Offensive effects also check accuracy
              const hit = this.rollHitCheck(unit, target, action);
              if (!hit) {
                  this.damagePopup.show(popupPos, 'MISS', PopupType.Damage, this.scene);
                  continue; // Skip this target
              }

              if (action.typeAction === TypeAction.DAMAGE) {
                const isCrit = this.checkCritical(unit, target);
                let dmg = this.calculateDamage(unit, target, action);
                if (isCrit) dmg = Math.round(dmg * 1.5);

                target.status.takeDamage(dmg);
                
                const pType = isCrit ? PopupType.Crit : PopupType.Damage;
                this.damagePopup.show(popupPos, dmg.toString(), pType, this.scene);
                primaryActionShown = true;
                
                if (isCrit) {
                    this.camera.shakeCamera(0.4, 0.25);
                    target.flashColor(new Color3(1, 1, 1), 0.5);
                    
                    // Stunned on Critical
                    await this.delay(300);
                    target.status.applyEffect({
                        effectType: EffectType.STUNNED,
                        turnsRemaining: 1,
                        value: 0.25
                    });
                    this.damagePopup.show(popupPos.add(new Vector3(0, 0.4, 0)), 'STUNNED', PopupType.Status, this.scene);
                } else {
                    target.flashRed(0.4);
                }
              }
              break;

            case TypeAction.HEAL:
              const heal = this.calculateHeal(unit, target, action);
              target.status.heal(heal);
              this.damagePopup.show(popupPos, heal.toString(), PopupType.Heal, this.scene);
              target.flashColor(new Color3(0.2, 1, 0.4), 0.4);
              primaryActionShown = true;
              break;
            case TypeAction.BUFF:
            case TypeAction.EFFECT:
              // Buff/Effect don't directly change HP value here (handled by applyEffects below)
              break;
          }

    // Apply associated effects from ActData if any
    this.applyActionEffects(unit, target, action, primaryActionShown ? 1000 : 0);

    // CRITICAL: Refresh HUD status after effect application
    if (target === this.activeUnit || (this.hud as any)?._lastUnit === target) {
        this.hud?.showUnit(target); 
    }

    if (target.status.isDead) await this.handleDeath(target);
  }

        // ── Immediate Battle End Check ──
        // Check if battle ended after action resolution (during animation sequence)
        this.checkImmediateBattleEnd();
      }
    );

    unit.status.hasActed = true;
    unit.status.isAnimating = false;
    
    // If we moved THEN acted -> finalize move. 
    // If we acted WITHOUT moving -> we can still move and potentially undo that future move.
    if (unit.status.hasMoved) {
      this.canUndoMove = false;
    }

    const tile = this.grid.getTile(unit.status.gridX, unit.status.gridZ);
    if (tile) {
      this.turnStartState = {
        tile,
        gridX: unit.status.gridX,
        gridZ: unit.status.gridZ,
        worldPos: unit.worldPosition.clone()
      };
    }

    // Handle inventory consumption if it was an item
    if ((action as any)._inventoryItem) {
      const invItem = (action as any)._inventoryItem as InventoryItem;
      ClanManager.getInstance().removeItem(invItem.itemData.id, ItemCategory.Consumable, 1);
      console.log(`📦 Item used and consumed: ${invItem.itemData.itemName}`);
    }

    // Restore UI visibility if we are continuing the turn (and not ending it)
    // Only bring back HUD if it's the active unit and we don't auto-end immediately
    if (unit.team === 'TeamA') {
      this.hud?.show();
      this.cancelAction();
    } else {
      if (autoEndTurnForNPC) {
        this.endTurn();
      } else {
        // If it's Phase 1 of AI (Hit & Run), we can briefly re-show the HUD to track its move
        this.hud?.show();
      }
    }
    
    // Unlock visuals for next targeting phase
    this.aoeSystem.visualsDisabled = false;
  }

  private executeUndoMove(): void {
    if (!this.activeUnit || !this.turnStartState || !this.canUndoMove) return;

    const { tile, gridX, gridZ } = this.turnStartState;
    
    // Au lieu d'essayer de soustraire un offset approximatif (0.6) depuis l'ancienne worldPos,
    // on recalcule la hauteur parfaite PURE de la tuile d'origine depuis le système de Grid.
    const trueSurfacePos = this.grid.getTileTopPosition(gridX, gridZ);
    
    if (trueSurfacePos) {
        this.activeUnit.placeOnTile(tile, trueSurfacePos);
        this.activeUnit.status.hasMoved = false;
        
        // On remet la caméra sur la nouvelle worldPosition (qui inclut déjà le Y + 0.6 d'offset de l'unité grâce à placeOnTile)
        this.camera.setFollowTarget(this.activeUnit.worldPosition);
        this.log(`${this.activeUnit.name} Undo move`);
    }

    this.cancelAction();
  }

  private cancelAction(): void {
    this.grid.clearHighlights();
    this.grid.onTileClick = undefined;
    this.grid.onTileHover = undefined;
    this.grid.onTileRightClick = undefined;
    this.grid.disableRightClick();
    this.disableTileHoverClearObserver();
    this.clearTileHover();
    
    this.aoeSystem.deactivate();
    this.switchView('Normal');
    
    // Force close stats box when exiting anything manually (like inspection)
    this.hud?.forceCloseStats();
    // Return to the active unit in HUD when cancelling whatever we hovered
    if (this.activeUnit) this.hud?.showUnit(this.activeUnit);

    if (this.activeUnit?.team === 'TeamA') {
      // Re-show caster icon when returning to action menu
      this.activeUnit.showActionIcon('caster', Color3.Yellow());
      
      // Re-enable inspection hover when returning to menu
      this.enableInspectionHover();

      // Ensure hidden UI panels come back if they were hidden (e.g. by Info/Inspect mode)
      this.turnUI?.show();
      this.objectiveUI?.show();

      this.setState(CombatState.PLAYER_ACTION_MENU);
      this.refreshActionBar();
    }
  }

  // ─── AI ───────────────────────────────────────────────────────────────────

  private async runEnemyAI(npc: Unit): Promise<void> {
    const ai = this.npcAIs.get(npc.id);
    if (!ai) return this.endTurn();

    await this.delay(600);
    
    this.camera.enableFollow();
    this.camera.setFollowTarget(npc.worldPosition);
    // Remove early "Normal" transition so executeAction's "Focus" isn't overridden

    // Filter alive units for AI decision making
    const enemies = this.units.filter(u => u.team === 'TeamA' && !u.isDead);
    const allies  = this.units.filter(u => u.team === 'TeamB' && u !== npc && !u.isDead);
    const allLiving = this.units.filter(u => !u.isDead);

    // AI Hit & Run Logic: Evaluate if we have a valid attack RIGHT NOW, before moving.
    const canAttackFirst = ai.hasImmediateAction(npc, enemies, allies, this.grid, this.aoeSystem, this.actionsMap, allLiving);
    let attackedAlready = false;

    // --- PHASE 1: PRE-MOVE ACTION ---
    if (canAttackFirst) {
        const decision = ai.decideAction(npc, enemies, allies, this.grid, this.aoeSystem, this.actionsMap, allLiving);
        if (decision.type === 'action' && decision.action && decision.aoeResult) {
            // Laisse le CombatStage gérer la camera
            
            // On attaque mais on INTERDIT à executeAction de passer le tour !
            await this.executeAction(decision.action, decision.aoeResult, false); 
            attackedAlready = true;
            await this.delay(400);

            // Re-anchor camera after attack sequence
            if (!npc.isDead) { // Check if NPC died from recoil or something
                this.camera.enableFollow();
                this.camera.setFollowTarget(npc.worldPosition);
            }
        }
    }

    if (npc.isDead) return; // Exit if died during phase 1

    // Return to normal view for movement phase if we came from an attack Focus view
    this.switchView('Normal');

    // --- PHASE 2: MOVEMENT ---
    // Recalculate occupied since things might have died
    const occupied = new Set(this.units.filter(u => !u.isDead && u !== npc).map(u => `${u.status.gridX},${u.status.gridZ}`));
    const reachable = this.grid.getReachableTiles(npc.status.gridX, npc.status.gridZ, npc.status.unit.moveRange, npc.status.unit.jumpHeight, occupied);
    
    // Pass refreshed enemies array just in case
    const currentEnemies = this.units.filter(u => u.team === 'TeamA' && !u.isDead);
    const currentAllies  = this.units.filter(u => u.team === 'TeamB' && u !== npc && !u.isDead);
    
    const moveTile = ai.getBestMoveTile(npc, reachable, currentEnemies, currentAllies);
    
    if (moveTile) {
      const pos = this.grid.getTileTopPosition(moveTile.x, moveTile.z);
      if (pos) {
        // Active tracking during move
        await npc.moveTo(new Vector3(pos.x, pos.y + 0.6, pos.z));
        npc.placeOnTile(moveTile, pos);
        this.camera.setFollowTarget(npc.worldPosition); // Anchor to new pos
      }
    }

    await this.delay(400);

    // --- PHASE 3: POST-MOVE ACTION (If not already attacked) ---
    if (!attackedAlready) {
        // La caméra doit rester encrée sur l'unité pour éviter le saut (CombatStage fera le focus proprement)
        const postMoveEnemies = this.units.filter(u => u.team === 'TeamA' && !u.isDead);
        const postMoveAllies  = this.units.filter(u => u.team === 'TeamB' && u !== npc && !u.isDead);
        const postMoveLiving  = this.units.filter(u => !u.isDead);

        const decision = ai.decideAction(npc, postMoveEnemies, postMoveAllies, this.grid, this.aoeSystem, this.actionsMap, postMoveLiving);
        
        if (decision.type === 'action' && decision.action && decision.aoeResult) {
            // Ici c'est la fin du mouvement final de l'IA, donc on LUI LAISSE terminer son tour
            await this.executeAction(decision.action, decision.aoeResult, true);
        } else {
            this.endTurn();
        }
    } else {
        // Already acted in Phase 1 AND finished Phase 2 move, just end turn 
        this.endTurn();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private setState(s: CombatState): void {
    this.state = s;
    this.callbacks.onStateChange?.(s);
  }

  private switchView(mode: 'Normal' | 'Overview' | 'Focus'): void {
    if (mode === 'Normal') this.camera.setNormalMode();
    else if (mode === 'Overview') this.camera.setOverviewMode();
    else if (mode === 'Focus') this.camera.setFocusMode();
  }

  private refreshActionBar(): void {
    if (!this.activeUnit || !this.actionBar) return;
    const s = this.activeUnit.status;
    this.actionBar.rebuild(s.unit.weapons, s.canMove(), s.canAct(), s.hasActed, s.hasMoved, this.canUndoMove);
    this.actionBar.show();
  }

  private async handleDeath(unit: Unit): Promise<void> {
    // 1. Mark in UI
    const idx = this.turnManager.getUnitIndex(unit);
    if (idx >= 0) this.turnUI?.markDead(idx);
    
    // 2. Clear from turn queue logic immediately before animation finishes
    // so the NEXT turn knows the unit is gone
    this.refreshTurnOrderUI();

    // 3. Visual disappearance
    await unit.playDeathAnimation();
    
    // 4. Final cleanup
    this.callbacks.onUnitDied?.(unit);
    this.refreshTurnOrderUI(); // Final sync

    // ── Immediate Battle End Check ──
    // Check if battle ended exactly when this unit died
    this.checkImmediateBattleEnd();
  }

  private checkImmediateBattleEnd(): void {
    if (this.state === CombatState.BATTLE_END) return;

    const winner = this.turnManager.checkBattleEnd();
    if (winner) {
      console.log(`🚩 Immediate Battle End detected! Winner: ${winner}`);
      this.setState(CombatState.BATTLE_END);
      const participants = this.units
        .filter(u => u.team === 'TeamA')
        .map(u => u.id);
      this.callbacks.onBattleEnd?.(winner, participants);
    }
  }

  private refreshTurnOrderUI(): void {
    this.turnUI?.setQueue(this.turnManager.getQueue(), this.turnManager.getActiveIndex());
  }

  // ─── Math & Resolution (Ported from TacticsAct.cs) ──────────────────────────

  private checkCritical(attacker: Unit, target: Unit): boolean {
      const dex = attacker.status.getModifiedStat(StatType.Dexterity);
      const targetDex = target.status.getModifiedStat(StatType.Dexterity);
      const baseCrit = 5; // 5%
      const bonus = Math.max(0, (dex - targetDex) / 2);
      return Math.random() * 100 < (baseCrit + bonus);
  }

  private calculateDamage(attacker: Unit, target: Unit, action: ActData): number {
    const K = 15;
    // Use MAGIC or STRENGTH depending on action type (Assume physical by default for weapons)
    const isMagic = action.id !== 'atk' && (action.damageType === 'magical');
    
    const attackStat = isMagic 
        ? attacker.status.getModifiedStat(StatType.Magic)
        : attacker.status.getModifiedStat(StatType.Strength);

    // DEF_P = END + (FOR/2) | DEF_M = END + (MAG/2)
    const endurance = target.status.getModifiedStat(StatType.Endurance);
    const defense = isMagic
        ? endurance + Math.floor(target.status.getModifiedStat(StatType.Magic) / 4)
        : endurance + Math.floor(target.status.getModifiedStat(StatType.Strength) / 4);

    // Formula: √(Power × 15 × AttackStat / Defense) × 2
    const power = action.power;
    const defenseVal = Math.max(1, defense);
    const raw = Math.sqrt(power * K * attackStat / defenseVal) * 2;
    
    return Math.max(1, Math.round(raw));
  }

  private calculateHeal(attacker: Unit, _target: Unit, action: ActData): number {
    const magic = attacker.status.getModifiedStat(StatType.Magic);
    // Unity Formula: amount + (Magic/2)
    return action.power + Math.floor(magic / 4);
  }

  private applyActionEffects(attacker: Unit, target: Unit, action: ActData, delay: number = 0): void {
    if (!action.effects || action.effects.length === 0) return;

    for (const effectData of action.effects) {
      // Resistance check via Charisma
      // targetCharisma / 4 resistance. Max success capped in logic.
      const targetCha = target.status.getModifiedStat(StatType.Charisma);
      const resistance = Math.floor(targetCha / 4);
      const baseSuccess = 85; // High base success chance for effects
      
      const roll = Math.random() * 100;
      const popupPos = target.worldPosition.add(new Vector3(0, 1.8, 0));

      if (roll < (baseSuccess - resistance)) {
        target.status.applyEffect({
          effectType: effectData.effectType,
          turnsRemaining: effectData.duration, 
          value: effectData.value, 
          sourceUnitId: attacker.id
        });
        
        setTimeout(() => {
            this.damagePopup.show(popupPos, effectData.effectType, PopupType.Status, this.scene);
        }, delay);

        console.log(`✨ Effect applied: ${effectData.effectType} on ${target.name} (Roll: ${roll.toFixed(1)} < ${baseSuccess-resistance})`);
      } else {
        // Only show RESIST if the action is primarily an Effect/Buff/Debuff
        if (action.typeAction !== TypeAction.DAMAGE && action.typeAction !== TypeAction.HEAL) {
            setTimeout(() => {
                this.damagePopup.show(popupPos, 'RESIST', PopupType.Damage, this.scene);
            }, delay);
        }
        console.log(`🛡️ Effect resisted: ${effectData.effectType} by ${target.name} (Roll: ${roll.toFixed(1)} >= ${baseSuccess-resistance})`);
      }
    }
  }

  // ─── Inspection Hover ──────────────────────────────────────────────────────

  private enableInspectionHover(): void {
    this.disableInspectionHover(); // Cleanup

    this.hoverObs = this.scene.onPointerObservable.add((info) => {
      // On autorise la mise à jour des infos Uniquement quand c'est explicitement demandé :
      // - Mode ciblage (PLAYER_SELECT_SKILL_TARGET / ATTACK) pour voir les stats d'une victime potentielle
      // - Mode INSPECTION EXPLICITE (Nouveau) via le bouton Info (PLAYER_INSPECT)
      const allowedStates = [
        CombatState.PLAYER_INSPECT,
        CombatState.PLAYER_SELECT_SKILL_TARGET, 
        CombatState.PLAYER_SELECT_ATTACK
      ];
      if (!allowedStates.includes(this.state)) return;
      if (info.type !== PointerEventTypes.POINTERMOVE) return;

      // Uniquement cibler les objets "Pickables" (Ce qui exclu les Sprites de Unit.ts désormais)
      // Et pour éviter tout brouillage en mode Overview (ex: UI, murs, autres choses transparentes),
      // on force le raycast à NE PRENDRE EN COMPTE que les Tuiles (qui commencent par "tile_").
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
          return mesh.isPickable && mesh.name.startsWith("tile_");
      });

      if (!pick?.hit || !pick.pickedMesh) {
        if (this.activeUnit && !this.activeUnit.isDead) this.hud?.showUnit(this.activeUnit);
        return;
      }

      // Puisque les Sprites sont invisibles aux Raycasts, nous frappons exactement la Tuile de Sol
      let foundUnit: Unit | null = null;
      const meshName = pick.pickedMesh.name;
      const tileMatch = meshName.match(/^tile_(\d+)_(\d+)$/);

      if (tileMatch) {
        const x = parseInt(tileMatch[1]);
        const z = parseInt(tileMatch[2]);
        const unitOnTile = this.units.find(u => u.status.gridX === x && u.status.gridZ === z && !u.isDead);
        if (unitOnTile) foundUnit = unitOnTile;
      }

      if (foundUnit) {
        this.hud?.showUnit(foundUnit);
      } else if (this.activeUnit && !this.activeUnit.isDead) { // 3. Fallback
        this.hud?.showUnit(this.activeUnit);
      }
    });
  }

  private disableInspectionHover(): void {
    if (this.hoverObs) {
      this.scene.onPointerObservable.remove(this.hoverObs);
      this.hoverObs = null;
    }
  }

  private log(m: string) { console.log(`[Combat] ${m}`); this.callbacks.onLog?.(m); }
  private delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  private showTileHover(tile: TileData, mode: 'move' | 'deployment'): void {
    if (this.hoveredTile === tile) return;

    this.clearTileHover();

    this.hoveredTile = tile;
    this.hoveredTilePrevMaterial = tile.mesh.material ?? null;
    tile.mesh.material = mode === 'deployment'
      ? this.deploymentTileHoverMat
      : this.moveTileHoverMat;
  }

  private clearTileHover(): void {
    if (!this.hoveredTile) return;
    this.hoveredTile.mesh.material = this.hoveredTilePrevMaterial;
    this.hoveredTile = null;
    this.hoveredTilePrevMaterial = null;
  }

  private enableTileHoverClearObserver(isValidTile: (tile: TileData) => boolean): void {
    this.disableTileHoverClearObserver();

    this.tileHoverClearObs = this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERMOVE) return;

      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
        return mesh.isPickable && mesh.name.startsWith('tile_');
      });

      if (!pick?.hit || !pick.pickedMesh) {
        this.clearTileHover();
        return;
      }

      const match = pick.pickedMesh.name.match(/^tile_(\d+)_(\d+)$/);
      if (!match) {
        this.clearTileHover();
        return;
      }

      const tile = this.grid.getTile(parseInt(match[1], 10), parseInt(match[2], 10));
      if (!tile || !isValidTile(tile)) {
        this.clearTileHover();
      }
    });
  }

  private disableTileHoverClearObserver(): void {
    if (this.tileHoverClearObs) {
      this.scene.onPointerObservable.remove(this.tileHoverClearObs);
      this.tileHoverClearObs = null;
    }
  }

  dispose(): void {
    // ⚔️ FORCE DEACTIVATE ACTIVE UNIT (Prevent rings/icons from persisting)
    if (this.activeUnit) {
        this.activeUnit.setActive(false);
        this.activeUnit.hideActionIcon();
    }

    this.units.forEach(u => u.dispose());
    this.aoeSystem.dispose();
    
    // Cleanup UI instances managed by CombatManager
    this.hud?.dispose();
    this.preview?.dispose();
    this.turnUI?.dispose();
    this.actionBar?.dispose();
    this.skillMenu?.dispose();
    this.itemMenu?.dispose();
    this.objectiveUI?.dispose();
    this.deploymentUI?.dispose();

    if (this.clickObs) this.scene.onPointerObservable.remove(this.clickObs);
    if (this.hoverObs) this.scene.onPointerObservable.remove(this.hoverObs);
    this.disableTileHoverClearObserver();
    this.clearTileHover();
    this.moveTileHoverMat.dispose();
    this.deploymentTileHoverMat.dispose();

    this.activeUnit = null;
    this.state = CombatState.IDLE;
  }
}
