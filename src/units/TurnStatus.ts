/**
 * TurnStatus.ts
 * Runtime combat state and turn lifecycle of a single unit.
 * Port of Unity's TacticsStatus.cs.
 */

import { UnitData, StatType, getBaseStat, WeaponData } from '../data/types/UnitData';
import { EffectType }                       from '../data/types/ActData';
import { DataManager }                      from '../data/DataManager';

// ─── Active effect on a unit ──────────────────────────────────────────────────

export interface ActiveEffect {
  effectType:      EffectType;
  turnsRemaining:  number;   // -1 = permanent
  value:           number;   // Damage per turn or stat multiplier
  sourceUnitId?:   string;   // Who applied this effect
}

export interface TickResult {
  type: 'damage' | 'heal' | 'buff' | 'debuff';
  effect: EffectType;
  value: number;
}

// ─── Main class ───────────────────────────────────────────────────────────────

/**
 * Manages the unit's metabolic state (HP, AP) and its rights to act during a turn.
 */
export class TurnStatus {

  readonly unit: UnitData;

  // ─── Vital stats ──────────────────────────────────────────────────────────
  currentHealth:    number;
  currentActPoint:  number;  // AP
  readonly maxAP:   number = 5;

  // ─── Grid position ────────────────────────────────────────────────────────
  gridX:     number = 0;
  gridZ:     number = 0;
  elevation: number = 0;

  // ─── Active status effects ────────────────────────────────────────────────
  activeEffects: ActiveEffect[] = [];

  // ─── Turn state flags ─────────────────────────────────────────────────────
  hasMoved:    boolean = false;
  hasActed:    boolean = false;

  /** True while an attack/skill animation is playing. */
  isAnimating: boolean = false;

  constructor(unit: UnitData) {
    this.unit          = unit;
    this.currentHealth = unit.baseStats.maxHealth;
    this.currentActPoint = 0;// Start with 1 AP to allow initial actions

    // Ensure weapons are populated from DataManager if only IDs are present
    if (unit.weaponIds && unit.weaponIds.length > 0 && (!unit.weapons || unit.weapons.length === 0)) {
        const dm = DataManager.getInstance();
        unit.weapons = unit.weaponIds
            .map(id => dm.getWeaponData(id))
            .filter(w => !!w) as WeaponData[];
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called by TurnManager when this unit's turn begins.
   * Increments AP, resets flags, and ticks effects.
   */
  onTurnStart(): TickResult[] {
    this.hasMoved = false;
    this.hasActed = false;
    
    // Regain 1 AP per turn, up to 5
    this.currentActPoint = Math.min(this.maxAP, this.currentActPoint + 1);

    // CRITICAL: Ensure skills are mapped if only IDs exist
    if (this.unit.skillIds && this.unit.skillIds.length > 0) {
        // Here we just ensure currentActPoint is synced, mapping is done by CombatManager
    }
    
    return this.tickEffects();
  }

  // ─── Rights ───────────────────────────────────────────────────────────────

  get isDead(): boolean { return this.currentHealth <= 0; }

  canAct(): boolean {
    if (this.isDead || this.hasActed || this.isAnimating) return false;
    
    // Check for control debuffs
    const blocked = this.hasEffect(EffectType.INACTION) || this.hasEffect(EffectType.SLEEP);
    return !blocked;
  }

  /** Special check for skills (Mute) */
  canUseSkills(): boolean {
    if (!this.canAct()) return false;
    return !this.hasEffect(EffectType.MUTE);
  }

  canMove(): boolean {
    if (this.isDead || this.hasMoved || this.isAnimating) return false;
    const blocked = this.hasEffect(EffectType.INERTIA) || this.hasEffect(EffectType.SLEEP);
    return !blocked;
  }

  // ─── Stat modification ────────────────────────────────────────────────────

  takeDamage(raw: number): number {
    let dmg = Math.max(0, Math.round(raw));

    // Stunned: +25% damage
    if (this.hasEffect(EffectType.STUNNED)) {
        dmg = Math.round(dmg * 1.25);
    }

    this.currentHealth = Math.max(0, this.currentHealth - dmg);

    // Sleep: wake up on damage
    if (dmg > 0 && this.hasEffect(EffectType.SLEEP)) {
        this.activeEffects = this.activeEffects.filter(e => e.effectType !== EffectType.SLEEP);
        console.log(`💤 ${this.unit.unitName} woke up!`);
    }

    return dmg;
  }

  heal(amount: number): number {
    const maxHP  = this.unit.baseStats.maxHealth;
    const before = this.currentHealth;
    this.currentHealth = Math.min(maxHP, this.currentHealth + Math.round(amount));
    return this.currentHealth - before;
  }

  spendAP(cost: number): boolean {
    if (this.currentActPoint < cost) return false;
    this.currentActPoint -= cost;
    return true;
  }

  // ─── Status effects ───────────────────────────────────────────────────────

  applyEffect(effect: ActiveEffect): void {
    this.activeEffects = this.activeEffects.filter(e => e.effectType !== effect.effectType);
    this.activeEffects.push({ ...effect });
  }

  hasEffect(type: EffectType): boolean {
    return this.activeEffects.some(e => e.effectType === type);
  }

  private tickEffects(): TickResult[] {
    const results: TickResult[] = [];
    this.activeEffects = this.activeEffects.filter(effect => {
      if (effect.effectType === EffectType.POISON) {
        const dmg = this.takeDamage(effect.value);
        results.push({ type: 'damage', effect: effect.effectType, value: dmg });
      }
      if (effect.effectType === EffectType.REGAIN) {
        const hp = this.heal(effect.value);
        results.push({ type: 'heal', effect: EffectType.REGAIN, value: hp });
      }
      if (effect.turnsRemaining < 0) return true; // Permanent
      effect.turnsRemaining--;
      return effect.turnsRemaining > 0;
    });
    return results;
  }

  // ─── Final Stats ──────────────────────────────────────────────────────────

  getModifiedStat(stat: StatType): number {
    let base = getBaseStat(this.unit, stat);
    
    // Add Gear Bonus
    const gearBonus = DataManager.getInstance().getGearBonus(this.unit, stat);
    base += gearBonus;

    // Power (Strength/Magic)
    if (stat === StatType.Strength || stat === StatType.Magic) {
        const boost = this.activeEffects.find(e => e.effectType === EffectType.BOOST);
        if (boost) base = Math.round(base * (1 + boost.value));
        const weak = this.activeEffects.find(e => e.effectType === EffectType.WEAK);
        if (weak) base = Math.round(base * (1 - weak.value));
    }

    // Defense (Endurance)
    if (stat === StatType.Endurance) {
        const barrier = this.activeEffects.find(e => e.effectType === EffectType.BARRIER);
        if (barrier) base = Math.round(base * (1 + barrier.value));
        const curse = this.activeEffects.find(e => e.effectType === EffectType.CURSE);
        if (curse) base = Math.round(base * (1 - curse.value));
    }

    return Math.max(1, base);
  }

  get hpRatio(): number {
    return this.unit.baseStats.maxHealth > 0 ? this.currentHealth / this.unit.baseStats.maxHealth : 0;
  }

  get team(): 'TeamA' | 'TeamB' {
    return this.unit.team;
  }
}
