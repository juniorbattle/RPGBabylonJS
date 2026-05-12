/**
 * GameManager.ts
 * Reliable Authority for Global Game Logic and Progression.
 * Secured against NaN and Undefined Combat configurations.
 */

export class GameManager {
    private static _instance: GameManager;
    
    // Technical Pivot
    public onSceneChange: ((name: "WORLD_MAP" | "COMBAT") => void) | null = null;

    // Progression State
    public currentPlateauId: string = "lion_clan";
    public currentPhase: number = 1;
    public stepCounter: number = 0;
    public resolvedNodes: Set<number> = new Set();
    public currentNodeId: number = 1; // Default start
    
    // NARRATIVE PERSISTENCE
    public nextTriggerDialogueId: string | null = null;

    // Active Combat
    public activeCombatConfig: any | null = null;
    public activeCombatNodeId: number | null = null;
    public activeCombatNodeType: string | null = null;
    public combatCooldowns: Map<number, number> = new Map(); // NodeID -> Step to Reactivate
    
    // Narrative Flags
    public flags: Map<string, boolean> = new Map();

    private constructor() {}

    public static getInstance(): GameManager {
        if (!GameManager._instance) {
            GameManager._instance = new GameManager();
        }
        return GameManager._instance;
    }

    /**
     * Preparation of Battle with Fallback Security.
     * Parses "NxM" grid format and handles node-specific data.
     */
    public async prepareCombat(nodeId: number, config: any, type: string = "COMBAT"): Promise<void> {
        this.activeCombatNodeId = nodeId;
        this.activeCombatNodeType = type;

        // Parse grid size from config (supports "12" or "8x12")
        let gridW = 8;
        let gridD = 4;

        if (config?.grid) {
            const parts = String(config.grid).toLowerCase().split('x');
            if (parts.length === 2) {
                gridW = parseInt(parts[0]) || 12;
                gridD = parseInt(parts[1]) || 8;
            } else {
                gridW = parseInt(parts[0]) || 12;
                gridD = Math.max(8, Math.ceil(gridW * 0.8));
            }
        } else if (config?.gridSize) {
            gridW = Number(config.gridSize);
            gridD = Math.max(8, Math.ceil(gridW * 0.8));
        }

        // 🛡️ SECURITY FALLBACKS
        const safeConfig = {
            biome: config?.biome || "forest",
            gridW: gridW,
            gridD: gridD,
            enemies: Array.isArray(config?.enemies) ? config.enemies : ["goblin_scout"],
            rewards: config?.rewards || { gold: 150, xp: 50 },
            objectiveText: config?.objectiveText || "Vaincre tous les ennemis !",
            mapFile:       config?.mapFile        || null
        };

        this.activeCombatConfig = safeConfig;
        console.log(`⚔️ Preparing Battle at Node ${nodeId} with Grid ${gridW}x${gridD}`);
        this.onSceneChange?.("COMBAT");
    }

    public async resolveCombat(victory: boolean): Promise<void> {
        if (victory && this.activeCombatNodeId !== null) {
            if (!this.nextTriggerDialogueId) {
                // Mark resolved
                this.resolvedNodes.add(this.activeCombatNodeId);
                
                // If RANDOM COMBAT -> Set Cooldown Logic
                if (this.activeCombatNodeType === "COMBAT") {
                    const reactivationStep = this.stepCounter + 3;
                    this.combatCooldowns.set(this.activeCombatNodeId, reactivationStep);
                    console.log(`⏳ Node ${this.activeCombatNodeId} (COMBAT) disabled until Step ${reactivationStep}`);
                }
            }
        }
        this.activeCombatConfig = null;
        this.activeCombatNodeType = null;
        this.onSceneChange?.("WORLD_MAP");
    }

    // Progression Helpers
    public isNodeResolved(id: number): boolean { return this.resolvedNodes.has(id); }
    public registerNodeResolution(id: number): void { this.resolvedNodes.add(id); }
    
    public addStep(): void { 
        this.stepCounter++; 
        if (this.stepCounter % 5 === 0) this.currentPhase++;
        
        // CHECK COOLDOWNS
        if (this.combatCooldowns.size > 0) {
            const reactivated: number[] = [];
            this.combatCooldowns.forEach((targetStep, nodeId) => {
                if (this.stepCounter >= targetStep) {
                    this.resolvedNodes.delete(nodeId);
                    reactivated.push(nodeId);
                }
            });
            
            reactivated.forEach(id => {
                this.combatCooldowns.delete(id);
                console.log(`🔄 Node ${id} has respawned (Cooldown Finished)`);
            });
        }
    }

    public getSnapshot(): any {
        return {
            plateauId: this.currentPlateauId,
            phase: this.currentPhase,
            step: this.stepCounter,
            currentNodeId: this.currentNodeId,
            resolvedNodes: Array.from(this.resolvedNodes),
            flags: Object.fromEntries(this.flags),
            cooldowns: Object.fromEntries(this.combatCooldowns)
        };
    }

    public loadSnapshot(data: any): void {
        this.currentPlateauId = data.plateauId || "lion_clan";
        this.currentPhase = data.phase || 1;
        this.stepCounter = data.step || 0;
        this.currentNodeId = data.currentNodeId || 1;
        this.resolvedNodes = new Set(data.resolvedNodes || []);
        
        if (data.flags) {
            this.flags = new Map(Object.entries(data.flags));
        } else {
            this.flags.clear();
        }

        if (data.cooldowns) {
            // Convert values to numbers just in case JSON treated keys as strings (Map keys are numbers here)
            // Actually JSON object keys become strings.
            // Map<number, number> needs parsing key.
            this.combatCooldowns.clear();
            Object.entries(data.cooldowns).forEach(([k, v]) => {
                this.combatCooldowns.set(Number(k), Number(v));
            });
        } else {
            this.combatCooldowns.clear();
        }
    }

    public getFlag(key: string): boolean {
        return this.flags.get(key) || false;
    }

    public setFlag(key: string, value: boolean): void {
        this.flags.set(key, value);
        console.log(`🚩 Flag set: ${key} = ${value}`);
    }
}
