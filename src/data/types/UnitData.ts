/**
 * UnitData.ts
 * Core data definition for a unit (player or enemy).
 * Direct TypeScript port of Unity's UnitData.cs ScriptableObject.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Character classes matching Unity's CharacterClass enum */
export enum CharacterClass {
  Warrior   = 'Warrior',
  Mage      = 'Mage',
  Archer    = 'Archer',
  Healer    = 'Healer',
  Rogue     = 'Rogue',
  Paladin   = 'Paladin',
  Necromancer = 'Necromancer',
  Bard      = 'Bard',
  Druid     = 'Druid',
  Berserker = 'Berserker',
  Summoner  = 'Summoner',
  Knight    = 'Knight',
}

/** Stat names used for bar display and modifiers */
export enum StatType {
  Strength  = 'Strength',
  Magic     = 'Magic',
  Endurance = 'Endurance',
  Dexterity = 'Dexterity',
  Charisma  = 'Charisma',
}

// ─── Sub-structures ───────────────────────────────────────────────────────────

/** Base stats block — mirrors Unity BaseStats struct */
export interface BaseStats {
  maxHealth:   number;
  strength:    number;  // FOR — physical attack
  magic:       number;  // MAG — magical attack
  endurance:   number;  // END — defense / HP scaling
  dexterity:   number;  // DEX — initiative, accuracy
  charisma:    number;  // CHA — support, buffs
  moveRange:   number;  // MOV — mobility
  jumpHeight:  number;  // JMP — verticality
}

/** Level-up data */
export interface LevelData {
  currentLevel:   number;
  currentXP:      number;
  xpToNextLevel:  number;
}

/** Weapon data (simplified) */
export interface WeaponData {
  weaponName:   string;
  iconKey?:     string;
  damage:       number;
  range:        number;    // tile range
  minRange?:    number;    // optional dead zone
  isAOE:        boolean;
  aoeRadius:    number;
}

/** Sprite-sheet animation descriptor */
export interface UnitAnimationSourceOverride {
  texture?: string;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rows?: number;
}

export interface UnitAnimationClip {
  frames: number[];
  fps?: number;
  loop?: boolean;
}

export interface UnitAnimationClip extends UnitAnimationSourceOverride {}

export type UnitAnimationName = 'idle' | 'move' | 'attack' | 'cast' | 'hit' | 'death';

export interface UnitFrameOffset {
  x?: number;
  y?: number;
}

/** Runtime visual profile for HD-2D animated units */
export interface UnitVisualProfile {
  texture: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  scale?: number;
  /** Additional lift above the tile top, expressed as a fraction of sprite height. */
  groundOffset?: number;
  /** Additional horizontal centering tweak, expressed as a fraction of sprite width. */
  centerOffset?: number;
  /** Legacy field kept for backward compatibility. Prefer groundOffset. */
  yOffset?: number;
  shadowScale?: number;
  defaultFps?: number;
  frameOffsets?: Record<string, UnitFrameOffset>;
  clipFrameOffsets?: Partial<Record<UnitAnimationName, Record<string, UnitFrameOffset>>>;
  animations: {
    idle: UnitAnimationClip;
    move?: UnitAnimationClip;
    attack?: UnitAnimationClip;
    cast?: UnitAnimationClip;
    hit?: UnitAnimationClip;
    death?: UnitAnimationClip;
  };
}

// ─── Main UnitData interface ──────────────────────────────────────────────────

/**
 * Immutable data definition for a unit type.
 * Loaded from JSON (exported from Unity DataExporter).
 * Runtime state is stored separately in TacticsStatus.
 */
export interface UnitData {
  /** Unique identifier */
  id:             string;

  /** Movement animation style */
  movementType?:  'default' | 'teleport' | 'jump' | 'dash';

  /** AI Behavior profile */
  aiBehavior?:    'aggressive' | 'cautious' | 'healer' | 'guardian' | 'camper';

  /** Display name */
  unitName:       string;

  /** Class determines starting stats and available skills */
  characterClass: CharacterClass;

  /** Portrait color (hex) — used when no sprite is assigned */
  portraitColor:  string;

  /** Base stat block at level 1 */
  baseStats:      BaseStats;

  /** Level progress */
  level:          LevelData;

  /** Equipped weapons IDs */
  weaponIds:      string[];

  /** Equipped accessories names */
  accessorySlots: (string | null)[];

  /** Equipped weapons (computed or legacy) */
  weapons:        WeaponData[];

  /** Available skills/actions (IDs reference ActData list) */
  skillIds:       string[];

  /** Movement range in tiles */
  moveRange:      number;

  /** Jump height (can step up this many tile-heights) */
  jumpHeight:     number;

  /** Team identifier */
  team:           'TeamA' | 'TeamB';

  /** Optional HD-2D sprite sheet config */
  visualProfile?: UnitVisualProfile;
}

// ─── Stat helper ─────────────────────────────────────────────────────────────

/**
 * Get a specific stat from a UnitData's baseStats.
 * Mirrors Unity's UnitData.GetModifiedStat().
 */
export function getBaseStat(unit: UnitData, stat: StatType): number {
  switch (stat) {
    case StatType.Strength:  return unit.baseStats.strength;
    case StatType.Magic:     return unit.baseStats.magic;
    case StatType.Endurance: return unit.baseStats.endurance;
    case StatType.Dexterity: return unit.baseStats.dexterity;
    case StatType.Charisma:  return unit.baseStats.charisma;
    default:                 return 0;
  }
}
