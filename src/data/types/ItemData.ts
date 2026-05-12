/**
 * ItemData.ts
 * Consumable and equipment item definitions.
 * Port of Unity's ItemData.cs.
 */

import { TypeAction, EffectData } from './ActData';

export enum ItemCategory {
  Consumable = 'Consumable',
  Accessory  = 'Accessory',
  Material   = 'Material',
  KeyItem    = 'KeyItem',
}

/** Stat modifier applied when an accessory is equipped */
export interface StatModifier {
  stat:   string; // 'strength' | 'magic' | 'endurance' | 'dexterity' | 'charisma'
  value:  number;
}

/**
 * Definition of an item in the game.
 * Consumables are used in combat; accessories are equipped for passive bonuses.
 */
export interface ItemData {
  id:           string;
  itemName:     string;
  description:  string;
  category:     ItemCategory;
  isConsumable: boolean;

  /** For consumables: action mapping */
  typeAction?:   TypeAction;    // DAMAGE, HEAL, BUFF, etc.
  power?:        number;        // Amount of healing or damage
  successRate?:  number;        // Base accuracy
  apRestore?:    number;        // AP regained
  effects?:      EffectData[];  // Status effects applied

  /** For accessories: stat bonuses */
  statModifiers: StatModifier[];

  /** Shop price */
  price:        number;

  /** Icon key for UI */
  iconKey?:     string;
}

/** One stack of items in an inventory slot */
export interface InventoryItem {
  itemData: ItemData;
  quantity: number;
}
