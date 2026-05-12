import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { GameManager } from '../data/GameManager';
import { ClanManager } from '../data/ClanManager';
import { DataManager } from '../data/DataManager';

export interface DialogueStep {
    id: number | string;
    speakerName: string;
    speakerTag: string;
    text: string;
    icon: string;
    side: 'left' | 'right' | 'center' | 'none';
    next?: number | string | null;
    choices?: DialogueChoice[];
    impact?: { 
        reputation?: number, 
        gold?: number, 
        item?: string,
        reqItem?: { id: string, qty?: number },
        recruitUnit?: string, 
        action?: string,
        combatConfig?: any,
        flags?: { [key: string]: boolean } 
    };
}

export interface DialogueChoice {
    text: string;
    next: number | string | null;
    impact?: { 
        reputation?: number, 
        gold?: number, 
        item?: string,
        reqItem?: { id: string, qty?: number },
        recruitUnit?: string, 
        action?: string,
        combatConfig?: any,
        flags?: { [key: string]: boolean }
    };
}

export class DialogueSystem {
    private _guiTexture: GUI.AdvancedDynamicTexture;
    private _container!: GUI.Rectangle;
    private _overlay!: GUI.Rectangle;
    
    private _dialogueBox!: GUI.Rectangle;
    private _nameBlock!: GUI.TextBlock;
    private _tagBlock!: GUI.TextBlock;
    private _textBlock!: GUI.TextBlock;
    private _portraitContainer!: GUI.Rectangle;
    private _portraitIcon!: GUI.TextBlock;
    
    private _choiceStack!: GUI.StackPanel;
    private _popupContainer!: GUI.StackPanel;

    private _leftSpriteContainer!: GUI.Rectangle;
    private _rightSpriteContainer!: GUI.Rectangle;
    private _leftSpriteText!: GUI.TextBlock;
    private _rightSpriteText!: GUI.TextBlock;

    private _currentConversation: DialogueStep[] = [];
    private _currentStepId: number | string = 1;
    private _onComplete: ((action?: string, nextDialogueId?: string, actionParams?: any) => void) | null = null;
    private _vars: Record<string, string> = {};

    constructor(guiTexture: GUI.AdvancedDynamicTexture) {
        this._guiTexture = guiTexture;
        this.createUI();
    }

    private createUI(): void {
        this._overlay = new GUI.Rectangle("dialogueOverlay");
        this._overlay.width = "100%"; this._overlay.height = "100%";
        this._overlay.background = "rgba(0,0,0,0.85)"; this._overlay.thickness = 0;
        this._overlay.isVisible = false; this._overlay.isPointerBlocker = true;
        this._overlay.zIndex = 1000; 
        this._guiTexture.addControl(this._overlay);

        this._container = new GUI.Rectangle("dialogueContainer");
        this._container.width = "100%"; this._container.height = "100%";
        this._container.thickness = 0;
        this._overlay.addControl(this._container);

        // VN Sprites
        this._leftSpriteContainer = new GUI.Rectangle("lVN");
        this._leftSpriteContainer.width = "450px"; this._leftSpriteContainer.height = "650px"; this._leftSpriteContainer.thickness = 0;
        this._leftSpriteContainer.horizontalAlignment = 0; this._leftSpriteContainer.left = "80px"; this._leftSpriteContainer.top = "50px";
        this._leftSpriteContainer.isVisible = false; this._container.addControl(this._leftSpriteContainer);
        this._leftSpriteText = new GUI.TextBlock(); this._leftSpriteText.fontSize = 320; this._leftSpriteContainer.addControl(this._leftSpriteText);

        this._rightSpriteContainer = new GUI.Rectangle("rVN");
        this._rightSpriteContainer.width = "450px"; this._rightSpriteContainer.height = "650px"; this._rightSpriteContainer.thickness = 0;
        this._rightSpriteContainer.horizontalAlignment = 1; this._rightSpriteContainer.left = "-80px"; this._rightSpriteContainer.top = "50px";
        this._rightSpriteContainer.isVisible = false; this._container.addControl(this._rightSpriteContainer);
        this._rightSpriteText = new GUI.TextBlock(); this._rightSpriteText.fontSize = 320; this._rightSpriteContainer.addControl(this._rightSpriteText);

        // Feedback Popup Container: Top Left, under the Plateau Header
        this._popupContainer = new GUI.StackPanel("popups");
        this._popupContainer.width = "400px";
        this._popupContainer.horizontalAlignment = 0; // Left
        this._popupContainer.verticalAlignment = 0; // Top
        this._popupContainer.left = "50px";
        this._popupContainer.top = "150px"; // Just under the Header
        this._popupContainer.isPointerBlocker = false;
        this._popupContainer.zIndex = 2000;
        this._guiTexture.addControl(this._popupContainer);

        this._choiceStack = new GUI.StackPanel("choices");
        this._choiceStack.width = "600px"; this._choiceStack.verticalAlignment = 2; this._choiceStack.top = "-50px";
        this._container.addControl(this._choiceStack);

        this._dialogueBox = new GUI.Rectangle("box");
        this._dialogueBox.width = "1150px"; this._dialogueBox.height = "280px"; this._dialogueBox.background = "white";
        this._dialogueBox.cornerRadius = 55; this._dialogueBox.thickness = 0; this._dialogueBox.verticalAlignment = 1;
        this._dialogueBox.top = "-50px"; this._container.addControl(this._dialogueBox);

        this._portraitContainer = new GUI.Rectangle("port");
        this._portraitContainer.width = "180px"; this._portraitContainer.height = "180px"; this._portraitContainer.background = "#eff6ff";
        this._portraitContainer.cornerRadius = 50; this._portraitContainer.thickness = 7; this._portraitContainer.color = "#60a5fa";
        this._portraitContainer.horizontalAlignment = 0; this._portraitContainer.left = "45px"; this._dialogueBox.addControl(this._portraitContainer);
        this._portraitIcon = new GUI.TextBlock(); this._portraitIcon.fontSize = 110; this._portraitContainer.addControl(this._portraitIcon);

        const content = new GUI.StackPanel();
        content.width = "850px"; content.height = "220px"; content.horizontalAlignment = 0; content.verticalAlignment = 0;
        content.left = "255px"; content.top = "45px"; this._dialogueBox.addControl(content);

        const head = new GUI.StackPanel(); head.isVertical = false; head.width = "100%"; head.height = "50px"; head.horizontalAlignment = 0; content.addControl(head);
        this._nameBlock = new GUI.TextBlock(); this._nameBlock.color = "#1e3a8a"; this._nameBlock.fontSize = 22; this._nameBlock.fontWeight = "900";
        this._nameBlock.resizeToFit = true; this._nameBlock.paddingRight = "25px"; this._nameBlock.textHorizontalAlignment = 0; head.addControl(this._nameBlock);
        
        const tag = new GUI.Rectangle(); tag.width = "165px"; tag.height = "32px"; tag.background = "#f1f5f9"; tag.cornerRadius = 12; tag.thickness = 0; head.addControl(tag);
        this._tagBlock = new GUI.TextBlock(); this._tagBlock.color = "#64748b"; this._tagBlock.fontSize = 13; this._tagBlock.fontWeight = "bold"; tag.addControl(this._tagBlock);

        this._textBlock = new GUI.TextBlock(); this._textBlock.color = "#334155"; this._textBlock.fontSize = 24; this._textBlock.lineSpacing = "3px";
        this._textBlock.textWrapping = true; this._textBlock.textHorizontalAlignment = 0; this._textBlock.textVerticalAlignment = 0;
        this._textBlock.width = "1.0"; this._textBlock.height = "150px"; this._textBlock.top = "25px"; this._textBlock.paddingRight = "40px";
        content.addControl(this._textBlock);

        this._overlay.onPointerUpObservable.add(() => {
            if (this._choiceStack.children.length === 0) this.nextStep();
        });
    }

    public startDialogue(conv: DialogueStep[], onComplete?: (action?: string, nextDialogueId?: string, actionParams?: any) => void, vars?: Record<string, string>): void {
        this._currentConversation = conv;
        this._currentStepId = conv[0].id;
        this._onComplete = onComplete || null;
        this._vars = vars || {};
        this._overlay.isVisible = true;
        this.displayStep();
    }

    private parseText(str: string): string {
        if (!str) return str;
        return str.replace(/{(\w+)}/g, (match, key) => {
            return this._vars[key] !== undefined ? this._vars[key] : match;
        });
    }

    private displayStep(): void {
        const step = this._currentConversation.find(s => s.id === this._currentStepId);
        if (!step) return this.close();

        if (step.impact) {
            this.applyImpacts(step.impact);
        }

        this._nameBlock.text = this.parseText(step.speakerName).toUpperCase();
        this._tagBlock.text = this.parseText(step.speakerTag).toUpperCase();
        this._textBlock.text = `"${this.parseText(step.text)}"`;
        this._portraitIcon.text = step.icon;

        this._leftSpriteContainer.isVisible = step.side === 'left';
        this._rightSpriteContainer.isVisible = step.side === 'right';
        if (step.side === 'left') this._leftSpriteText.text = step.icon;
        if (step.side === 'right') this._rightSpriteText.text = step.icon;

        this._choiceStack.clearControls();
        if (step.choices) {
            step.choices.forEach(ch => {
                let text = this.parseText(ch.text);
                let canAfford = true;

                // Check affordability if gold cost hardcoded
                if (ch.impact && ch.impact.gold && ch.impact.gold < 0) {
                    const cost = Math.abs(ch.impact.gold);
                    if (ClanManager.getInstance().getGold() < cost) {
                        canAfford = false;
                        text += " (Or Insuffisant)";
                    }
                }

                // Check affordability if dynamic action
                if (ch.impact && ch.impact.action === "pay_maintenance") {
                    const cost = parseInt(this._vars["cost"] || "0");
                    if (ClanManager.getInstance().getGold() < cost) {
                        canAfford = false;
                        text += " (Or Insuffisant)";
                    }
                }

                // Check item requirement
                if (ch.impact && ch.impact.reqItem) {
                    const req = ch.impact.reqItem;
                    const qty = req.qty || 1;
                    const check = this.checkHasItem(req.id, qty);
                    if (!check.has) {
                        canAfford = false;
                        text += ` (Manque: ${check.name})`;
                    } else {
                        text += ` (Donner: ${check.name})`;
                    }
                }

                const b = GUI.Button.CreateSimpleButton("ch", text);
                b.width = "550px"; b.height = "75px"; b.cornerRadius = 28; b.fontSize = 20; b.paddingBottom = "15px";

                if (canAfford) {
                    b.color = "white"; 
                    b.background = "#1e293b";
                    b.onPointerUpObservable.add(() => this.handleChoice(ch));
                } else {
                    b.color = "#ef4444"; // Red text
                    b.background = "#334155"; // Grey background
                    b.alpha = 0.8;
                    // No click handler attached
                }

                this._choiceStack.addControl(b);
            });
        }
    }

    private handleChoice(choice: DialogueChoice): void {
        if (choice.impact) {
            this.applyImpacts(choice.impact);

            if (choice.impact.action) {
                this.close(choice.impact.action, choice.next ? String(choice.next) : undefined, choice.impact);
                return;
            }
        }

        if (choice.next) {
            const existsInCurrent = this._currentConversation.some(s => s.id == choice.next);
            if (existsInCurrent) {
                this._currentStepId = choice.next;
                this.displayStep();
            } else {
                const nextConv = DataManager.getInstance().getDialogue(String(choice.next));
                if (nextConv) {
                    this.startDialogue(nextConv, this._onComplete || undefined, this._vars);
                } else {
                    this.close();
                }
            }
        } else {
            this.close();
        }
    }

    private applyImpacts(impact: any): void {
        const cm = ClanManager.getInstance();
        const dm = DataManager.getInstance();
        const gm = GameManager.getInstance();

        if (impact.flags) {
            Object.entries(impact.flags).forEach(([key, val]) => {
                gm.setFlag(key, val as boolean);
            });
        }
        
        if (impact.reputation) {
            cm.modifyReputation(impact.reputation);
            this.showImpactPopup("RÉPUTATION", impact.reputation > 0 ? `+${impact.reputation}%` : `${impact.reputation}%`, "#60a5fa", "🏆");
        }
        
        if (impact.gold) {
            cm.addGold(impact.gold);
            this.showImpactPopup("GAIN D'OR", impact.gold > 0 ? `+${impact.gold}` : `${impact.gold}`, "#fbbf24", "🪙");
        }

        if (impact.reqItem) {
            const req = impact.reqItem;
            const qty = req.qty || 1;
            const itemData = dm.getItemData(req.id);
            if (itemData) {
                cm.removeItem(req.id, itemData.category, qty);
                this.showImpactPopup("OBJET DONNÉ", `${itemData.itemName.toUpperCase()} x${qty}`, "#f87171", "📤");
            }
        }

        if (impact.item) {
            const itemData = dm.getItemData(impact.item);
            if (itemData) {
                cm.addItem(itemData);
                this.showImpactPopup("OBJET REÇU", itemData.itemName.toUpperCase(), "#34d399", "📦");
            } else {
                console.warn("Item not found:", impact.item);
            }
        }

        if (impact.recruitUnit) {
            const unitTemplate = dm.getUnitTemplate(impact.recruitUnit);
            if (unitTemplate) {
                // Clone and create unique instance
                const newUnit = JSON.parse(JSON.stringify(unitTemplate));
                newUnit.id = `${newUnit.id}_${Date.now()}`; // Unique Instance ID
                
                if (cm.addUnit(newUnit)) {
                    this.showImpactPopup("NOUVEAU MEMBRE", newUnit.unitName.toUpperCase(), "#a78bfa", "👤");
                } else {
                    this.showImpactPopup("RECRUTEMENT", "ECHEC (CLAN PLEIN)", "#ef4444", "❌");
                }
            } else {
                console.warn("Unit template not found:", impact.recruitUnit);
            }
        }

        (window as any).refreshWorldUI?.();
    }

    public showImpactPopup(label: string, value: string, color: string, icon: string): void {
        const container = new GUI.Rectangle();
        container.width = "300px"; container.height = "60px"; 
        container.background = "rgba(15, 20, 31, 0.95)";
        container.cornerRadius = 12; container.thickness = 1; container.color = "rgba(255,255,255,0.1)";
        container.horizontalAlignment = 0; 
        container.alpha = 0;
        container.paddingBottom = "10px";
        this._popupContainer.addControl(container);

        const content = new GUI.StackPanel();
        content.isVertical = false;
        container.addControl(content);

        // Icon Section
        const iconBlock = new GUI.TextBlock();
        iconBlock.text = icon;
        iconBlock.fontSize = 24;
        iconBlock.width = "60px";
        iconBlock.color = color;
        content.addControl(iconBlock);

        // Separator
        const sep = new GUI.Rectangle();
        sep.width = "1px"; sep.height = "30px"; sep.background = "rgba(255,255,255,0.1)"; sep.thickness = 0;
        content.addControl(sep);

        // Text Section
        const textStack = new GUI.StackPanel();
        textStack.isVertical = true;
        textStack.width = "230px";
        textStack.horizontalAlignment = 0;
        textStack.paddingLeft = "15px";
        content.addControl(textStack);

        const title = new GUI.TextBlock();
        title.text = label;
        title.color = "#94a3b8"; 
        title.fontSize = 10; 
        title.fontWeight = "bold";
        title.textHorizontalAlignment = 0;
        title.height = "18px";
        textStack.addControl(title);

        const val = new GUI.TextBlock();
        val.text = value;
        val.color = color; 
        val.fontSize = 15; 
        val.fontWeight = "900";
        val.textHorizontalAlignment = 0;
        val.height = "22px";
        textStack.addControl(val);

        const scene = this._guiTexture.getScene();
        if (!scene) return;

        const animAlpha = new BABYLON.Animation("a", "alpha", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animAlpha.setKeys([{ frame: 0, value: 0 }, { frame: 15, value: 1 }, { frame: 120, value: 1 }, { frame: 150, value: 0 }]);
        
        // Slide UP effect
        container.top = "20px";
        const animTop = new BABYLON.Animation("t", "top", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animTop.setKeys([{ frame: 0, value: 20 }, { frame: 25, value: 0 }]);

        container.animations = [animAlpha, animTop];
        scene.beginAnimation(container, 0, 150, false, 1.0, () => {
            if (this._popupContainer.children.includes(container)) {
                this._popupContainer.removeControl(container);
            }
            container.dispose();
        });
    }

    private nextStep(): void {
        const step = this._currentConversation.find(s => s.id === this._currentStepId);
        
        if (step && step.impact?.action) {
            this.close(step.impact.action, step.next ? String(step.next) : undefined, step.impact);
            return;
        }

        if (step && step.next) {
            const existsInCurrent = this._currentConversation.some(s => s.id == step.next);
            if (existsInCurrent) {
                this._currentStepId = step.next;
                this.displayStep();
            } else {
                const nextConv = DataManager.getInstance().getDialogue(String(step.next));
                if (nextConv) {
                    this.startDialogue(nextConv, this._onComplete || undefined, this._vars);
                } else {
                    this.close();
                }
            }
        } else {
            this.close();
        }
    }

    private close(action?: string, nextDialogueId?: string, actionParams?: any): void {
        this._overlay.isVisible = false;
        if (this._onComplete) this._onComplete(action, nextDialogueId, actionParams);
    }

    private checkHasItem(id: string, qty: number): { has: boolean, name: string } {
        const dm = DataManager.getInstance();
        const cm = ClanManager.getInstance();
        const data = dm.getItemData(id);
        
        if (!data) return { has: false, name: id };
        
        const list = cm.getInventoryByType(data.category);
        const entry = list.find(i => i.itemData.id === id);
        
        return { 
            has: entry ? entry.quantity >= qty : false, 
            name: data.itemName 
        };
    }
}
