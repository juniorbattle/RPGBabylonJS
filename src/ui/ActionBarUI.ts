/**
 * ActionBarUI.ts
 * Bottom-center action bar — dark glassmorphism style.
 *
 * Dynamic structure per turn:
 *   [🔗 Move] [⚔ Weapon1] [🏹 Weapon2?] [⚡ Skills] [ℹ Details] [⏳ Wait]
 *
 * - Weapon buttons are generated from the unit's weapons array (1 or 2)
 * - Weapon actions cost 0 AP but once used (or skill used) → lockWeaponAndSkills()
 * - Skills popup is embedded (replaces SkillMenuUI for display)
 */

import { ActData, TypeAction } from '../data/types/ActData';
import { WeaponData }          from '../data/types/UnitData';
import { InventoryItem, ItemData } from '../data/types/ItemData';
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from './CombatUITheme';

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface ActionBarCallbacks {
  onMove:    () => void;
  onUndoMove: () => void;
  onWeapon:  (weaponIndex: number, weapon: WeaponData) => void;
  onSkills:  () => void;
  onItems:   () => void;
  onInfo:    () => void;
  onWait:    () => void;
}

export type OnSkillSelected = (skill: ActData) => void;
export type OnSkillClosed   = () => void;

export type OnItemSelected  = (item: InventoryItem) => void;
export type OnItemClosed   = () => void;

// ─── Weapon icons by weapon type ─────────────────────────────────────────────

const ACTION_ICONS: Partial<Record<TypeAction, string>> = {
  [TypeAction.DAMAGE]: '⚔️',
  [TypeAction.HEAL]:   '✚',
  [TypeAction.EFFECT]: '✨',
};

// ─── ActionBarUI ─────────────────────────────────────────────────────────────

export class ActionBarUI {

  private root!:         HTMLElement;
  private bar!:          HTMLElement;  // inner flex row of circles
  private skillPopup!:   HTMLElement;
  private itemPopup!:    HTMLElement;
  private targetPrompt!: HTMLElement;
  private tooltipEl!:    HTMLElement;

  // Stable element refs (fixed buttons)
  private moveCircle!:   HTMLElement;
  private skillCircle!:  HTMLElement;
  private itemCircle!:   HTMLElement;
  private infoCircle!:   HTMLElement;
  private waitCircle!:   HTMLElement;
  private weaponSlot!:   HTMLElement; // container for dynamic weapon circles

  // Tracking
  private weaponCircles: HTMLElement[] = [];
  private btnEls: Map<string, HTMLElement> = new Map(); // key → circle
  private cbs: ActionBarCallbacks;

  // Skill & Item popup state
  private skillCallback?:      OnSkillSelected;
  private skillCloseCallback?: OnSkillClosed;

  private itemCallback?:       OnItemSelected;
  private itemCloseCallback?:  OnItemClosed;
  private skillEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private itemEscHandler: ((e: KeyboardEvent) => void) | null = null;

  // Pagination
  private itemPage = 0;
  private itemPageSize = 4;
  private currentItems: InventoryItem[] = [];

  constructor(callbacks: ActionBarCallbacks) {
    this.cbs  = callbacks;
    this.root = this.buildRoot();
    document.body.appendChild(this.root);
    this.hide();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  private buildRoot(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.id = 'action-bar-root';
    Object.assign(wrap.style, {
      position:      'fixed', bottom:'24px', left:'50%',
      transform:     'translateX(-50%) translateY(120px)',
      display:       'flex', flexDirection:'column', alignItems:'center', gap:'8px',
      zIndex:        '300',
      transition:    'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
      opacity:       '0',
    });

    // Yellow target prompt
    this.targetPrompt = document.createElement('div');
    Object.assign(this.targetPrompt.style, {
      color:COMBAT_UI.text, fontSize:'12px', fontWeight:'800', padding:'10px 44px',
      display:'none', whiteSpace:'nowrap', textTransform:'uppercase',
      letterSpacing:'0.08em',
    });
    applyNoblePanel(this.targetPrompt, true);
    addPanelCorners(this.targetPrompt, 10);
    wrap.appendChild(this.targetPrompt);

    // Skill popup
    this.skillPopup = this.buildSkillPopup();
    wrap.appendChild(this.skillPopup);

    // Item popup
    this.itemPopup = this.buildItemPopup();
    wrap.appendChild(this.itemPopup);

    // Tooltip (reused for all hovers)
    this.tooltipEl = document.createElement('div');
    Object.assign(this.tooltipEl.style, {
      position:'absolute', bottom:'110%', left:'50%',
      transform:'translateX(-50%)',
      padding:'10px 14px', width:'200px',
      pointerEvents:'none', opacity:'0', transition:'opacity 0.2s',
    });
    applyNoblePanel(this.tooltipEl);
    wrap.appendChild(this.tooltipEl);

    // Main bar pill
    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      display:'flex', alignItems:'flex-end', gap:'10px',
      padding:'11px 22px',
    });
    applyNoblePanel(this.bar, true);
    addPanelCorners(this.bar, 14);
    
    // ── Fixed buttons ─────────────────────────────────────────────────────────
    this.moveCircle  = this.makeStaticBtn('onMove',  '🔗', 'Déplacer',   '#22c55e', 56, () => {
      if (this.hasMoved) {
        this.cbs.onUndoMove();
      } else {
        this.cbs.onMove();
      }
    });
    this.weaponSlot  = document.createElement('div');
    Object.assign(this.weaponSlot.style, { display:'flex', gap:'10px', alignItems:'flex-end' });
    this.skillCircle = this.makeStaticBtn('onSkills','✨', 'Compétences', '#8b5cf6', 56, () => this.cbs.onSkills());
    this.itemCircle  = this.makeStaticBtn('onItems', '🎒', 'Objets',      '#ec4899', 56, () => this.cbs.onItems());
    this.infoCircle  = this.makeStaticBtn('onInfo',  'ℹ️', 'Détails',    '#7c3aed', 56, () => this.cbs.onInfo());
    this.waitCircle  = this.makeStaticBtn('onWait',  '⏳', 'Fin du Tour', '#475569', 56, () => this.cbs.onWait());

    this.bar.appendChild(this.moveCircle.parentElement!);
    this.bar.appendChild(this.weaponSlot);
    this.bar.appendChild(this.skillCircle.parentElement!);
    this.bar.appendChild(this.itemCircle.parentElement!);
    this.bar.appendChild(this.infoCircle.parentElement!);
    this.bar.appendChild(this.waitCircle.parentElement!);

    wrap.appendChild(this.bar);
    return wrap;
  }

  /**
   * Make a static button column (circle + dot).
   * Returns the circle element; appends col to track via btnEls.
   */
  private makeStaticBtn(
    key: string, icon: string, label: string,
    dotColor: string, size: number,
    onClick: () => void,
  ): HTMLElement {
    const col = document.createElement('div');
    Object.assign(col.style, {
      display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
    });

    const circle = this.makeCircle(icon, size, false);
    const dot    = this.makeDot(dotColor);

    circle.addEventListener('mouseenter', () => {
      if (circle.dataset['disabled'] === 'true') return;
      this.applyHoverStyle(circle, true);
      
      // Dynamic move/undo label
      let finalLabel = label;
      if (key === 'onMove' && this.hasMoved) {
        finalLabel = 'Annuler déplacement';
      }
      
      this.showTooltip(finalLabel);
    });
    circle.addEventListener('mouseleave', () => {
      if (circle.dataset['active'] !== 'true') this.applyHoverStyle(circle, false);
      this.hideTooltip();
    });
    circle.addEventListener('click', () => {
      if (circle.dataset['disabled'] === 'true') return;
      
      // ── Toggle / Close logic ──
      if (key === 'onSkills') {
        if (this.skillPopup.style.maxHeight !== '0px' && this.skillPopup.style.maxHeight !== '') {
          this.closeSkillPopup();
          return; // just toggle off
        }
        this.closeItemPopup(); // mutually exclusive
      } else if (key === 'onItems') {
        if (this.itemPopup.style.maxHeight !== '0px' && this.itemPopup.style.maxHeight !== '') {
          this.closeItemPopup();
          return; // just toggle off
        }
        this.closeSkillPopup(); // mutually exclusive
      } else {
        // clicking any other button (Move, Info, Wait, Weapon) closes both sub-menus
        this.closeSkillPopup();
        this.closeItemPopup();
      }

      this.flashCircle(circle);
      onClick();
    });

    col.appendChild(circle);
    col.appendChild(dot);
    this.btnEls.set(key, circle);
    return circle;
  }

  // ─── Dynamic weapon rebuild ───────────────────────────────────────────────

  private hasMoved = false;

  /**
   * Rebuild weapon buttons based on unit's weapons.
   * Called at the start of each player turn from CombatManager.showActionMenu().
   */
  rebuild(
    weapons:    WeaponData[],
    canMove:    boolean,
    canAct:     boolean,
    hasActed:   boolean,
    hasMoved:   boolean,
    canUndo:    boolean,
  ): void {
    this.hasMoved = hasMoved;

    // Update Move button appearance based on hasMoved state
    const moveBtn = this.btnEls.get('onMove');
    if (moveBtn) {
      if (hasMoved) {
        // Change to Undo Move (visual icon)
        moveBtn.textContent = '↩️';
        const dot = moveBtn.parentElement!.querySelector('div:last-child') as HTMLElement;
        if (dot) dot.style.background = '#f59e0b'; // Orange dot
      } else {
        // Normal Move
        moveBtn.textContent = '🔗';
        const dot = moveBtn.parentElement!.querySelector('div:last-child') as HTMLElement;
        if (dot) dot.style.background = '#22c55e'; // Green dot
      }
    }

    // Clear weapon slot
    this.weaponSlot.innerHTML = '';
    this.weaponCircles = [];

    (weapons || []).forEach((w, i) => {
      const col    = document.createElement('div');
      Object.assign(col.style, {
        display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
      });

      const circle = this.makeCircle(w.iconKey || '⚔️', 56, false, '#ef4444');
      const dot    = this.makeDot('#ef4444');
      const label  = w.weaponName;

      circle.addEventListener('mouseenter', () => {
        if (circle.dataset['disabled'] === 'true') return;
        this.applyHoverStyle(circle, true);
        this.showTooltip(`${label} (Portée ${w.range})`);
      });
      circle.addEventListener('mouseleave', () => {
        if (circle.dataset['active'] !== 'true') this.applyHoverStyle(circle, false);
        this.hideTooltip();
      });
      circle.addEventListener('click', () => {
        if (circle.dataset['disabled'] === 'true') return;
        this.closeSkillPopup(); 
        this.closeItemPopup();
        this.flashCircle(circle);
        this.cbs.onWeapon(i, w);
      });

      col.appendChild(circle);
      col.appendChild(dot);
      this.weaponSlot.appendChild(col);
      this.weaponCircles.push(circle);
    });

    // Update fixed button states
    
    // Move logic
    if (!hasMoved) {
      // Primary movement
      this.setEnabled('onMove', canMove);
    } else {
      // Undo movement
      this.setEnabled('onMove', canUndo);
    }

    this.setEnabled('onSkills', canAct && !hasActed);
    this.setEnabled('onItems',  canAct && !hasActed);
    this.setEnabled('onInfo',   true);
    this.setEnabled('onWait',   true);

    // Weapon buttons
    this.weaponCircles.forEach(c => {
      const disabled = !canAct || hasActed;
      c.dataset['disabled'] = disabled ? 'true' : 'false';
      c.style.opacity        = disabled ? '0.30' : '1';
    });
  }

  /**
   * After a weapon or skill is used: grey out weapon + skill buttons.
   * Move and Wait remain available.
   */
  lockWeaponAndSkills(): void {
    this.weaponCircles.forEach(c => {
      c.dataset['disabled'] = 'true';
      c.style.opacity        = '0.30';
    });
    const sk = this.btnEls.get('onSkills');
    if (sk) {
      sk.dataset['disabled'] = 'true';
      sk.style.opacity        = '0.30';
    }
    const it = this.btnEls.get('onItems');
    if (it) {
      it.dataset['disabled'] = 'true';
      it.style.opacity        = '0.30';
    }
    this.closeSkillPopup();
    this.closeItemPopup();
    this.setHighlight(null);
  }

  private buildSkillPopup(): HTMLElement {
    const popup = document.createElement('div');
    Object.assign(popup.style, {
      background:'linear-gradient(180deg, rgba(13,20,34,0.96), rgba(7,11,18,0.96))',
      backdropFilter:'blur(20px)',
      border:'1px solid rgba(202,164,90,0.38)', borderRadius:'12px',
      padding:'0 12px', display:'flex', gap:'8px', alignItems:'center',
      boxShadow:'0 20px 40px rgba(0,0,0,0.6)',
      maxHeight:'0', overflow:'hidden', opacity:'0',
      transition:'max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease',
      position:'relative',
    });
    return popup;
  }

  openSkillPopup(
    skills:     ActData[],
    currentAP:  number,
    onSelected: OnSkillSelected,
    onClose:    OnSkillClosed,
  ): void {
    this.skillCallback      = onSelected;
    this.skillCloseCallback = onClose;

    this.skillPopup.innerHTML = '';
    for (const skill of skills) {
      this.skillPopup.appendChild(this.makeSkillBtn(skill, currentAP));
    }

    this.skillPopup.style.maxHeight = '120px';
    this.skillPopup.style.opacity   = '1';
    this.skillPopup.style.padding   = '10px 12px';
    this.setHighlight('onSkills');

    if (this.skillEscHandler) {
      window.removeEventListener('keydown', this.skillEscHandler);
    }

    this.skillEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeSkillPopup(); onClose();
      }
    };
    window.addEventListener('keydown', this.skillEscHandler);
  }

  closeSkillPopup(): void {
    this.skillPopup.style.maxHeight = '0';
    this.skillPopup.style.opacity   = '0';
    this.skillPopup.style.padding   = '0 12px';
    if (this.skillEscHandler) {
      window.removeEventListener('keydown', this.skillEscHandler);
      this.skillEscHandler = null;
    }
    this.setHighlight(null);
  }

  // ─── Item Popup ──────────────────────────────────────────────────────────

  private buildItemPopup(): HTMLElement {
    const popup = document.createElement('div');
    Object.assign(popup.style, {
      background: 'linear-gradient(180deg, rgba(13,20,34,0.96), rgba(7,11,18,0.96))',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(202,164,90,0.38)', borderRadius: '12px',
      padding: '0 12px', display: 'flex', gap: '8px', alignItems: 'center',
      boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
      maxHeight: '0', overflow: 'hidden', opacity: '0',
      transition: 'max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease',
      position: 'relative',
    });
    return popup;
  }

  openItemPopup(
    items:      InventoryItem[],
    onSelected: OnItemSelected,
    onClose:    OnItemClosed,
  ): void {
    this.itemCallback      = onSelected;
    this.itemCloseCallback = onClose;
    this.currentItems      = items;
    this.itemPage          = 0;

    this.renderItemPopupContent();

    this.itemPopup.style.maxHeight = '120px';
    this.itemPopup.style.opacity   = '1';
    this.itemPopup.style.padding   = '10px 12px';
    this.setHighlight('onItems');

    if (this.itemEscHandler) {
      window.removeEventListener('keydown', this.itemEscHandler);
    }

    this.itemEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeItemPopup(); onClose();
      }
    };
    window.addEventListener('keydown', this.itemEscHandler);
  }

  private renderItemPopupContent(): void {
    this.itemPopup.innerHTML = '';
    
    if (this.currentItems.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, { fontSize: '10px', color: 'rgba(255,255,255,0.4)', padding: '10px' });
      empty.textContent = 'Aucun objet disponible';
      this.itemPopup.appendChild(empty);
      return;
    }

    const totalPages = Math.ceil(this.currentItems.length / this.itemPageSize);
    
    // Prev Button
    if (totalPages > 1) {
        const prevBtn = document.createElement('div');
        Object.assign(prevBtn.style, {
            cursor: this.itemPage > 0 ? 'pointer' : 'default',
            opacity: this.itemPage > 0 ? '1' : '0.2',
            fontSize: '18px', color: '#fff', padding: '0 8px', userSelect: 'none'
        });
        prevBtn.textContent = '◀';
        prevBtn.onclick = () => {
            if (this.itemPage > 0) {
                this.itemPage--;
                this.renderItemPopupContent();
            }
        };
        this.itemPopup.appendChild(prevBtn);
    }

    // Items
    const start = this.itemPage * this.itemPageSize;
    const end = start + this.itemPageSize;
    const visibleItems = this.currentItems.slice(start, end);

    for (const invItem of visibleItems) {
        this.itemPopup.appendChild(this.makeItemBtn(invItem));
    }

    // Next Button
    if (totalPages > 1) {
        const nextBtn = document.createElement('div');
        Object.assign(nextBtn.style, {
            cursor: this.itemPage < totalPages - 1 ? 'pointer' : 'default',
            opacity: this.itemPage < totalPages - 1 ? '1' : '0.2',
            fontSize: '18px', color: '#fff', padding: '0 8px', userSelect: 'none'
        });
        nextBtn.textContent = '▶';
        nextBtn.onclick = () => {
            if (this.itemPage < totalPages - 1) {
                this.itemPage++;
                this.renderItemPopupContent();
            }
        };
        this.itemPopup.appendChild(nextBtn);
    }
  }

  closeItemPopup(): void {
    this.itemPopup.style.maxHeight = '0';
    this.itemPopup.style.opacity   = '0';
    this.itemPopup.style.padding   = '0 12px';
    if (this.itemEscHandler) {
      window.removeEventListener('keydown', this.itemEscHandler);
      this.itemEscHandler = null;
    }
    this.setHighlight(null);
  }

  private makeItemBtn(invItem: InventoryItem): HTMLElement {
    const { itemData, quantity } = invItem;
    const icon = itemData.iconKey || '🧪';

    const col = document.createElement('div');
    Object.assign(col.style, {
      display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
      cursor: 'pointer', minWidth:'56px',
    });

    const circle = document.createElement('div');
    Object.assign(circle.style, {
      width:'48px', height:'48px', borderRadius:'50%',
      background:`rgba(255,255,255,0.05)`, border:`1px solid rgba(255,255,255,0.1)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'22px', transition:'all 0.2s ease',
    });
    circle.textContent = icon;

    const lbl = document.createElement('div');
    Object.assign(lbl.style, {
      fontSize:'9px', fontWeight:'700', color:'#94a3b8',
      maxWidth:'52px', textAlign:'center', lineHeight:'1.2',
    });
    lbl.textContent = itemData.itemName.length > 8 ? itemData.itemName.slice(0, 8) : itemData.itemName;

    const qty = document.createElement('div');
    Object.assign(qty.style, { fontSize:'8px', color:'#ec4899', fontWeight:'700' });
    qty.textContent = `x${quantity}`;

    col.appendChild(circle); col.appendChild(lbl); col.appendChild(qty);

    col.addEventListener('mouseenter', () => {
      circle.style.transform = 'scale(1.15)';
      circle.style.borderColor = 'rgba(236, 72, 153, 0.4)';
      this.showItemTooltip(itemData);
    });
    col.addEventListener('mouseleave', () => {
      circle.style.transform = 'scale(1)';
      circle.style.borderColor = 'rgba(255,255,255,0.1)';
      this.hideTooltip();
    });
    col.addEventListener('click', () => {
      this.closeItemPopup();
      this.itemCallback?.(invItem);
    });
    return col;
  }

  private makeSkillBtn(skill: ActData, currentAP: number): HTMLElement {
    const canAfford  = skill.point <= currentAP;
    const icon       = skill.iconKey || (ACTION_ICONS[skill.typeAction] ?? '❓');
    const skillColor = skill.typeAction === TypeAction.HEAL   ? '#4ade80'
                     : skill.typeAction === TypeAction.EFFECT  ? '#a78bfa'
                     : '#fb923c';

    const col = document.createElement('div');
    Object.assign(col.style, {
      display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
      cursor: canAfford ? 'pointer' : 'not-allowed',
      opacity: canAfford ? '1' : '0.35', minWidth:'56px',
    });

    const circle = document.createElement('div');
    Object.assign(circle.style, {
      width:'48px', height:'48px', borderRadius:'50%',
      background:`${skillColor}22`, border:`1px solid ${skillColor}55`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'22px', transition:'all 0.2s ease',
    });
    circle.textContent = icon;

    const lbl = document.createElement('div');
    Object.assign(lbl.style, {
      fontSize:'9px', fontWeight:'700', color:'#94a3b8',
      maxWidth:'52px', textAlign:'center', lineHeight:'1.2',
    });
    lbl.textContent = skill.nameAct.length > 8 ? skill.nameAct.slice(0, 8) : skill.nameAct;

    const cost = document.createElement('div');
    Object.assign(cost.style, { fontSize:'8px', color:'#818cf8', fontWeight:'700' });
    cost.textContent = `${skill.point} AP`;

    col.appendChild(circle); col.appendChild(lbl); col.appendChild(cost);

    col.addEventListener('mouseenter', () => {
      if (!canAfford) return;
      circle.style.transform = 'scale(1.15)';
      this.showSkillTooltip(skill, icon, skillColor);
    });
    col.addEventListener('mouseleave', () => {
      circle.style.transform = 'scale(1)';
      this.hideTooltip();
    });
    col.addEventListener('click', () => {
      if (!canAfford) return;
      this.closeSkillPopup();
      this.skillCallback?.(skill);
    });
    return col;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  show(): void {
    this.root.style.transform = 'translateX(-50%) translateY(0)';
    this.root.style.opacity   = '1';
  }

  hide(): void {
    this.root.style.transform = 'translateX(-50%) translateY(120px)';
    this.root.style.opacity   = '0';
    this.closeSkillPopup();
    this.closeItemPopup();
    this.hideTargetPrompt();
    this.hideTooltip();
  }

  setEnabled(key: keyof ActionBarCallbacks, enabled: boolean): void {
    const c = this.btnEls.get(key);
    if (!c) return;
    c.dataset['disabled'] = enabled ? 'false' : 'true';
    c.style.opacity        = enabled ? '1' : '0.30';
  }

  setHighlight(key: keyof ActionBarCallbacks | null): void {
    for (const [k, c] of this.btnEls.entries()) {
      const active = k === key;
      c.dataset['active']  = active ? 'true' : 'false';
      c.style.borderColor  = active ? 'rgba(77,163,255,0.95)' : 'rgba(202,164,90,0.38)';
      c.style.transform    = active ? 'scale(1.10) translateY(-4px)' : 'scale(1) translateY(0)';
      c.style.background   = active ? 'rgba(20,48,84,0.96)' : 'rgba(13,20,34,0.94)';
    }
  }

  showTargetPrompt(skillName: string): void {
    this.targetPrompt.textContent = `Sélectionnez une cible pour ${skillName}…`;
    this.targetPrompt.style.display = 'block';
  }

  hideTargetPrompt(): void {
    this.targetPrompt.style.display = 'none';
  }

  dispose(): void {
    this.closeSkillPopup();
    this.closeItemPopup();
    this.root.remove();
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────

  private makeCircle(icon: string, size: number, large = false, _accent = '#fff'): HTMLElement {
    const c = document.createElement('div');
    Object.assign(c.style, {
      width:`${size}px`, height:`${size}px`, borderRadius:'50%',
      background:'rgba(13,20,34,0.94)', border:'1px solid rgba(202,164,90,0.50)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:`${large ? 26 : 22}px`,
      transition:'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      boxShadow: large ? '0 0 18px rgba(77,163,255,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 20px rgba(0,0,0,0.22)',
      userSelect:'none', cursor:'pointer',
    });
    c.textContent = icon;
    return c;
  }

  private makeDot(color: string): HTMLElement {
    const d = document.createElement('div');
    Object.assign(d.style, {
      width:'7px', height:'7px', borderRadius:'1px',
      background: color, marginTop:'-1px',
      border:`1px solid ${COMBAT_UI.gold}`,
      transform:'rotate(45deg)',
      boxShadow:`0 0 8px ${color}66`,
    });
    return d;
  }

  private applyHoverStyle(c: HTMLElement, hover: boolean): void {
    c.style.transform   = hover ? 'scale(1.12) translateY(-6px)' : 'scale(1) translateY(0)';
    c.style.background  = hover ? 'rgba(20,48,84,0.96)' : 'rgba(13,20,34,0.94)';
    c.style.borderColor = hover ? 'rgba(77,163,255,0.85)' : 'rgba(202,164,90,0.50)';
  }

  private flashCircle(c: HTMLElement): void {
    c.style.transform = 'scale(0.88) translateY(2px)';
    setTimeout(() => { c.style.transform = 'scale(1) translateY(0)'; }, 120);
  }

  private showTooltip(label: string): void {
    this.tooltipEl.innerHTML = `<div style="font-size:11px;font-weight:800;color:#e2e8f0;text-transform:uppercase;letter-spacing:.1em">${label}</div>`;
    this.tooltipEl.style.opacity = '1';
  }

  private showSkillTooltip(skill: ActData, icon: string, color: string): void {
    const aoe = skill.aoe?.isAOE ? ` · AOE r${skill.aoe.radius}` : '';
    this.tooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="font-size:18px">${icon}</span>
        <span style="font-size:12px;font-weight:800;color:#f1f5f9">${skill.nameAct}</span>
      </div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:6px">${skill.description}</div>
      <div style="font-size:10px;color:${color};font-weight:700">${skill.point} AP · Portée ${skill.range}${aoe}</div>`;
    this.tooltipEl.style.opacity = '1';
  }

  private showItemTooltip(item: ItemData): void {
    const effectsTxt = (item.effects || []).map(e => e.effectType).join(', ');
    const descExtra = item.power ? ` (+${item.power})` : '';
    
    this.tooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="font-size:18px">${item.iconKey || '🧪'}</span>
        <span style="font-size:12px;font-weight:800;color:#f1f5f9">${item.itemName}</span>
      </div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:6px">${item.description}</div>
      <div style="font-size:10px;color:#ec4899;font-weight:700">${item.typeAction || 'OBJET'}${descExtra} · Portée 1</div>`;
    this.tooltipEl.style.opacity = '1';
  }

  private hideTooltip(): void { this.tooltipEl.style.opacity = '0'; }
}
