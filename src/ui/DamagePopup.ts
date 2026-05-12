/**
 * DamagePopup.ts
 * World-to-Screen UI utility for displaying floating numbers (Damage, Heal, Critical).
 */

import { Scene, Vector3, Matrix } from '@babylonjs/core';

export enum PopupType {
  Damage = 'Damage',
  Heal   = 'Heal',
  Crit   = 'Crit',
  Status = 'Status'
}

export class DamagePopup {
  private container!: HTMLElement;

  constructor() {
    this.container = this.buildContainer();
    document.body.appendChild(this.container);
  }

  private buildContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'damage-popups-root';
    Object.assign(el.style, {
      position: 'fixed', inset: '0',
      pointerEvents: 'none', zIndex: '900',
    });
    return el;
  }

  /** Display a floating number or text above a world position */
  show(worldPos: Vector3, text: string, type: PopupType, scene: Scene): void {
    const engine = scene.getEngine();
    const cam = scene.activeCamera;
    if (!cam) return;

    // Start Exactly at worldPos (centered on target)
    const screenPos = Vector3.Project(
      worldPos,
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );

    const popup = document.createElement('div');
    popup.textContent = (type === PopupType.Crit) ? `💥 ${text}` : text;
    
    const isMiss = text === 'MISS' || text === 'DODGE';
    const startScale = (type === PopupType.Crit) ? 2.5 : 2.0;

    // Scatter to prevent overlap
    const scatterX = (Math.random() - 0.5) * 50; 
    const scatterY = (Math.random() - 0.5) * 40;

    // Base Styles
    Object.assign(popup.style, {
      position: 'fixed',
      left: `${screenPos.x + scatterX}px`,
      top: `${screenPos.y + scatterY}px`, // Start centered with scatter
      transform: `translate(-50%, -50%) scale(${startScale})`,
      fontSize: this.getFontSize(type),
      fontWeight: '900',
      color: isMiss ? '#94a3b8' : this.getColor(type),
      textShadow: this.getShadow(type),
      whiteSpace: 'nowrap',
      fontFamily: "'Segoe UI', sans-serif",
      opacity: '0',
      pointerEvents: 'none',
      letterSpacing: (type === PopupType.Crit) ? '2px' : '0px',
      zIndex: (type === PopupType.Crit) ? '1000' : '900'
    });

    this.container.appendChild(popup);

    // Animation settings
    const duration = (type === PopupType.Crit) ? 1200 : 800;
    const startY = screenPos.y + scatterY;
    const targetY = startY; // Static for all types (fade & shrink only)
    let elapsed = 0;

    const animate = () => {
      elapsed += 16;
      const t = Math.min(elapsed / duration, 1);
      
      // No movement calculation needed since startY == targetY
      const currY = startY;
      
      // Opacity: Quick fade in, then slow fade out
      const currOpacity = t < 0.15 ? (t / 0.15) : (1 - (t - 0.15) / 0.85);
      
      // Scale: start big, shrink to normal (or slightly smaller)
      const scaleEase = 1 - Math.pow(1 - t, 2);
      const currScale = startScale - (startScale - 1.0) * scaleEase;

      popup.style.left = `${screenPos.x + scatterX}px`;
      popup.style.top = `${currY}px`;
      popup.style.opacity = `${currOpacity}`;
      popup.style.transform = `translate(-50%, -50%) scale(${currScale})`;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        popup.remove();
      }
    };

    requestAnimationFrame(animate);
  }

  private getColor(type: PopupType): string {
    switch (type) {
      case PopupType.Damage: return '#ffffff';
      case PopupType.Heal:   return '#4ade80';
      case PopupType.Crit:   return '#f87171';
      case PopupType.Status: return '#c084fc';
      default: return '#fff';
    }
  }

  private getFontSize(type: PopupType): string {
    switch (type) {
      case PopupType.Damage: return '24px';
      case PopupType.Heal:   return '24px';
      case PopupType.Crit:   return '42px';
      case PopupType.Status: return '20px';
      default: return '24px';
    }
  }

  private getShadow(type: PopupType): string {
    const color = (type === PopupType.Crit) ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0,0,0,0.5)';
    return `0 4px 12px ${color}`;
  }
}
