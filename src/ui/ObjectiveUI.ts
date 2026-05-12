/**
 * ObjectiveUI.ts - Top-right static objective panel.
 * Displays the current battle goal.
 */
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from './CombatUITheme';

export class ObjectiveUI {
  private root!: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '18px',
      right: '18px',
      zIndex: '200',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      fontFamily: "'Segoe UI', sans-serif",
      transition: 'transform 0.5s ease-in-out, opacity 0.5s ease-in-out',
    });

    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '15px 22px',
      cursor: 'default',
      minWidth: '360px',
    });
    applyNoblePanel(head, true);
    addPanelCorners(head);

    const ico = document.createElement('span');
    ico.textContent = 'M';
    Object.assign(ico.style, {
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: COMBAT_UI.text,
      fontSize: '12px',
      fontWeight: '900',
      background: 'linear-gradient(135deg, #255a91, #7c2630)',
      border: `1px solid ${COMBAT_UI.gold}`,
    });

    const txt = document.createElement('div');
    txt.innerHTML = `<div style="font-size:13px;font-weight:900;color:${COMBAT_UI.goldBright};letter-spacing:.14em;text-transform:uppercase;text-align:center">Mission</div>
                     <div id="obj-current" style="font-size:13px;color:${COMBAT_UI.text};margin-top:4px">-</div>`;

    head.appendChild(ico);
    head.appendChild(txt);
    this.root.appendChild(head);

    document.body.appendChild(this.root);
  }

  setText(missionText: string): void {
    const cur = document.getElementById('obj-current');
    if (cur) {
      cur.textContent = missionText;
      cur.style.whiteSpace = 'normal';
      cur.style.maxWidth = '280px';
      cur.style.lineHeight = '1.4';
    }
  }

  dispose(): void {
    this.root.remove();
  }

  show(): void {
    this.root.style.transform = 'translateX(0)';
    this.root.style.opacity = '1';
  }

  hide(): void {
    this.root.style.transform = 'translateX(150%)';
    this.root.style.opacity = '0';
  }
}
