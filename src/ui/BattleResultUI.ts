/**
 * BattleResultUI.ts
 * Overlay panel displaying combat rewards, XP gain, and summary.
 */

import { Unit } from '../units/Unit';
import { InventoryItem } from '../data/types/ItemData';

export interface BattleRewards {
  gold: number;
  xpPerUnit: number;
  items: InventoryItem[];
  turnsTaken: number;
  victoriesCount: number;
}

export class BattleResultUI {
  private root!: HTMLElement;

  constructor() {
    this.root = this.buildRoot();
    document.body.appendChild(this.root);
  }

  private buildRoot(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(12px)',
      zIndex: '1000',
      display: 'none',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', sans-serif",
      opacity: '0', transition: 'opacity 0.5s ease',
    });
    return el;
  }

  showVictory(rewards: BattleRewards, clanUnits: { name: string, level: number, xpPercent: number, gainedXP: number }[], onDismiss: () => void): void {
    this.root.innerHTML = '';
    
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '500px', background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(74, 222, 128, 0.3)',
      borderRadius: '24px', padding: '32px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      color: '#f1f5f9', textAlign: 'center',
    });

    const title = document.createElement('h1');
    title.textContent = 'VICTOIRE';
    Object.assign(title.style, {
      fontSize: '42px', fontWeight: '900', color: '#4ade80',
      margin: '0 0 8px 0', letterSpacing: '4px', textShadow: '0 0 20px rgba(74, 222, 128, 0.4)',
    });

    const sub = document.createElement('div');
    sub.textContent = `Combat terminé en ${rewards.turnsTaken} tours`;
    sub.style.fontSize = '12px'; sub.style.color = '#94a3b8'; sub.style.marginBottom = '24px';

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px',
    });

    const goldBox = this.makeStatBox('OR GAGNÉ', `+${rewards.gold} 🪙`, '#fbbf24');
    const victoriesBox = this.makeStatBox('TOTAL VICTOIRES', `${rewards.victoriesCount} 🏆`, '#38bdf8');

    grid.appendChild(goldBox); grid.appendChild(victoriesBox);

    // XP List
    const xpTitle = document.createElement('div');
    xpTitle.textContent = 'XP DU CLAN';
    Object.assign(xpTitle.style, {
      textAlign: 'left', fontSize: '11px', fontWeight: '800', color: '#64748b',
      marginBottom: '12px', letterSpacing: '1px',
    });

    const xpContainer = document.createElement('div');
    Object.assign(xpContainer.style, {
      maxHeight: '200px', overflowY: 'auto', textAlign: 'left',
      paddingRight: '8px', marginBottom: '32px',
    });

    clanUnits.forEach(u => {
      xpContainer.appendChild(this.makeXPBar(u.name, u.level, u.xpPercent, u.gainedXP));
    });

    // Items list if any
    let itemsTitle: HTMLElement | null = null;
    let itemsDiv: HTMLElement | null = null;
    if (rewards.items.length > 0) {
      itemsTitle = document.createElement('div');
      itemsTitle.textContent = 'OBJETS OBTENUS';
      Object.assign(itemsTitle.style, {
        textAlign: 'left', fontSize: '11px', fontWeight: '800', color: '#64748b',
        marginBottom: '12px', letterSpacing: '1px',
      });
      
      itemsDiv = document.createElement('div');
      Object.assign(itemsDiv.style, {
        display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '32px',
      });
      rewards.items.forEach(it => {
        const span = document.createElement('span');
        Object.assign(span.style, {
          background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '8px',
          fontSize: '11px', border: '1px solid rgba(255,255,255,0.1)',
        });
        span.textContent = `${it.itemData.iconKey || '📦'} ${it.itemData.itemName} x${it.quantity}`;
        itemsDiv!.appendChild(span);
      });
    }

    const btn = document.createElement('button');
    btn.textContent = 'CONTINUER';
    Object.assign(btn.style, {
      width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
      background: '#4ade80', color: '#020617', fontWeight: '800', cursor: 'pointer',
      fontSize: '14px', transition: 'transform 0.2s',
    });
    btn.onclick = () => { onDismiss(); this.hide(); };

    panel.appendChild(title); panel.appendChild(sub); panel.appendChild(grid);
    panel.appendChild(xpTitle); panel.appendChild(xpContainer);
    if (itemsTitle) panel.appendChild(itemsTitle);
    if (itemsDiv) panel.appendChild(itemsDiv);
    panel.appendChild(btn);

    this.root.appendChild(panel);
    this.show();
  }

  showGameOver(onRetry: () => void): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      textAlign: 'center', color: '#f1f5f9',
    });

    const title = document.createElement('h1');
    title.textContent = 'GAME OVER';
    Object.assign(title.style, {
      fontSize: '64px', fontWeight: '900', color: '#ef4444',
      margin: '0 0 16px 0', letterSpacing: '8px', textShadow: '0 0 30px rgba(239, 68, 68, 0.5)',
    });

    const sub = document.createElement('p');
    sub.textContent = 'Votre clan a été terrassé au combat.';
    sub.style.color = '#94a3b8'; sub.style.marginBottom = '48px';

    const btn = document.createElement('button');
    btn.textContent = 'RETOUR À LA CARTE';
    Object.assign(btn.style, {
      padding: '16px 48px', borderRadius: '99px', border: '2px solid #ef4444',
      background: 'transparent', color: '#ef4444', fontWeight: '800', cursor: 'pointer',
      fontSize: '14px', transition: 'all 0.3s',
    });
    btn.onclick = () => { onRetry(); this.hide(); };
    btn.onmouseenter = () => { btn.style.background = '#ef4444'; btn.style.color = '#020617'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = '#ef4444'; };

    panel.appendChild(title); panel.appendChild(sub); panel.appendChild(btn);
    this.root.appendChild(panel);
    this.show();
  }

  private makeStatBox(label: string, value: string, color: string): HTMLElement {
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.05)',
    });
    const l = document.createElement('div');
    l.textContent = label;
    Object.assign(l.style, { fontSize: '10px', fontWeight: '700', color: '#64748b', marginBottom: '4px' });
    const v = document.createElement('div');
    v.textContent = value;
    Object.assign(v.style, { fontSize: '18px', fontWeight: '800', color: color });
    box.appendChild(l); box.appendChild(v);
    return box;
  }

  private makeXPBar(name: string, level: number, percent: number, gained: number): HTMLElement {
    const row = document.createElement('div');
    row.style.marginBottom = '12px';

    const info = document.createElement('div');
    Object.assign(info.style, { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' });
    info.innerHTML = `<span>${name} <span style="color:#64748b">Lv.${level}</span></span> <span style="color:#4ade80">+${gained} XP</span>`;

    const barBg = document.createElement('div');
    Object.assign(barBg.style, { width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' });
    const barFill = document.createElement('div');
    Object.assign(barFill.style, { width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 1s ease-out' });

    barBg.appendChild(barFill); row.appendChild(info); row.appendChild(barBg);
    return row;
  }

  private show(): void {
    this.root.style.display = 'flex';
    setTimeout(() => { this.root.style.opacity = '1'; }, 10);
  }

  hide(): void {
    this.root.style.opacity = '0';
    setTimeout(() => { this.root.style.display = 'none'; }, 500);
  }

  dispose(): void {
    this.root.remove();
  }
}
