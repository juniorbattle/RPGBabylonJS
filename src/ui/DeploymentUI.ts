/**
 * DeploymentUI.ts
 * Interface for pre-combat unit selection and deployment.
 */

import { UnitData } from '../data/types/UnitData';
import { ClanManager } from '../data/ClanManager';
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from './CombatUITheme';

export interface DeploymentCallbacks {
  onUnitSelect: (unit: UnitData | null) => void;
  onStartCombat: () => void;
}

export class DeploymentUI {
  private root: HTMLElement;
  private listContainer: HTMLElement;
  private startButton: HTMLButtonElement;
  private countText: HTMLElement;
  
  private callbacks: DeploymentCallbacks;
  private slots: Map<string, HTMLElement> = new Map();
  private selectedId: string | null = null;

  // Pagination
  private pageIndex: number = 0;
  private readonly pageSize: number = 4; // Display 4 units (max roster size typically)

  // State Cache
  private lastDeployedIds: Set<string> = new Set();
  private lastCurrent = 0;
  private lastMax = 4;

  constructor(callbacks: DeploymentCallbacks) {
    this.callbacks = callbacks;
    
    // Root container
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', bottom: '12px', left: '12px', // Force anchor to Bottom-Left
      transform: 'translateX(0)', 
      width: '280px', padding: '16px', // Much narrower and slightly smaller padding
      display: 'flex', flexDirection: 'column', gap: '12px',
      zIndex: '500', transition: 'all 0.4s ease',
    });
    applyNoblePanel(this.root, true);
    addPanelCorners(this.root);

    // Header (Counter + Title)
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '5px';
    
    const title = document.createElement('div');
    title.textContent = 'DÉPLOIEMENT'; // Shorter text for narrower container
    title.style.color = COMBAT_UI.goldBright;
    title.style.fontWeight = '900';
    title.style.fontSize = '13px';
    title.style.letterSpacing = '0.12em';
    title.style.textTransform = 'uppercase';
    
    this.countText = document.createElement('div');
    Object.assign(this.countText.style, {
      color: '#cbd5e1', fontSize: '12px', background: 'rgba(255,255,255,0.05)',
      padding: '4px 10px', borderRadius: '4px', fontWeight: '800',
      border: '1px solid rgba(202,164,90,0.26)'
    });
    this.countText.textContent = '0 / 4';
    
    header.appendChild(title);
    header.appendChild(this.countText);
    this.root.appendChild(header);

    // List Wrapper (Arrows + List)
    const listWrapper = document.createElement('div');
    Object.assign(listWrapper.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
    });

    // Left Arrow
    const leftArrow = this.createArrow('◀', () => this.prevPage());
    listWrapper.appendChild(leftArrow);

    // Unit List Container (2x2 Grid)
    this.listContainer = document.createElement('div');
    Object.assign(this.listContainer.style, {
      display: 'grid', 
      gridTemplateColumns: 'repeat(2, 1fr)', // 2 columns
      gap: '8px', 
      padding: '4px',
      flex: 1, 
      justifyItems: 'center'
    });
    listWrapper.appendChild(this.listContainer);

    // Right Arrow
    const rightArrow = this.createArrow('▶', () => this.nextPage());
    listWrapper.appendChild(rightArrow);

    this.root.appendChild(listWrapper);

    // Footer (Action Button)
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'LANCER LE COMBAT';
    Object.assign(this.startButton.style, {
      width: '100%', padding: '14px', borderRadius: '8px',
      background: 'linear-gradient(180deg, rgba(36,80,145,0.96), rgba(24,50,98,0.96))', 
      color: COMBAT_UI.text, border: COMBAT_UI.panelBorderSoft,
      fontWeight: '800', fontSize: '13px', letterSpacing: '0.05em',
      cursor: 'pointer', transition: 'all 0.2s',
      marginTop: '5px', opacity: '0.5',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)'
    });
    this.startButton.disabled = true;
    
    this.startButton.onmouseenter = () => { if(!this.startButton.disabled) this.startButton.style.transform = 'translateY(-2px)'; };
    this.startButton.onmouseleave = () => { if(!this.startButton.disabled) this.startButton.style.transform = 'translateY(0)'; };
    
    this.startButton.onclick = () => this.callbacks.onStartCombat();
    this.root.appendChild(this.startButton);

    document.body.appendChild(this.root);
    this.refresh();
  }

  private createArrow(text: string, onClick: () => void): HTMLElement {
      const btn = document.createElement('div');
      btn.textContent = text;
      Object.assign(btn.style, {
          cursor: 'pointer', fontSize: '18px', color: COMBAT_UI.textMuted,
          width: '32px', height: '32px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(13,20,34,0.82)',
          border: '1px solid rgba(202,164,90,0.26)',
          transition: 'all 0.2s ease', userSelect: 'none'
      });
      btn.onmouseenter = () => { 
          btn.style.color = '#fff'; 
          btn.style.background = 'rgba(20,48,84,0.96)';
          btn.style.borderColor = 'rgba(77,163,255,0.75)';
          btn.style.transform = 'scale(1.1)'; 
      };
      btn.onmouseleave = () => { 
          btn.style.color = COMBAT_UI.textMuted; 
          btn.style.background = 'rgba(13,20,34,0.82)';
          btn.style.borderColor = 'rgba(202,164,90,0.26)';
          btn.style.transform = 'scale(1)'; 
      };
      btn.onclick = onClick;
      return btn;
  }

  private prevPage(): void {
      if (this.pageIndex > 0) {
          this.pageIndex--;
          this.refresh();
      }
  }

  private nextPage(): void {
      const clan = ClanManager.getInstance();
      const total = clan.getAllUnits().length;
      if ((this.pageIndex + 1) * this.pageSize < total) {
          this.pageIndex++;
          this.refresh();
      }
  }

  public refresh(): void {
    const clan = ClanManager.getInstance();
    const allUnits = clan.getAllUnits();
    
    // Clamp page index
    const maxPage = Math.max(0, Math.ceil(allUnits.length / this.pageSize) - 1);
    if (this.pageIndex > maxPage) this.pageIndex = maxPage;

    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    const visibleUnits = allUnits.slice(start, end);
    
    this.listContainer.innerHTML = '';
    this.slots.clear(); // Only specific to current page slots logic in visual update, but we rebuild anyway

    visibleUnits.forEach(unit => {
      const slot = document.createElement('div');
      Object.assign(slot.style, {
        width: '100%', height: '80px', // Adjusted height for 2x2 grid
        background: 'rgba(13,20,34,0.62)', borderRadius: '8px',
        border: '1px solid rgba(202,164,90,0.20)', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '4px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      });

      const icon = document.createElement('div');
      icon.textContent = unit.unitName.charAt(0);
      Object.assign(icon.style, {
        width: '32px', height: '32px', borderRadius: '8px', // Slightly smaller icon
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: '900', fontSize: '16px', color: '#fff',
        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
        border: `1px solid ${COMBAT_UI.gold}`
      });

      const name = document.createElement('div');
      name.textContent = unit.unitName.split(' ')[0]; // Show first name only for space
      Object.assign(name.style, {
        fontSize: '10px', fontWeight: '800', color: COMBAT_UI.text,
        textAlign: 'center', marginTop: '2px',
        textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '70px'
      });

      const lvl = document.createElement('div');
      lvl.textContent = `LVL ${unit.level.currentLevel}`;
      Object.assign(lvl.style, {
          fontSize: '9px', color: COMBAT_UI.textMuted, fontWeight: '700'
      });

      slot.appendChild(icon);
      slot.appendChild(name);
      slot.appendChild(lvl);
      
      slot.onmouseenter = () => { slot.style.transform = 'translateY(-3px)'; };
      slot.onmouseleave = () => { slot.style.transform = 'translateY(0)'; };

      slot.onclick = () => {
        // Toggle if same clicked
        if (this.selectedId === unit.id) {
          this.selectedId = null;
          this.updateVisuals();
          this.callbacks.onUnitSelect(null);
          return;
        } else {
          this.selectedId = unit.id;
        }
        
        this.updateVisuals();
        this.callbacks.onUnitSelect(unit);
      };

      this.listContainer.appendChild(slot);
      this.slots.set(unit.id, slot);
    });
    
    // Fill empty slots if page not full to keep grid layout 2x2 stable
    const emptyCount = this.pageSize - visibleUnits.length;
    for(let i=0; i<emptyCount; i++) {
        const empty = document.createElement('div');
        Object.assign(empty.style, {
            width: '100%', height: '80px',
            background: 'rgba(255, 255, 255, 0.01)', borderRadius: '8px',
            border: '1px dashed rgba(202,164,90,0.14)',
        });
        this.listContainer.appendChild(empty);
    }

    this.updateVisuals();
    // Restore visual status for deployed units on this page
    this.updateStatus(this.lastCurrent, this.lastMax, this.lastDeployedIds);
  }

  public updateStatus(current: number, max: number, deployedIds: Set<string>): void {
    // Cache state
    this.lastCurrent = current;
    this.lastMax = max;
    this.lastDeployedIds = deployedIds;

    this.countText.textContent = `${current} / ${max}`;
    this.countText.style.color = current === max ? '#4ade80' : COMBAT_UI.text;
    
    this.startButton.disabled = current === 0;
    this.startButton.style.opacity = current === 0 ? '0.5' : '1';
    
    // Update visual state of slots (deployed check)
    // IMPORTANT: Only updates CURRENT PAGE slots. If a deployed unit is on another page, no visual update needed there.
    this.slots.forEach((el, id) => {
        if (deployedIds.has(id)) {
            el.style.opacity = '0.4';
            el.style.filter = 'grayscale(100%)';
            // Add a status indicator?
            const existingBadge = el.querySelector('.deployed-badge');
            if (!existingBadge) {
                const badge = document.createElement('div');
                badge.className = 'deployed-badge';
                badge.textContent = 'EN JEU';
                Object.assign(badge.style, {
                    position: 'absolute', bottom: '8px', fontSize: '8px',
                    background: '#22c55e', color: '#fff', padding: '2px 6px',
                    borderRadius: '4px', fontWeight: 'bold'
                });
                el.style.position = 'relative'; // Ensure positioning
                el.appendChild(badge);
            }
        } else {
            el.style.opacity = '1';
            el.style.filter = 'none';
            const badge = el.querySelector('.deployed-badge');
            if(badge) badge.remove();
        }
    });
  }

  private updateVisuals(): void {
    this.slots.forEach((el, id) => {
      // Highlight selected
      if (id === this.selectedId) {
          el.style.borderColor = COMBAT_UI.goldBright;
          el.style.background = 'rgba(202,164,90,0.16)';
          el.style.boxShadow = '0 0 0 1px rgba(202,164,90,0.20), 0 0 18px rgba(202,164,90,0.14)';
      } else {
          el.style.borderColor = 'rgba(202,164,90,0.20)';
          el.style.background = 'rgba(13,20,34,0.62)';
          el.style.boxShadow = 'none';
      }
    });
    
    // Re-apply deployed status if needed (refresh clears styles)
    // We need cached deployedIds? No, usually called by updateStatus externally.
    // Ideally we should cache deployedIds in DeploymentUI to re-apply on page change.
    // But updateStatus is called by CombatManager logic frequently?
    // Let's assume on page change we might lose "deployed" visual until next updateStatus.
    // To fix, CombatManager calls updateStatus whenever we select/deselect.
    // But page change doesn't trigger CombatManager update.
    // I should store deployedIds locally.
  }

  // Helper to persist deployed state across pages
  public clearSelection(): void {
    this.selectedId = null;
    this.updateVisuals();
  }

  public selectUnit(unitId: string | null): void {
    this.selectedId = unitId;
    this.updateVisuals();
  }
  
  public updateDeploymentCache(deployedIds: Set<string>): void {
      this.lastDeployedIds = deployedIds;
      this.updateStatus(deployedIds.size, 4, deployedIds); // 4 is hardcoded max in manager, passed here?
      // updateStatus signature is (current, max, set).
      // I will modify updateStatus to store local cache.
  }

  public hide(): void {
    this.root.style.transform = 'translate(-120%, 0)'; // Slide off to the left cleanly
    this.root.style.opacity = '0';
  }

  public show(): void {
    this.root.style.transform = 'translate(0, 0)';
    this.root.style.opacity = '1';
  }

  public dispose(): void {
    this.root.remove();
  }
}
