/**
 * WorldMapScene.ts
 * 3D Geometry Version with Continuity Logic.
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { DataManager } from '../data/DataManager';
import { GameManager } from '../data/GameManager';
import { ClanManager } from '../data/ClanManager';
import { DialogueSystem } from './DialogueSystem';
import { MenuManager } from '../ui/MenuManager';
import { QuestManager } from '../data/QuestManager';

export class WorldMapScene {
  private _scene: BABYLON.Scene;
  private _engine: BABYLON.Engine;
  private _guiTexture: GUI.AdvancedDynamicTexture;

  private _worldRoot: BABYLON.TransformNode;
  private _plateauData: any = null;
  private _nodes: Map<number, BABYLON.Mesh> = new Map();
  private _nodeIcons: Map<number, GUI.TextBlock> = new Map();
  private _links: Map<string, BABYLON.LinesMesh> = new Map();
  private _currentNodeId: number = 1;

  private _playerMarker: BABYLON.Mesh | null = null;
  private _camera: BABYLON.UniversalCamera | null = null;
  private _isMoving: boolean = false;

  private readonly VERTICAL_OFFSET: number = 15; 
  private _mapZoomFocus: number = 55;

  private _goldText: GUI.TextBlock | null = null;
  private _reputationBar: GUI.Rectangle | null = null;
  private _reputationText: GUI.TextBlock | null = null;
  private _objectiveText: GUI.TextBlock | null = null;
  
  private _dialogueSystem!: DialogueSystem;

  constructor(scene: BABYLON.Scene, _canvas: HTMLCanvasElement, engine: BABYLON.Engine) {
    this._scene = scene;
    this._engine = engine;
    this._guiTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("WorldUI", true, this._scene);
    this._dialogueSystem = new DialogueSystem(this._guiTexture);
    this._worldRoot = new BABYLON.TransformNode("WorldRootNode", this._scene);
    
    this._worldRoot.setEnabled(false);
    this._guiTexture.layer!.isEnabled = false;

    // Register refresh for dialogue system impacts
    (window as any).refreshWorldUI = () => this.updateUIState();
    
    // Register reload for SaveSystem
    (window as any).reloadWorldState = () => this.reloadState();

    // Register quest refresh
    (window as any).refreshObjectives = () => this.updateObjectives();

    this.initScene();
  }

  public setVisible(visible: boolean): void {
    this._worldRoot.setEnabled(visible);
    
    if (this._guiTexture.layer) {
        this._guiTexture.layer.isEnabled = visible;
    }
    // CRITICAL: Prevent hidden UI from intercepting clicks during combat!
    this._guiTexture.rootContainer.isVisible = visible;
    
    if (visible) {
        if (this._camera) this._scene.activeCamera = this._camera;
        if (this._plateauData) {
            this._scene.clearColor = BABYLON.Color4.FromHexString(this._plateauData.biomeColor + "FF");
            this.updateUIState();
            this.refreshNodesVisuals();
            this.updateObjectives();
        }
        this.startPulseAnimation();
        
        const gm = GameManager.getInstance();
        if (gm.nextTriggerDialogueId) {
            this.triggerDialogueByID(gm.nextTriggerDialogueId, gm.activeCombatNodeId);
            gm.nextTriggerDialogueId = null;
        } else if (!gm.isNodeResolved(this._currentNodeId)) {
            // Trigger start node intro if any (e.g. maintenance)
            const startNode = this._plateauData?.nodes.find((n: any) => n.id === this._currentNodeId);
            if (startNode && startNode.introId) {
                this.triggerDialogueByID(startNode.introId, startNode);
            }
        }
    } else {
        this.stopPulseAnimation();
    }
  }

  private async initScene(): Promise<void> {
    const dataManager = DataManager.getInstance();
    await dataManager.loadAllData();
    
    const gameManager = GameManager.getInstance();
    this._plateauData = dataManager.getPlateau(gameManager.currentPlateauId);
    if (!this._plateauData) return;

    this._currentNodeId = gameManager.currentNodeId || this._plateauData.startNodeId;

    this.generateGraph(); 
    this.setupCamera();
    this.setupLights();
    this.createHeaderUI();
    
    this.refreshNodesVisuals();
    this.updateObjectives();
    this.startPulseAnimation();
    
    if (this._worldRoot.isEnabled()) {
        this.setVisible(true);
    }

    const loader = document.getElementById("loadingScreen");
    if (loader) loader.style.display = "none";
  }

  private triggerDialogueByID(dialogueId: string, nodeOrId: any | null): void {
    const isNodeObj = nodeOrId && typeof nodeOrId === "object";
    const associatedNodeId = isNodeObj ? nodeOrId.id : nodeOrId;
    const targetNode = isNodeObj ? nodeOrId : null;

    // DYNAMIC: Maintenance
    if (dialogueId === "start_maintenance") {
        const cm = ClanManager.getInstance();
        const cost = cm.calculateMaintenanceCost();
        const dm = DataManager.getInstance();
        const steps = dm.getDialogue(dialogueId);
        
        if (!steps) return;

        const vars = { cost: cost.toString() };

        this._dialogueSystem.startDialogue(steps, (action?: string) => {
            const gm = GameManager.getInstance();
            
            if (action === "pay_maintenance") {
                cm.addGold(-cost);
                this._dialogueSystem.showImpactPopup("PAIEMENT", `-${cost} Or`, "#fbbf24", "🪙");
            } else if (action === "refuse_maintenance") {
                const removedUnit = cm.removeRandomUnit();
                
                if (removedUnit) {
                    const leavingSteps = dm.getDialogue("unit_leaving");
                    if (leavingSteps) {
                        const leavingVars = {
                            unitName: removedUnit.unitName.toUpperCase(),
                            unitClass: removedUnit.characterClass.toUpperCase()
                        };
                        
                        this._dialogueSystem.showImpactPopup("DÉSERTION", removedUnit.unitName.toUpperCase(), "#ef4444", "🚪");

                        this._dialogueSystem.startDialogue(leavingSteps, () => {
                            if (associatedNodeId !== null) {
                                gm.registerNodeResolution(associatedNodeId);
                                this.refreshNodesVisuals();
                            }
                        }, leavingVars);
                        return; 
                    }
                } else {
                    cm.modifyReputation(-20); // Penalty if alone
                    this._dialogueSystem.showImpactPopup("RÉPUTATION", "-20%", "#ef4444", "📉");
                }
            }

            if (associatedNodeId !== null) {
                gm.registerNodeResolution(associatedNodeId);
                this.refreshNodesVisuals();
            }
            (window as any).refreshWorldUI?.();
        }, vars);
        return;
    }

    const dm = DataManager.getInstance();
    const steps = dm.getDialogue(dialogueId);
    if (steps) {
        this._dialogueSystem.startDialogue(steps, (action?: string, nextDialogueId?: string, params?: any) => {
            const gm = GameManager.getInstance();
            
            if (nextDialogueId) gm.nextTriggerDialogueId = nextDialogueId;
            else if (targetNode && targetNode.nextDialogueId) gm.nextTriggerDialogueId = targetNode.nextDialogueId;

            if (associatedNodeId !== null && action !== "combat") {
                gm.registerNodeResolution(associatedNodeId);
                this.refreshNodesVisuals();
                // Check Quest
                QuestManager.getInstance().checkNodeResolution(associatedNodeId);
            }

            if (action === "combat" && associatedNodeId !== null) {
                let finalConfig = params?.combatConfig;
                if (!finalConfig) {
                    const nodeData = targetNode || this._plateauData.nodes.find((n: any) => n.id === associatedNodeId);
                    if (nodeData) finalConfig = nodeData.combatConfig;
                }

                if (finalConfig) {
                    gm.prepareCombat(associatedNodeId, finalConfig, "STORY");
                }
            }
        });
    } else {
        console.warn(`[WorldMapScene] Dialogue introuvable ou vide: ID ${dialogueId}`);
        // Fallback: Resolve node directly to avoid softlock
        if (associatedNodeId !== null) {
            const gm = GameManager.getInstance();
            gm.registerNodeResolution(associatedNodeId);
            this.refreshNodesVisuals();
            QuestManager.getInstance().checkNodeResolution(associatedNodeId);
        }
    }
  }

  private startPulseAnimation(): void {
    if (!this._playerMarker) return;
    this._scene.stopAnimation(this._playerMarker, "scalingPulse");
    const animPulse = new BABYLON.Animation("scalingPulse", "scaling", 30, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
    const keys = [{ frame: 0, value: new BABYLON.Vector3(1, 1, 1) }, { frame: 30, value: new BABYLON.Vector3(1.15, 1.15, 1) }, { frame: 60, value: new BABYLON.Vector3(1, 1, 1) }];
    animPulse.setKeys(keys);
    this._playerMarker.animations = [animPulse];
    this._scene.beginAnimation(this._playerMarker, 0, 60, true);
  }

  private stopPulseAnimation(): void {
    if (this._playerMarker) {
        this._scene.stopAnimation(this._playerMarker);
        this._playerMarker.scaling = new BABYLON.Vector3(1, 1, 1);
    }
  }

  private setupCamera(): void {
    const startNode = this._plateauData.nodes.find((n: any) => n.id === this._currentNodeId);
    this._camera = new BABYLON.UniversalCamera("mapCam", new BABYLON.Vector3(startNode.x, startNode.z + this.VERTICAL_OFFSET, -100), this._scene);
    this._camera.setTarget(new BABYLON.Vector3(startNode.x, startNode.z + this.VERTICAL_OFFSET, 0));
    this._camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    const aspect = this._engine.getAspectRatio(this._camera);
    const zoom = this._mapZoomFocus; 
    this._camera.orthoTop = zoom; this._camera.orthoBottom = -zoom;
    this._camera.orthoLeft = -zoom * aspect; this._camera.orthoRight = zoom * aspect;
  }

  private setupLights(): void {
    const light = new BABYLON.HemisphericLight("lightMap", new BABYLON.Vector3(0, 0, -1), this._scene);
    light.intensity = 1.4;
    light.parent = this._worldRoot;
  }

  private generateGraph(): void {
    this._plateauData.nodes.forEach((node: any) => {
      node.links.forEach((targetId: number) => {
        const target = this._plateauData.nodes.find((n: any) => n.id === targetId);
        if (target) { this.drawStaticLink(node, target); }
      });
    });
    this._plateauData.nodes.forEach((node: any) => { this.createNodeDisc(node); });
    this.createPlayerMarker();
  }

  private drawStaticLink(startNode: any, endNode: any): void {
    const p1 = new BABYLON.Vector3(startNode.x, startNode.z, 0);
    const p2 = new BABYLON.Vector3(endNode.x, endNode.z, 0);
    
    // Create Solid Lines
    const line = BABYLON.MeshBuilder.CreateLines(`link_${startNode.id}_${endNode.id}`, { points: [p1, p2], updatable: true }, this._scene);
    line.color = new BABYLON.Color3(1, 1, 1); 
    line.alpha = 0.35;
    line.parent = this._worldRoot;

    // Store link reference (sorted key to avoid duplicates)
    const linkKey = [startNode.id, endNode.id].sort((a,b) => a-b).join("_");
    this._links.set(linkKey, line as BABYLON.LinesMesh);
  }

  private createNodeDisc(node: any): void {
    const disc = BABYLON.MeshBuilder.CreateDisc(`node_${node.id}`, { radius: 7, tessellation: 64 }, this._scene);
    disc.position = new BABYLON.Vector3(node.x, node.z, 0.1); 
    disc.parent = this._worldRoot;
    
    if (node.type === "TARGET") {
        const glow = new BABYLON.StandardMaterial("glowNode", this._scene);
        glow.emissiveColor = new BABYLON.Color3(1, 0.8, 0);
        disc.material = glow;
        disc.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);
    } else {
        const mat = new BABYLON.StandardMaterial(`mat_${node.id}`, this._scene);
        mat.diffuseColor = BABYLON.Color3.White();
        disc.material = mat;
    }

    const icon = new GUI.TextBlock();
    icon.text = node.icon; icon.fontSize = 32; icon.alpha = 1.0;
    this._guiTexture.addControl(icon);
    icon.linkWithMesh(disc);
    this._nodeIcons.set(node.id, icon);

    disc.actionManager = new BABYLON.ActionManager(this._scene);
    disc.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
      this.tryMoveToNode(node);
    }));
    this._nodes.set(node.id, disc);
  }

  private refreshNodesVisuals(): void {
    if (!this._plateauData) return;
    const gm = GameManager.getInstance();
    this._plateauData.nodes.forEach((node: any) => {
      const icon = this._nodeIcons.get(node.id);
      if (!icon) return;
      const isPlayerHere = node.id === this._currentNodeId;
      const isResolved = gm.resolvedNodes.has(node.id);
      if (isResolved) {
          icon.isVisible = false; 
      } else if (isPlayerHere) {
          icon.alpha = 0.3; 
      } else {
          icon.isVisible = true;
          icon.alpha = 1.0;
      }
    });
  }

  private createPlayerMarker(): void {
    const currentNode = this._plateauData.nodes.find((n: any) => n.id === this._currentNodeId);
    this._playerMarker = BABYLON.MeshBuilder.CreateDisc("player", { radius: 4.0, tessellation: 64 }, this._scene);
    this._playerMarker.position = new BABYLON.Vector3(currentNode.x, currentNode.z, -0.5); 
    this._playerMarker.parent = this._worldRoot;
    this._playerMarker.renderingGroupId = 1; 
    const mat = new BABYLON.StandardMaterial("pMat", this._scene);
    mat.emissiveColor = new BABYLON.Color3(0, 0.45, 1.0);
    mat.disableLighting = true; 
    this._playerMarker.material = mat;

    this._playerMarker.actionManager = new BABYLON.ActionManager(this._scene);
    this._playerMarker.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
        const node = this._plateauData.nodes.find((n: any) => n.id === this._currentNodeId);
        if (node) this.tryMoveToNode(node);
    }));
  }

  private tryMoveToNode(targetNode: any): void {
    if (this._isMoving) return;

    // Direct interaction if already on node
    if (targetNode.id === this._currentNodeId) {
        if (targetNode.type === "SHOP") {
            MenuManager.getInstance().openShopMenu(targetNode.items || []);
        }
        return;
    }

    const currentNode = this._plateauData.nodes.find((n: any) => n.id === this._currentNodeId);
    if (currentNode.links.includes(targetNode.id) || targetNode.links.includes(currentNode.id)) {
      
      if (targetNode.type === "TOLL") {
          const gm = GameManager.getInstance();
          if (!gm.resolvedNodes.has(targetNode.id)) {
              const toll = targetNode.tollAmount || 50;
              const msg = targetNode.tollMessage || "Halte ! Péage obligatoire.";
              
              const tollDialog = [{
                  id: "toll_dynamic",
                  speakerName: "GARDE",
                  speakerTag: "PÉAGE",
                  text: msg,
                  icon: "🪙",
                  side: "center",
                  choices: [
                      { 
                          text: `Payer (${toll} Or)`, 
                          next: null, 
                          impact: { gold: -toll, action: "resolve_toll" } 
                      },
                      { text: "Faire demi-tour", next: null }
                  ]
              }];

              // Explicit cast to any to match loose DialogueStep structure if inferred wrong
              this._dialogueSystem.startDialogue(tollDialog as any, (action?: string) => {
                  if (action === "resolve_toll") {
                      gm.registerNodeResolution(targetNode.id);
                      this.refreshNodesVisuals();
                      this.animateMovement(currentNode, targetNode);
                  }
              });
              return;
          }
      }

      this.animateMovement(currentNode, targetNode);
    }
  }

  private animateMovement(startNode: any, targetNode: any): void {
    this._isMoving = true;
    this.stopPulseAnimation(); 

    // Highlight current path
    const linkKey = [startNode.id, targetNode.id].sort((a,b) => a-b).join("_");
    const activeLine = this._links.get(linkKey);
    if (activeLine) {
        activeLine.color = new BABYLON.Color3(0.38, 0.65, 1.0); // Vibrant blue
        activeLine.alpha = 1.0;
    }

    const gm = GameManager.getInstance();
    const duration = 60;
    
    const animX = new BABYLON.Animation("mvX", "position.x", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animX.setKeys([{ frame: 0, value: startNode.x }, { frame: duration, value: targetNode.x }]);
    const animY = new BABYLON.Animation("mvY", "position.y", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    animY.setKeys([{ frame: 0, value: startNode.z }, { frame: duration, value: targetNode.z }]);

    const camX = new BABYLON.Animation("camX", "position.x", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    camX.setKeys([{ frame: 0, value: this._camera!.position.x }, { frame: duration, value: targetNode.x }]);
    const camY = new BABYLON.Animation("camY", "position.y", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    camY.setKeys([{ frame: 0, value: this._camera!.position.y }, { frame: duration, value: targetNode.z + this.VERTICAL_OFFSET }]);

    const ease = new BABYLON.CubicEase(); ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    camX.setEasingFunction(ease); camY.setEasingFunction(ease);

    this._playerMarker!.animations = [animX, animY];
    this._camera!.animations = [camX, camY];

    this._scene.beginAnimation(this._playerMarker, 0, duration, false);
    this._scene.beginAnimation(this._camera, 0, duration, false, 1.0, () => {
      // Restore path color
      if (activeLine) {
          activeLine.color = new BABYLON.Color3(1, 1, 1);
          activeLine.alpha = 0.35;
      }

      this._currentNodeId = targetNode.id; 
      gm.currentNodeId = this._currentNodeId; // Persist position
      this._isMoving = false; 
      gm.addStep();
      this.refreshNodesVisuals();
      this.updateUIState();
      this.startPulseAnimation(); 
      this._camera!.setTarget(new BABYLON.Vector3(targetNode.x, targetNode.z + this.VERTICAL_OFFSET, 0));

      const isResolved = gm.resolvedNodes.has(targetNode.id);
      if (!isResolved) {
          if (targetNode.type === "SHOP") {
              MenuManager.getInstance().openShopMenu(targetNode.items || []);
          } else if (targetNode.introId) {
              this.triggerDialogueByID(targetNode.introId, targetNode);
          } else if (targetNode.type === "COMBAT") {
              gm.prepareCombat(targetNode.id, targetNode.combatConfig, "COMBAT");
          } else if (targetNode.type === "DF") {
              const missionSuccess = gm.getFlag("missionSuccess");
              const dialogueId = missionSuccess ? "lion_finale_victory" : "lion_finale_confrontation";
              console.log(`🏁 Reached DF. Mission Success: ${missionSuccess} -> Dialogue: ${dialogueId}`);
              
              const steps = DataManager.getInstance().getDialogue(dialogueId);
              if (steps) {
                  this._dialogueSystem.startDialogue(steps, (action?: string, nextDialogueId?: string, params?: any) => {
                      if (action === "combat") {
                          const finalConfig = params?.combatConfig;
                          gm.prepareCombat(targetNode.id, finalConfig, "BOSS");
                      } else {
                          gm.registerNodeResolution(targetNode.id);
                          this.refreshNodesVisuals();
                          QuestManager.getInstance().checkNodeResolution(targetNode.id);
                      }
                  });
              }
          } else if (targetNode.type === "END") {
              const endDialog = [{
                  id: "end_demo",
                  speakerName: "SYSTÈME",
                  speakerTag: "INFO",
                  text: "Félicitations ! Vous avez terminé la démo des Terres du Lion. Merci d'avoir joué !",
                  icon: "🏁",
                  side: "center",
                  choices: [{ text: "Recommencer", next: null }]
              }];
              this._dialogueSystem.startDialogue(endDialog as any, () => {
                  location.reload(); // Simple restart for demo
              });
          } else {
              // Simple node resolution (e.g. navigation without dialogue/combat immediately)
              // If we want quests to update on mere arrival:
              QuestManager.getInstance().checkNodeResolution(targetNode.id);
          }
      } else {
          // Even if resolved, maybe we need to check quest? 
          // (Usually quests update ON resolution, so repeated visits shouldn't advance unless designed so)
      }

      // Update HUD Objectives
      this.updateObjectives();
    });
  }

  private createGradientHeader(): void {
    const headerBg = new GUI.Rectangle("gradientHeader");
    headerBg.width = "100%"; headerBg.height = "220px"; headerBg.thickness = 0; headerBg.verticalAlignment = 0; this._guiTexture.addControl(headerBg);
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 220;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0.75)"); gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.4)"); gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1, 220);
      const image = new GUI.Image("gradientImg", canvas.toDataURL()); image.stretch = GUI.Image.STRETCH_FILL; headerBg.addControl(image);
    }
  }

  private createHeaderUI(): void {
    const gm = GameManager.getInstance(); 
    const cm = ClanManager.getInstance();
    const biomeColor = this._plateauData.biomeColor || "#78350f"; // Fallback color
    const stoneBg = "#f5f5f4EF";

    this.createGradientHeader();
    const commonY = "50px"; 
    
    // --- MAIN LEFT PANEL (Title + Objective) ---
    const l = new GUI.Rectangle("mainPanel"); 
    l.width = "450px"; 
    l.height = "100px"; 
    
    // Design: Dark Glass + Colored Glow
    l.background = "#1c1917FA"; 
    l.color = biomeColor; // Border matches biome
    l.thickness = 2; 
    l.cornerRadius = 8;
    l.shadowBlur = 15;
    l.shadowColor = biomeColor; // Glow matches biome
    
    l.horizontalAlignment = 0; 
    l.verticalAlignment = 0; 
    
    // Animation: Slide In from Left
    l.left = "-500px";
    l.top = commonY; 
    this._guiTexture.addControl(l);

    const animEnter = new BABYLON.Animation("panelEnter", "left", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    // GUI positioning with "px" strings is tricky to animate with standard float animation directly if not careful?
    // Actually Babylon GUI 'left' property is string|number. If string with px, float animation might fail or need parsing.
    // Better to use 'linkOffsetX' or manually animate via scene.onBeforeRender? 
    // Wait, BABYLON.Animation on GUI control properties (string-based) is supported if keyframes are values?
    // Let's use simple setTimeout for a CSS-like transition effect via manual frame update or verify if Babylon GUI handles it.
    // Safest for GUI: Use a value we can trust or a simple tween agent.
    // Actually, `leftInPixels` is a property on Control. Let's try animating that but it's read-only? No.
    // Let's just set it to final position for now, or use a simple observable for smooth slide.
    
    // Manual Tween for Entrance
    let targetLeft = 50;
    let currentLeft = -450;
    const obs = this._scene.onBeforeRenderObservable.add(() => {
        currentLeft += (targetLeft - currentLeft) * 0.1;
        l.left = `${currentLeft}px`;
        if (Math.abs(targetLeft - currentLeft) < 1) {
            l.left = "50px";
            this._scene.onBeforeRenderObservable.remove(obs);
        }
    });

    // Decorative Strip
    const strip = new GUI.Rectangle();
    strip.width = "8px";
    strip.horizontalAlignment = 0;
    strip.background = biomeColor;
    strip.thickness = 0;
    l.addControl(strip);

    // Vertical Stack
    const stack = new GUI.StackPanel();
    stack.isVertical = true;
    stack.horizontalAlignment = 0; 
    stack.verticalAlignment = 2;   
    stack.width = "400px";         
    stack.left = "25px"; // Offset from strip          
    l.addControl(stack);

    // Title
    const t = new GUI.TextBlock(); 
    t.text = this._plateauData.name.toUpperCase(); // Uppercase for impact
    t.color = "#e7e5e4"; // Stone-200 (Light Gray)
    t.fontWeight = "800"; 
    t.fontSize = 24; 
    t.fontFamily = "'Segoe UI', 'Roboto', sans-serif";
    t.height = "35px";
    t.textHorizontalAlignment = 0; 
    // Text Shadow for readability
    t.shadowBlur = 2; t.shadowColor = "black"; t.shadowOffsetX = 1; t.shadowOffsetY = 1;
    stack.addControl(t);
    
    // Objective Text
    this._objectiveText = new GUI.TextBlock(); 
    this._objectiveText.text = "Charging..."; 
    this._objectiveText.color = "#fbbf24"; // Amber-400 (Gold/Yellow for visibility against dark)
    this._objectiveText.fontSize = 14; 
    this._objectiveText.fontWeight = "600";
    this._objectiveText.textHorizontalAlignment = 0; 
    this._objectiveText.textWrapping = true;
    this._objectiveText.height = "45px";
    stack.addControl(this._objectiveText);
    
    // --- RIGHT PANEL (Status) ---
    const r = new GUI.StackPanel(); r.isVertical = false; r.height = "85px"; r.width = "750px"; r.horizontalAlignment = 1; r.verticalAlignment = 0; r.top = commonY; r.paddingRight = "50px"; this._guiTexture.addControl(r);
    
    const rep = new GUI.Rectangle(); rep.width = "230px"; rep.height = "75px"; rep.background = "#1c1917"; rep.cornerRadius = 25; rep.thickness = 0; r.addControl(rep);
    
    this._reputationText = new GUI.TextBlock(); this._reputationText.text = `RÉPUTATION  ${cm.getReputation()}%`; this._reputationText.color = "white"; this._reputationText.fontSize = 11; this._reputationText.fontWeight = "900"; this._reputationText.top = "-12px"; rep.addControl(this._reputationText);
    
    const b = new GUI.Rectangle(); b.width = "180px"; b.height = "10px"; b.background = "#44403c"; b.cornerRadius = 5; b.top = "12px"; b.thickness = 0; rep.addControl(b);
    
    this._reputationBar = new GUI.Rectangle(); this._reputationBar.width = (cm.getReputation() * 1.8) + "px"; this._reputationBar.height = "10px"; this._reputationBar.background = "#fbbf24"; this._reputationBar.cornerRadius = 5; this._reputationBar.horizontalAlignment = 0; this._reputationBar.thickness = 0; b.addControl(this._reputationBar);
    
    const gold = new GUI.Rectangle(); gold.width = "150px"; gold.height = "75px"; gold.background = stoneBg; gold.cornerRadius = 25; gold.thickness = 0; gold.paddingLeft = "25px"; r.addControl(gold);
     gold.horizontalAlignment = 0;
    this._goldText = new GUI.TextBlock(); this._goldText.text = `🪙 ${cm.getGold()}`; this._goldText.color = "#1c1917"; this._goldText.fontWeight = "bold"; this._goldText.fontSize = 20; gold.addControl(this._goldText);
    
    const c = GUI.Button.CreateSimpleButton("c", "👥 CLAN"); c.width = "200px"; c.height = "75px"; c.background = "#f59e0b"; c.color = "white"; c.cornerRadius = 25; c.thickness = 4; c.shadowBlur = 15; c.shadowColor = "rgba(0,0,0,0.3)"; c.fontSize = 20; c.fontWeight = "900"; c.paddingLeft = "25px"; r.addControl(c);

    c.onPointerUpObservable.add(() => MenuManager.getInstance().openClanMenu());

    const s = GUI.Button.CreateSimpleButton("s", "⚙️"); s.width = "100px"; s.height = "75px"; s.background = "#334155"; s.color = "white"; s.cornerRadius = 25; s.thickness = 4; s.shadowBlur = 15; s.shadowColor = "rgba(0,0,0,0.3)"; s.fontSize = 28; s.fontWeight = "900"; s.paddingLeft = "25px"; r.addControl(s);

    s.onPointerUpObservable.add(() => MenuManager.getInstance().openSystemMenu());
  }

  private updateUIState(): void {
    const gm = GameManager.getInstance();
    const cm = ClanManager.getInstance();
    if (this._goldText) this._goldText.text = `🪙 ${cm.getGold()}`;
    // Phase header removed
    if (this._reputationBar) this._reputationBar.width = (cm.getReputation() * 1.8) + "px";
    if (this._reputationText) this._reputationText.text = `RÉPUTATION  ${cm.getReputation()}%`;
  }

  private updateObjectives(): void {
      if (!this._objectiveText) return;
      
      const qm = QuestManager.getInstance();
      const activeQuests = qm.getActiveQuests();
      
      if (activeQuests.length > 0) {
          const q = activeQuests[0]; // Show main quest primarily
          const step = q.steps[q.currentStepIndex];
          const stepDesc = step ? step.description : "Terminé";
          this._objectiveText.text = `🎯  ${stepDesc}`;
          this._objectiveText.color = "#fbbf24"; // Amber-400
      } else {
          this._objectiveText.text = "🎯  Aucun objectif actif";
          this._objectiveText.color = "#a8a29e"; // Stone-400
      }
  }

  public reloadState(): void {
    const gm = GameManager.getInstance();
    
    // Restore Position
    this._currentNodeId = gm.currentNodeId || 1; 
    
    if (this._plateauData && this._playerMarker) {
        const node = this._plateauData.nodes.find((n: any) => n.id === this._currentNodeId);
        if (node) {
            this._playerMarker.position.x = node.x;
            this._playerMarker.position.y = node.z;
            if (this._camera) {
                this._camera.position.x = node.x;
                this._camera.position.y = node.z + this.VERTICAL_OFFSET; 
                this._camera.setTarget(new BABYLON.Vector3(node.x, node.z + this.VERTICAL_OFFSET, 0));
            }
        }
    }

    // Refresh Visuals
    this.refreshNodesVisuals();
    this.updateUIState();
    this.updateObjectives();
    this.startPulseAnimation();
    
    console.log("🔄 World Map State Reloaded.");
  }

  public dispose(): void {
    this._worldRoot.dispose();
    this._guiTexture.dispose();
  }
}
