/**
 * TurnOrderUI.ts — Dark glassmorphism style.
 * Top-center: circular portraits in turn order.
 * Active unit: golden ring + bigger size.
 */
import { Unit } from '../units/Unit';
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from './CombatUITheme';

export class TurnOrderUI {
  private root!:   HTMLElement;
  private circles: HTMLElement[] = [];

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position:'fixed', top:'18px', left:'50%',
      transform:'translateX(-50%)',
      display:'flex', gap:'8px', alignItems:'center',
      zIndex:'200', pointerEvents:'none',
      padding:'11px 28px',
    });
    applyNoblePanel(this.root, true);
    addPanelCorners(this.root);
    document.body.appendChild(this.root);
  }

  setQueue(queue: Unit[], activeIdx: number): void {
    this.root.innerHTML = '';
    this.circles = [];
    queue.forEach((unit, i) => {
      const c = this.makeCircle(unit, i === activeIdx);
      this.root.appendChild(c);
      this.circles.push(c);
    });
  }

  setActive(idx: number): void {
    this.circles.forEach((c, i) => {
      const active = i === idx;
      Object.assign(c.style, {
        width:      active ? '54px' : '38px',
        height:     active ? '54px' : '38px',
        boxShadow:  active ? `0 0 0 3px ${COMBAT_UI.gold}, 0 0 22px rgba(77,163,255,0.42)` : 'none',
        opacity:    active ? '1' : '0.65',
        fontSize:   active ? '20px' : '14px',
        transform:  active ? 'scale(1.0)' : 'scale(0.9)',
      });
    });
  }

  markDead(idx: number): void {
    const c = this.circles[idx];
    if (!c) return;
    c.style.background = '#1e293b';
    c.style.opacity    = '0.30';
    c.style.filter     = 'grayscale(1)';
    c.textContent      = '✕';
  }

  dispose(): void { this.root.remove(); }

  private makeCircle(unit: Unit, isActive: boolean): HTMLElement {
    const c = document.createElement('div');
    Object.assign(c.style, {
      width:          isActive ? '54px' : '38px',
      height:         isActive ? '54px' : '38px',
      borderRadius:   '50%',
      background:     unit.teamColorHex,
      display:        'flex', alignItems:'center', justifyContent:'center',
      fontSize:       isActive ? '20px' : '14px',
      fontWeight:     '900', color:'#fff',
      fontFamily:     "'Segoe UI',sans-serif",
      boxShadow:      isActive
        ? `0 0 0 3px ${COMBAT_UI.gold}, 0 0 22px rgba(77,163,255,0.42)`
        : '0 2px 8px rgba(0,0,0,0.4)',
      opacity:        unit.isDead ? '0.25' : (isActive ? '1' : '0.65'),
      filter:         unit.isDead ? 'grayscale(1)' : 'none',
      transition:     'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      flexShrink:     '0',
      border:         `1px solid ${COMBAT_UI.gold}`,
    });
    c.textContent = unit.name.charAt(0).toUpperCase();
    return c;
  }

  show(): void {
    this.root.style.transform = 'translateX(-50%) translateY(0)';
    this.root.style.opacity   = '1';
  }

  hide(): void {
    this.root.style.transform = 'translateX(-50%) translateY(-150%)';
    this.root.style.opacity   = '0';
  }
}
