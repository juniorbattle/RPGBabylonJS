/**
 * ActData.ts
 * Defines actions / skills usable during combat.
 * Port of Unity's ActData.cs ScriptableObject.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Action categories — mirrors Unity ActData.TypeAction */
export enum TypeAction {
  DAMAGE = 'DAMAGE',   // Direct damage to target
  HEAL   = 'HEAL',     // Restore HP
  EFFECT = 'EFFECT',   // Apply a status effect (buff / debuff)
  BUFF   = 'BUFF',
  DEBUFF = 'DEBUFF',
}

/** Status effect types applied by EFFECT actions */
export enum EffectType {
  BOOST    = 'BOOST',    // Increase attacker Power/Damage
  BARRIER  = 'BARRIER',  // Increase Defense
  REGAIN   = 'REGAIN',   // Restore HP per turn
  WEAK     = 'WEAK',     // Decrease Power/Damage
  CURSE    = 'CURSE',    // Decrease Defense
  POISON   = 'POISON',   // Deal damage over time
  MUTE     = 'MUTE',     // Prevent skill usage
  BLIND    = 'BLIND',    // Reduce accuracy (-30)
  INACTION = 'INACTION', // Block actions
  INERTIA  = 'INERTIA',  // Block movement
  SLEEP    = 'SLEEP',    // Block everything, wake up if hit
  STUNNED  = 'STUNNED',  // +25% damage received
}

// ─── Sub-structures ───────────────────────────────────────────────────────────

/** AOE shape and parameters */
export interface AOEData {
  isAOE:      boolean;
  radius:     number;   // Tile radius (0 = single target)
  shape:      'circle' | 'line' | 'cone' | 'cross';
}

/** Status effect applied on hit */
export interface EffectData {
  effectType:    EffectType;
  duration:      number;  // Turns the effect lasts
  value:         number;  // Damage per turn (POISON/BURN) or stat multiplier (BOOST)
}

// ─── Main ActData interface ───────────────────────────────────────────────────

/**
 * An action (weapon attack, skill, item-equivalent) usable in combat.
 * Loaded from JSON or defined inline in sampleData.ts.
 */
export interface ActData {
  /** Unique identifier */
  id:          string;

  /** Display name shown in UI */
  nameAct:     string;

  /** Short description for tooltip */
  description: string;

  /** Action category */
  typeAction:  TypeAction;

  /** AP cost to use this action */
  point:       number;

  /** Tile range (1 = adjacent, 0 = self) */
  range:       number;

  /** Minimum range (0 = no dead zone, >0 = cannot hit units too close) */
  minRange?:    number;

  /** Base damage or heal amount */
  power:       number;

  /** Base accuracy percentage (e.g. 90 = 90%) */
  successRate: number;

  /** Physical (str-based) or Magical (mag-based) */
  damageType:  'physical' | 'magical';

  /** AOE parameters */
  aoe:         AOEData;

  /** Status effects applied on use (can be empty) */
  effects:     EffectData[];

  /** Icon key for UI (matches a CSS class or sprite atlas key) */
  iconKey?:    string;
}
