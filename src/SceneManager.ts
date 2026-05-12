/**
 * SceneManager.ts
 * "The Immortal Pillar" — Final Defensive Architecture.
 * Implements a Safety Camera to prevent startup crashes.
 */

import { Engine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { GameManager } from './data/GameManager';
import { WorldMapScene } from './world/WorldMapScene';
import { CombatScene } from './combat/CombatScene';
import { TitleScreenUI } from './ui/TitleScreenUI';
import { SaveSystem } from './data/SaveSystem';

export class SceneManager {
    private _engine: Engine;
    private _scene: Scene;
    
    // PERSISTENT CONTEXTS
    private _worldMapContext: WorldMapScene;
    private _combatContext: CombatScene;

    // DEFENSIVE CAMERA: Placehold always exists manually
    private _safetyCamera: FreeCamera;

    constructor(canvas: HTMLCanvasElement) {
        // 1. UNIQUE ENGINE SOURCE
        this._engine = new Engine(canvas, true, {
            preserveDrawingBuffer: true, stencil: true
        });
        
        // 2. UNIQUE ROOT SCENE
        this._scene = new Scene(this._engine);
        
        // 3. SECURE FALLBACK: The "Safe Haven" Camera
        // Created synchronously to exist BEFORE any render frame
        this._safetyCamera = new FreeCamera("SafetyCamera", new Vector3(0, 5, -10), this._scene);
        this._scene.activeCamera = this._safetyCamera;

        // 4. INITIALIZE CONTEXTS
        this._worldMapContext = new WorldMapScene(this._scene, canvas, this._engine);
        this._combatContext = new CombatScene(this._scene, canvas, this._engine);
        
        this._worldMapContext.setVisible(false);
        this._combatContext.setVisible(false);

        const gm = GameManager.getInstance();
        gm.onSceneChange = (name) => {
            void this.handleModeChange(name);
        };

        // 5. THE RENDER LOOP AUTHORITY
        // Now safe because SafetyCamera exists
        this._engine.runRenderLoop(() => {
            if (this._scene && !this._scene.isDisposed && this._scene.activeCamera) {
                this._scene.render();
            }
        });

        window.addEventListener('resize', () => this._engine.resize());
    }

    public async start(): Promise<void> {
        console.log("🚀 Persistent Architecture: Ready.");

        // Wait for DataManager to load then initialize clan
        const { DataManager } = await import('./data/DataManager');
        const dataManager = DataManager.getInstance();
        await dataManager.loadAllData();

        // Show Title Screen
        new TitleScreenUI(async (isNew) => {
            const { ClanManager } = await import('./data/ClanManager');
            const clanManager = ClanManager.getInstance();

            if (isNew) {
                // Fetch starting units from DataManager (Templates are already loaded)
                const starterUnitIds = ["unit_alistair", "unit_elara", "unit_kestrel"];
                const starterUnits = starterUnitIds.map(id => dataManager.getUnitTemplate(id)).filter(u => !!u);

                clanManager.initializeStarterPack(starterUnits, (id) => dataManager.getItemData(id));
                this._worldMapContext.setVisible(true);
            } else {
                // Load Game Logic
                const success = SaveSystem.loadGame(1);
                if (success) {
                    this._worldMapContext.setVisible(true);
                    this._worldMapContext.reloadState(); // Ensure visuals match loaded state
                } else {
                    console.warn("Load failed, falling back to new game.");
                    const starterUnitIds = ["unit_alistair", "unit_elara", "unit_kestrel"];
                    const starterUnits = starterUnitIds.map(id => dataManager.getUnitTemplate(id)).filter(u => !!u);
                    clanManager.initializeStarterPack(starterUnits, (id) => dataManager.getItemData(id));
                    this._worldMapContext.setVisible(true);
                }
            }
        });
    }

    private async handleModeChange(modeName: "WORLD_MAP" | "COMBAT"): Promise<void> {
        console.log(`🔄 Mode switch triggered: ${modeName}`);
        
        if (modeName === "COMBAT") {
            this._worldMapContext.setVisible(false);
            await this._combatContext.startCombat();
            this._combatContext.setVisible(true);
        } else {
            this._combatContext.setVisible(false);
            this._combatContext.endCombat();
            this._worldMapContext.setVisible(true);
        }
    }
}
