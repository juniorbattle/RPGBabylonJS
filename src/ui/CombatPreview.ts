/**
 * CombatPreview.ts
 * Horizontal floating popup (Bottom-Center) showing Caster → Action → Targets.
 * Design inspired by modern tactical RPGs with glassmorphism.
 */
import { Unit }    from '../units/Unit';
import { ActData, TypeAction } from '../data/types/ActData';
import { COMBAT_UI } from './CombatUITheme';

export class CombatPreview {
  private root!: HTMLElement;
  private visible = false;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position:'fixed', top:'10px', left:'50%',
      transform:'translateX(-50%) translateY(100px)',
      zIndex:'250', pointerEvents:'none',
      opacity:'0', transition:'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)',
      fontFamily:"'Segoe UI',sans-serif",
    });
    document.body.appendChild(this.root);
  }

  show(attacker: Unit, targetUnits: Unit[], action: ActData): void {
    const isHeal = action.typeAction === TypeAction.HEAL || action.typeAction === TypeAction.BUFF;
    const accentColor = isHeal ? '#4ade80' : '#f87171'; // Green for heal/buff, Red for damage

    // Helper: Build unit card HTML
    const makeUnitCard = (u: Unit, role: string, color: string) => {
      const hp = u.status.currentHealth;
      const maxHp = u.status.unit.baseStats.maxHealth;
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      const barColor = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';

      return `
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; min-width:80px;">
        <div style="
          width:42px; height:42px; border-radius:12px; background:${u.teamColorHex};
          display:flex; align-items:center; justify-content:center;
          font-size:18px; font-weight:900; color:#fff;
          border:2px solid rgba(255,255,255,0.2);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">${u.name[0]}</div>
        <div style="display:flex; flex-direction:column; align-items:center; width:100%;">
          <span style="font-size:7px; font-weight:800; color:${color}; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:2px;">${role}</span>
          <span style="font-size:11px; font-weight:700; color:#f1f5f9; white-space:nowrap; margin-bottom:4px;">${u.name}</span>
          <!-- HP Bar -->
          <div style="width:50px; height:4px; background:rgba(0,0,0,0.4); border-radius:99px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
            <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:99px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      </div>
    `;};

    const targetsHtml = targetUnits.length > 0 
        ? targetUnits.map(t => makeUnitCard(t, 'Cible', accentColor)).join('<div style="width:1px; height:20px; background:rgba(255,255,255,0.1); margin:0 4px; align-self:center;"></div>')
        : `<div style="min-width:80px; text-align:center; opacity:0.4; font-size:10px; color:#fff; font-style:italic;">Aucune cible</div>`;

    this.root.innerHTML = `
      <div style="
        background:${COMBAT_UI.panelBackground};
        backdrop-filter:blur(24px);
        border:${COMBAT_UI.panelBorder};
        border-radius:8px;
        padding:16px 32px;
        display:flex; align-items:center; gap:20px;
        box-shadow:${COMBAT_UI.panelShadowStrong};
        position:relative; overflow:hidden;
      ">
        <span style="position:absolute;top:5px;left:5px;width:14px;height:14px;border:1px solid ${COMBAT_UI.gold};border-right:0;border-bottom:0;opacity:.82"></span>
        <span style="position:absolute;top:5px;right:5px;width:14px;height:14px;border:1px solid ${COMBAT_UI.gold};border-left:0;border-bottom:0;opacity:.82"></span>
        <span style="position:absolute;bottom:5px;left:5px;width:14px;height:14px;border:1px solid ${COMBAT_UI.gold};border-right:0;border-top:0;opacity:.82"></span>
        <span style="position:absolute;bottom:5px;right:5px;width:14px;height:14px;border:1px solid ${COMBAT_UI.gold};border-left:0;border-top:0;opacity:.82"></span>
        <!-- Glow accent -->
        <div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 50%, ${accentColor}15, transparent); pointer-events:none"></div>

        <!-- Section: Caster -->
        ${makeUnitCard(attacker, 'Lanceur', '#60a5fa')}

        <!-- Section: Action Center -->
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:0 8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="height:1px; width:30px; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.25));"></div>
            <div style="
              width:38px; height:38px; border-radius:50%;
              background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
              display:flex; align-items:center; justify-content:center; font-size:18px;
              color:${accentColor};
            ">${this.getActionIcon(action)}</div>
            <div style="height:1px; width:30px; background:linear-gradient(90deg, rgba(255,255,255,0.25), transparent);"></div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center;">
             <span style="font-size:10px; font-weight:800; color:${accentColor}; text-transform:uppercase; letter-spacing:0.15em;">${action.nameAct}</span>
             <span style="font-size:12px; color:rgba(255,255,255,0.3); margin-top:-2px;">→</span>
          </div>
        </div>

        <!-- Section: Targets -->
        <div style="display:flex; gap:12px; max-width:400px; overflow-x:auto; padding-bottom:2px;">
            ${targetsHtml}
        </div>
      </div>`;

    this.visible = true;
    this.root.style.opacity   = '1';
    this.root.style.transform = 'translateX(-50%) translateY(0) scale(1)';
  }

  private getActionIcon(action: ActData): string {
      switch(action.typeAction) {
          case TypeAction.HEAL: return '✚';
          case TypeAction.BUFF: return '🛡️';
          case TypeAction.EFFECT: return '✨';
          default: return '⚔️';
      }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.style.opacity   = '0';
    this.root.style.transform = 'translateX(-50%) translateY(40px) scale(0.95)';
  }

  dispose(): void { this.root.remove(); }
}
