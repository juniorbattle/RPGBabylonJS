/**
 * CombatHUD.ts
 * Top-left unit info panel — dark glassmorphism style.
 * Layout (updated):
 *  ┌──────────────────────────┐
 *  │ [M] Héros        ●●●○○   │
 *  │     LVL 12               │
 *  │ ♥ HP ████░ 450/500       │
 *  │ [buff] [debuff]          │
 *  ├──────────────────────────┤  ← toggle with i button
 *  │ FOR ████ 18  MAG ██  8   │
 *  │ END ████ 14  DEX ███ 12  │
 *  │ CHA ██   10              │
 *  └──────────────────────────┘
 */

import { Unit }      from '../units/Unit';
import { BaseStats, UnitData, StatType } from '../data/types/UnitData';
import { DataManager } from '../data/DataManager';
import { COMBAT_UI, addPanelCorners, applyNoblePanel } from './CombatUITheme';

// ─── Effect dot data ─────────────────────────────────────────────────────────

interface StatusDef { icon: string; color: string; bg: string; }

const STATUS_MAP: Record<string, StatusDef> = {
  boost:    { icon: '⬆', color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  poison:   { icon: '☠', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  burn:     { icon: '🔥', color: '#f87171', bg: 'rgba(248,113,113,0.12)'},
  stunned:  { icon: '⚡', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  freeze:   { icon: '❄', color: '#67e8f9', bg: 'rgba(103,232,249,0.12)' },
  slow:     { icon: '⌛', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'},
  blind:    { icon: '👁', color: '#6b7280', bg: 'rgba(107,114,128,0.12)'},
  regain:   { icon: '✚', color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  mute:     { icon: '🔇', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'},
  inertia:  { icon: '👣', color: '#6b7280', bg: 'rgba(107,114,128,0.12)'},
  barrier:  { icon: '🛡️', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  
  // New effects
  weak:     { icon: '📉', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  curse:    { icon: '🕸️', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)'  },
  inaction: { icon: '🛑', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  sleep:    { icon: '💤', color: '#93c5fd', bg: 'rgba(147,197,253,0.12)'  },
};

const STATS = [
  { key: 'strength',  label: 'FOR', color: '#f97316' },
  { key: 'magic',     label: 'MAG', color: '#a78bfa' },
  { key: 'endurance', label: 'END', color: '#60a5fa' },
  { key: 'dexterity', label: 'DEX', color: '#4ade80' },
  { key: 'charisma',  label: 'CHA', color: '#fbbf24' },
  { key: 'moveRange', label: 'MOV', color: '#94a3b8' },
  { key: 'jumpHeight',label: 'JMP', color: '#94a3b8' },
];

const MAX_STAT = 50;

// ─── CombatHUD ────────────────────────────────────────────────────────────────

export class CombatHUD {

  private root!:      HTMLElement;
  private mainCard!:  HTMLElement;
  private statsPanel!:HTMLElement;

  // Main card refs
  private portrait!:  HTMLElement;
  private nameEl!:    HTMLElement;
  private classEl!:   HTMLElement;  // unit class (Warrior, Archer…)
  private levelEl!:   HTMLElement;  // LVL badge
  private apDots!:    HTMLElement;
  private hpBar!:     HTMLElement;
  private hpText!:    HTMLElement;
  private statusRow!: HTMLElement;

  private showingStats = false;
  private maxAP        = 5;

  constructor() {
    this.root = this.buildRoot();
    document.body.appendChild(this.root);
    this.hide();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  private buildRoot(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.id = 'combat-hud';
    Object.assign(wrap.style, {
      position: 'fixed', top: '18px', left: '18px',
      zIndex: '200', display: 'flex', flexDirection: 'column',
      gap: '5px', width: '330px',
      transition: 'transform 0.5s ease, opacity 0.5s ease',
    });

    this.mainCard  = this.buildMainCard();
    this.statsPanel= this.buildStatsPanel();

    wrap.appendChild(this.mainCard);
    wrap.appendChild(this.statsPanel);
    return wrap;
  }

  private buildMainCard(): HTMLElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      padding:       '14px 16px',
      overflow:      'hidden',
    });
    applyNoblePanel(card, true);
    addPanelCorners(card);

    // Glow blob
    const glow = document.createElement('div');
    Object.assign(glow.style, {
      position:'absolute', top:'0', left:'0',
      width:'110px', height:'110px',
      background:'#4da3ff', opacity:'0.08',
      borderRadius:'50%', filter:'blur(40px)',
      pointerEvents:'none',
    });
    card.appendChild(glow);

    // ── Header row ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px',
    });

    this.portrait = this.el('div', {
      width:'58px', height:'58px', borderRadius:'10px',
      background:'#3b82f6',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'24px', fontWeight:'900', color:'#fff',
      border:`1px solid ${COMBAT_UI.gold}`,
      flexShrink:'0', boxShadow:'inset 0 0 0 1px rgba(0,0,0,0.45), 0 0 18px rgba(77,163,255,0.18)',
    });
    this.portrait.textContent = '?';

    const meta = document.createElement('div');
    Object.assign(meta.style, { flex:'1', minWidth:'0', display:'flex', flexDirection:'column', gap:'2px' });

    // Row 1: Name + AP dots (Aligned same line)
    const nameApRow = document.createElement('div');
    Object.assign(nameApRow.style, {
        display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%'
    });

    this.nameEl = this.el('span', {
      fontSize:'18px', fontWeight:'800', color:COMBAT_UI.text,
      fontFamily:"Georgia, 'Times New Roman', serif", lineHeight:'1',
      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
    });
    this.nameEl.textContent = '—';

    this.apDots = this.el('div', { display:'flex', gap:'3px', alignItems:'center' });

    nameApRow.appendChild(this.nameEl);
    nameApRow.appendChild(this.apDots);

    // Row 2: Class · LVL badge
    const classLvlRow = document.createElement('div');
    Object.assign(classLvlRow.style, {
      display:'flex', alignItems:'center', gap:'5px',
    });

    this.classEl = this.el('span', {
      fontSize:'9px', fontWeight:'700',
      color:'#8fb8e8', letterSpacing:'0.04em', lineHeight:'1',
    });
    this.classEl.textContent = '—';

    const sep = this.el('span', {
      fontSize:'9px', color:'rgba(255,255,255,0.20)', lineHeight:'1',
    });
    sep.textContent = '·';

    this.levelEl = this.el('span', {
      fontSize:'8px', fontWeight:'700',
      background:'rgba(244,234,210,0.08)',
      color:COMBAT_UI.textMuted, padding:'2px 6px',
      border:'1px solid rgba(202,164,90,0.22)',
      borderRadius:'4px', lineHeight:'1',
    });
    this.levelEl.textContent = 'LVL 1';

    classLvlRow.appendChild(this.classEl);
    classLvlRow.appendChild(sep);
    classLvlRow.appendChild(this.levelEl);

    meta.appendChild(nameApRow);
    meta.appendChild(classLvlRow);
    header.appendChild(this.portrait);
    header.appendChild(meta);
    card.appendChild(header);

    // ── HP bar ────────────────────────────────────────────────────────────────
    const hpLabel = document.createElement('div');
    Object.assign(hpLabel.style, {
      display:'flex', justifyContent:'space-between', alignItems:'center',
      marginBottom:'4px',
    });

    const hpLbl = this.el('span', {
      fontSize:'10px', fontWeight:'800', color:'#d95757',
      display:'flex', alignItems:'center', gap:'4px',
    });
    hpLbl.innerHTML = '♥ HP';

    this.hpText = this.el('span', {
      fontSize:'11px', fontWeight:'800', color:COMBAT_UI.text,
      fontFamily:"'Consolas',monospace",
    });
    this.hpText.textContent = '0/0';

    hpLabel.appendChild(hpLbl);
    hpLabel.appendChild(this.hpText);

    const hpTrack = this.el('div', {
      height:'7px', background:'rgba(22,28,40,0.92)',
      borderRadius:'99px', overflow:'hidden',
      border:'1px solid rgba(255,255,255,0.05)',
    });
    this.hpBar = this.el('div', {
      height:'100%', borderRadius:'99px',
      background:'linear-gradient(90deg,#d95757,#ff7676)',
      width:'100%', transition:'width 0.6s ease',
    });
    hpTrack.appendChild(this.hpBar);

    card.appendChild(hpLabel);
    card.appendChild(hpTrack);

    // ── Status effects row (Directly below HP) ────────────────────────────────
    this.statusRow = this.el('div', {
      display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'6px',
    });
    card.appendChild(this.statusRow);

    return card;
  }

  private buildStatsPanel(): HTMLElement {
    const panel = this.el('div', {
      padding:       '0px 14px',
      overflow:      'hidden',
      maxHeight:     '0px',
      opacity:       '0',
      transition:    'max-height 0.35s ease, opacity 0.35s ease, padding 0.35s ease',
    });
    applyNoblePanel(panel);
    addPanelCorners(panel, 11);

    // Header
    const hdr = this.el('div', {
      fontSize:'8px', fontWeight:'800', color:COMBAT_UI.gold,
      letterSpacing:'0.18em', textAlign:'center',
      borderBottom:'1px solid rgba(255,255,255,0.05)',
      paddingBottom:'8px', marginBottom:'8px', textTransform:'uppercase',
    });
    hdr.textContent = 'Attributs';
    panel.appendChild(hdr);

    for (const s of STATS) {
      const row = document.createElement('div');
      row.id = `stat-row-${s.key}`;
      Object.assign(row.style, {
        display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px',
      });

      const lbl = this.el('span', {
        fontSize:'8px', fontWeight:'900', color:'#94a3b8',
        width:'22px', letterSpacing:'0.08em',
      });
      lbl.textContent = s.label;

      const track = this.el('div', {
        flex:'1', height:'4px',
        background:'rgba(30,35,50,0.80)',
        borderRadius:'99px', overflow:'hidden',
      });
      const fill = this.el('div', {
        height:'100%', borderRadius:'99px',
        background: s.color, width:'0%',
        transition:'width 1s ease',
      });
      fill.id = `stat-fill-${s.key}`;
      track.appendChild(fill);

      const val = this.el('span', {
        fontSize:'10px', fontWeight:'800', color:'#f1f5f9',
        width:'20px', textAlign:'right',
        fontFamily:"'Consolas',monospace",
      });
      val.id = `stat-val-${s.key}`;
      val.textContent = '0';

      row.appendChild(lbl);
      row.appendChild(track);
      row.appendChild(val);
      panel.appendChild(row);
    }

    return panel;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  showUnit(unit: Unit): void {
    const s  = unit.status;
    const ud = s.unit;

    // Portrait
    this.portrait.textContent        = unit.name.charAt(0).toUpperCase();
    this.portrait.style.background   = unit.teamColorHex;

    // Name / class / level
    this.nameEl.textContent   = unit.name;
    this.classEl.textContent  = ud.characterClass as string;
    this.levelEl.textContent  = `LVL ${ud.level.currentLevel}`;

    // AP
    this.maxAP = s.maxAP;
    this.refreshAP(s.currentActPoint);

    // HP
    this.refreshHP(s.currentHealth, ud.baseStats.maxHealth);

    // Status effects
    this.refreshStatus(s.activeEffects.map(e => e.effectType as string));

    // Stats
    const finalStats: Record<string, number> = {
        strength:  s.getModifiedStat(StatType.Strength),
        magic:     s.getModifiedStat(StatType.Magic),
        endurance: s.getModifiedStat(StatType.Endurance),
        dexterity: s.getModifiedStat(StatType.Dexterity),
        charisma:  s.getModifiedStat(StatType.Charisma),
        moveRange: ud.baseStats.moveRange,
        jumpHeight:ud.baseStats.jumpHeight,
    };
    this.refreshStats(finalStats);
  }

  /** Display info from raw UnitData (useful for pre-combat deployment) */
  showUnitData(ud: UnitData): void {
    // Portrait (Use generic grey for TeamA preview)
    this.portrait.textContent        = ud.unitName.charAt(0).toUpperCase();
    this.portrait.style.background   = '#3388ff';

    // Name / class / level
    this.nameEl.textContent   = ud.unitName;
    this.classEl.textContent  = ud.characterClass as string;
    this.levelEl.textContent  = `LVL ${ud.level.currentLevel}`;

    // Clear AP (not relevant in preview)
    this.apDots.innerHTML = '';

    // HP
    this.refreshHP(ud.baseStats.maxHealth, ud.baseStats.maxHealth);

    // Status effects (empty in preview)
    this.statusRow.innerHTML = '';

    // Stats
    const dm = DataManager.getInstance();
    const finalStats: Record<string, number> = {
        strength:  ud.baseStats.strength + dm.getGearBonus(ud, StatType.Strength),
        magic:     ud.baseStats.magic + dm.getGearBonus(ud, StatType.Magic),
        endurance: ud.baseStats.endurance + dm.getGearBonus(ud, StatType.Endurance),
        dexterity: ud.baseStats.dexterity + dm.getGearBonus(ud, StatType.Dexterity),
        charisma:  ud.baseStats.charisma + dm.getGearBonus(ud, StatType.Charisma),
        moveRange: ud.baseStats.moveRange,
        jumpHeight:ud.baseStats.jumpHeight,
    };
    this.refreshStats(finalStats);
  }

  refreshAP(current: number): void {
    this.apDots.innerHTML = '';
    for (let i = 0; i < this.maxAP; i++) {
        const isActive = i < current;
      const dot = this.el('div', {
        width:'6px', height:'6px', borderRadius:'50%',
        background: isActive
          ? '#4da3ff'
          : 'rgba(255,255,255,0.08)',
        boxShadow: isActive ? '0 0 7px rgba(77,163,255,0.7)' : 'none',
        border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
        transition:'background 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      });
      if (isActive) dot.style.transform = 'scale(1.1)';
      this.apDots.appendChild(dot);
    }
  }

  refreshHP(current: number, max: number): void {
    const r = Math.max(0, current / max);
    this.hpBar.style.width = `${Math.round(r * 100)}%`;
    this.hpText.textContent = `${current}/${max}`;
    if (r > 0.5)       this.hpBar.style.background = 'linear-gradient(90deg,#d95757,#ff7676)';
    else if (r > 0.25) this.hpBar.style.background = 'linear-gradient(90deg,#b8792f,#f1b85b)';
    else               this.hpBar.style.background = 'linear-gradient(90deg,#7f1d1d,#d95757)';
  }

  refreshStatus(effects: string[]): void {
    this.statusRow.innerHTML = '';
    for (const eff of effects) {
      // Ensure key matches map (lowercase)
      const def = STATUS_MAP[eff.toLowerCase()];
      if (!def) continue;
      const dot = this.el('div', {
        width:'18px', height:'18px', borderRadius:'5px',
        display:'flex', alignItems:'center', justifyContent:'center',
        background: def.bg,
        border:`1px solid ${def.color}40`,
        fontSize:'10px', cursor:'default',
      });
      dot.title  = eff;
      dot.textContent = def.icon;
      this.statusRow.appendChild(dot);
    }
  }

  refreshStats(statValues: Record<string, number>): void {
    for (const s of STATS) {
      const val  = statValues[s.key] ?? 0;
      const fill = document.getElementById(`stat-fill-${s.key}`) as HTMLElement | null;
      const valEl= document.getElementById(`stat-val-${s.key}`)  as HTMLElement | null;
      if (fill)  fill.style.width  = `${Math.min(val / MAX_STAT * 100, 100)}%`;
      if (valEl) valEl.textContent = String(val);
    }
  }

  toggleStats(): void {
    this.showingStats = !this.showingStats;
    this.refreshStatsVisibility();
  }

  /** Force hiding attributes panel (useful for NPCs or turn ends) */
  forceCloseStats(): void {
    this.showingStats = false;
    this.refreshStatsVisibility();
  }

  private refreshStatsVisibility(): void {
    if (this.showingStats) {
      this.statsPanel.style.maxHeight = '180px';
      this.statsPanel.style.opacity   = '1';
      this.statsPanel.style.padding   = '10px 14px';
    } else {
      this.statsPanel.style.maxHeight = '0px';
      this.statsPanel.style.opacity   = '0';
      this.statsPanel.style.padding   = '0px 14px';
    }
  }

  show(): void {
    this.root.style.transform = 'translateX(0)';
    this.root.style.opacity   = '1';
  }

  hide(): void {
    this.root.style.transform = 'translateX(-110%)';
    this.root.style.opacity   = '0';
  }

  dispose(): void { this.root.remove(); }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private el(tag: string, styles: Partial<CSSStyleDeclaration>): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    return e;
  }
}
