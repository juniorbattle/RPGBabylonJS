/**
 * CombatStageManager.ts
 * Manages cinematic sequencing for skills and AOE.
 * 
 * Flow (Refined):
 * 1. Global Fade Out of units + Hide UI.
 * 2. Focus Camera on Caster -> Fade In Caster + Show Action Title.
 * 3. Prep Delay.
 * 4. Slide to Targets + Fade Out Caster (Immersion) + Fade In Targets.
 * 5. Resolve action (popups, DMG).
 * 6. Restore normal view + Global Fade In + Restore UI.
 */

import { Vector3, Scene, Color3 } from '@babylonjs/core';
import { Unit }           from '../units/Unit';
import { TacticalCamera } from '../camera/TacticalCamera';
import { ActData }        from '../data/types/ActData';
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from '../ui/CombatUITheme';

interface CinematicHooks {
    setDepthMode?: (enabled: boolean) => void;
    setPostMode?: (enabled: boolean) => void;
}

export class CombatStageManager {

    private scene: Scene;
    private camera: TacticalCamera;
    private savedCamState: any = null;
    private hooks: CinematicHooks = {};

    // UI Title banner
    private titleEl: HTMLElement;
    private titleTextEl: HTMLElement;

    constructor(scene: Scene, camera: TacticalCamera, hooks: CinematicHooks = {}) {
        this.scene = scene;
        this.camera = camera;
        this.hooks = hooks;
        this.titleEl = this.buildTitleElement();
        this.titleTextEl = this.titleEl.querySelector('.combat-stage-title-text') as HTMLElement;
    }

    public setCinematicHooks(hooks: CinematicHooks): void {
        this.hooks = hooks;
    }

    private buildTitleElement(): HTMLElement {
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'fixed', top: '24px', left: '50%', // ◄ Higher, similar to TurnOrder
            transform: 'translateX(-50%) translateY(-50px) scale(0.8)',
            zIndex: '300', pointerEvents: 'none',
            opacity: '0', transition: 'all 0.6s cubic-bezier(0.19, 1, 0.22, 1)',
            minWidth: '430px',
            padding: '15px 70px',
            color: COMBAT_UI.text,
            fontFamily: "'Segoe UI', sans-serif",
            textAlign: 'center',
        });
        applyNoblePanel(el, true);
        addPanelCorners(el);

        const text = document.createElement('div');
        text.className = 'combat-stage-title-text';
        Object.assign(text.style, {
            color: '#fff',
            fontSize: '28px',
            fontWeight: '900',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            textShadow: '0 0 10px rgba(255,255,255,0.5), 0 0 22px rgba(202,164,90,0.30)',
        });
        el.appendChild(text);

        const rule = document.createElement('div');
        Object.assign(rule.style, {
            width: '58%',
            height: '1px',
            margin: '9px auto 0',
            background: 'linear-gradient(90deg, transparent, rgba(202,164,90,0.82), transparent)',
        });
        el.appendChild(rule);
        document.body.appendChild(el);
        return el;
    }

    /**
     * Executes the AOE cinematic sequence with Smooth Fades and UI handling
     */
    async playAOESequence(
        caster: Unit, 
        targets: Unit[], 
        allUnits: Unit[],
        action: ActData,
        uiElements: { hud?: any, turnOrder?: any, actionBar?: any, objectives?: any, log?: any, status?: any },
        onActionResolve: () => Promise<void>
    ): Promise<void> {
        const isHeal = action.typeAction === 'HEAL' || action.typeAction === 'BUFF';
        const flashColor = isHeal ? new Color3(0.2, 0.8, 0.3) : new Color3(1, 0, 0); // Green for heal, Red for dmg
        console.log(`🎭 Cinematic Stage: ${caster.name} using ${action.nameAct}`);

        // 1. Initial State: Save Camera, Global Fade Out & Hide All Icons
        this.savedCamState = this.camera.getCurrentState();
        this.camera.disableFollow();
        this.hooks.setDepthMode?.(true);
        this.hooks.setPostMode?.(true);

        // ◄ Hide All UI elements
        uiElements.hud?.hide();
        uiElements.turnOrder?.hide();
        uiElements.actionBar?.hide();
        uiElements.objectives?.hide();
        
        // Hide status pill if provided, else selective CSS hide
        const statusEl = document.querySelector('.combat-status-pill') as HTMLElement;
        if (statusEl) {
            statusEl.style.transition = 'opacity 0.4s ease';
            statusEl.style.opacity = '0';
        }
        
        // Hide log/tour bar
        const logEl = document.querySelector('.combat-log-container') as HTMLElement;
        if (logEl) {
            logEl.style.transition = 'opacity 0.4s ease';
            logEl.style.opacity = '0';
        }

        // Sequential Fade Out of all units AND hide their icons
        await Promise.all(allUnits.map(u => {
            u.hideActionIcon();
            return u.fadeVisible(false, 0.2);
        }));

        // 2. Focus on Caster
        const casterPos = caster.worldPosition;
        this.camera.snapToPosition(casterPos, 45); // Snap near the caster first
        
        // Show Action Title
        this.titleTextEl.textContent = action.nameAct;
        this.titleEl.style.opacity = '1';
        this.titleEl.style.transform = 'translateX(-50%) translateY(0) scale(1.0)';

        await caster.fadeVisible(true, 0.35);
        await this.delay(700); // ◄ Prep time

        // 3. Focus on Targets (Cross-fade Immersion)
        let targetCenter = Vector3.Zero();
        if (targets.length > 0) {
            for (const t of targets) targetCenter.addInPlace(t.worldPosition);
            targetCenter.scaleInPlace(1 / targets.length);
        } else {
            targetCenter = casterPos;
        }

        const isAOE = targets.length > 1;
        const isSelfTargetOnly = targets.length === 1 && targets[0] === caster;

        // ANIMATION: Slide Camera (using Stage variables) + Fade Out Caster + Fade In Targets
        // NOTE: Title stays ACTIVE during the whole stage as requested

        const anims: Promise<any>[] = [
            this.camera.slideToStage(targetCenter, isAOE, 0.5)
        ];

        // Only fade out caster if he's NOT the only target
        if (!isSelfTargetOnly) {
            anims.push(caster.fadeVisible(false, 0.3));
        }

        // Fade in targets (excluding caster if he's already visible)
        targets.forEach(t => {
            t.hideActionIcon(); // Safety
            if (t !== caster || !isSelfTargetOnly) {
                anims.push(t.fadeVisible(true, 0.4));
            }
        });

        await Promise.all(anims);
        
        await this.delay(100);

        // 4. Resolve the logic (popups, DMG, animations...)
        const casterActionAnim = isHeal
            ? caster.playCastAnimation()
            : caster.playAttackAnimation();

        // Parallel: Caster action + Damage Calculation/Popups + Hit Flashing
        await Promise.all([
            casterActionAnim,
            onActionResolve(),
            ...targets.map(t => t.flashColor(flashColor, 1.0)) // ◄ Flashing targets for hit feedback
        ]);

        await this.delay(800); // ◄ Final poses

        // 5. Restore World (Global Fade In) & Restore UI
        this.titleEl.style.opacity = '0'; // ◄ Hide title before restoring normal view
        this.titleEl.style.transform = 'translateX(-50%) translateY(-20px) scale(0.9)';

        await Promise.all(allUnits.map(u => u.fadeVisible(true, 0.4)));
        
        // ◄ Restore UI
        uiElements.hud?.show();
        uiElements.turnOrder?.show();
        uiElements.objectives?.show();
        if (logEl) logEl.style.opacity = '1';
        const statusElRestore = document.querySelector('.combat-status-pill') as HTMLElement;
        if (statusElRestore) statusElRestore.style.opacity = '1';

        await this.camera.restoreState(this.savedCamState, 0.5);
        this.camera.enableFollow();
        this.hooks.setDepthMode?.(false);
        this.hooks.setPostMode?.(false);
        
        console.log("🎭 Cinematic Stage: Finished");
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
