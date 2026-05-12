/**
 * QuestManager.ts
 * Manages quest progression, states, and objectives.
 * Singleton.
 */

import { GameManager } from './GameManager';

export enum QuestStatus {
    LOCKED,
    ACTIVE,
    COMPLETED,
    FAILED
}

export interface QuestStep {
    description: string;
    targetNodeId?: number; // Node ID resolution that triggers completion
    completed: boolean;
}

export interface Quest {
    id: string;
    title: string;
    description: string;
    steps: QuestStep[];
    currentStepIndex: number;
    status: QuestStatus;
}

export class QuestManager {
    private static _instance: QuestManager;
    private quests: Map<string, Quest> = new Map();

    private constructor() {
        this.initDefaultQuests();
    }

    public static getInstance(): QuestManager {
        if (!QuestManager._instance) {
            QuestManager._instance = new QuestManager();
        }
        return QuestManager._instance;
    }

    private initDefaultQuests(): void {
        // Hardcoded Lion Clan Quest based on Roadmap
        const lionQuest: Quest = {
            id: "lion_main",
            title: "L'Appel de l'Honneur",
            description: "Prouvez votre valeur au Clan du Lion en sécurisant la frontière.",
            status: QuestStatus.ACTIVE,
            currentStepIndex: 0,
            steps: [
                { description: "Rencontrer le Vieux Lion Alaric.", targetNodeId: 2, completed: false },
                { description: "Secourir le village de Bois-Clair.", targetNodeId: 17, completed: false },
                { description: "Faire rapport à Alaric.", targetNodeId: 25, completed: false }
            ]
        };
        this.quests.set(lionQuest.id, lionQuest);
    }

    public getActiveQuests(): Quest[] {
        return Array.from(this.quests.values()).filter(q => q.status === QuestStatus.ACTIVE);
    }

    public getAllQuests(): Quest[] {
        return Array.from(this.quests.values());
    }

    /**
     * Called by GameManager when a node is resolved.
     * Updates quest progress automatically.
     */
    public checkNodeResolution(nodeId: number): void {
        this.quests.forEach(quest => {
            if (quest.status !== QuestStatus.ACTIVE) return;

            const step = quest.steps[quest.currentStepIndex];
            if (step && step.targetNodeId === nodeId && !step.completed) {
                step.completed = true;
                quest.currentStepIndex++;
                
                // Check quest completion
                if (quest.currentStepIndex >= quest.steps.length) {
                    quest.status = QuestStatus.COMPLETED;
                    console.log(`✨ Quest Completed: ${quest.title}`);
                    // Could trigger rewards here
                } else {
                    console.log(`📜 Quest Update: ${quest.title} -> Step ${quest.currentStepIndex + 1}`);
                }
                
                this.notifyUI();
            }
        });
    }

    public forceCompleteStep(questId: string, stepIndex: number): void {
        const quest = this.quests.get(questId);
        if (quest && quest.status === QuestStatus.ACTIVE) {
            if (quest.steps[stepIndex]) {
                quest.steps[stepIndex].completed = true;
                quest.currentStepIndex = Math.max(quest.currentStepIndex, stepIndex + 1);
                this.notifyUI();
            }
        }
    }

    private notifyUI(): void {
        // Refresh WorldMap Objective HUD if available
        if ((window as any).refreshObjectives) {
            (window as any).refreshObjectives();
        }
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    public getSnapshot(): any {
        return Array.from(this.quests.entries());
    }

    public loadSnapshot(data: any): void {
        console.log("📥 Loading Quest Data:", data);
        if (data && Array.isArray(data) && data.length > 0) {
            // Restore map from entries
            this.quests = new Map(data);
            
            // Check consistency (optional, ensure loaded quests have valid structure)
            this.quests.forEach((q, id) => {
                // Ensure methods or missing fields are patched if schema changed
                // (Currently purely data, so fine)
                console.log(`🔹 Loaded Quest: ${id} - Status: ${q.status} (Step ${q.currentStepIndex + 1}/${q.steps.length})`);
            });
            
            this.notifyUI();
        } else {
            console.warn("⚠️ No quest data found or invalid format. Initializing defaults.");
            this.quests.clear(); // Ensure clean slate
            this.initDefaultQuests();
            this.notifyUI();
        }
    }
}
