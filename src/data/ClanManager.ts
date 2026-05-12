/**
 * ClanManager.ts
 * Global singleton managing player units, gold, and inventory.
 * Equivalent to Unity's ClanManager.cs.
 */

import { UnitData } from './types/UnitData';
import { ItemData, ItemCategory, InventoryItem } from './types/ItemData';
import { DataManager } from './DataManager';

export class ClanManager {
  private static instance: ClanManager | null = null;

  private allUnits: UnitData[] = [];
  private gold: number = 1000;
  private reputation: number = 50;
  private totalVictories: number = 0;
  private maxClanSize: number = 12;

  // Global Inventories
  private items_consumables: InventoryItem[] = [];
  private items_accessories: InventoryItem[] = [];
  private items_materials:   InventoryItem[] = [];

  private constructor() {}

  public static getInstance(): ClanManager {
    if (!ClanManager.instance) {
      ClanManager.instance = new ClanManager();
    }
    return ClanManager.instance;
  }

  // ─── Unit Management ──────────────────────────────────────────────────────

  public getAllUnits(): UnitData[] {
    return [...this.allUnits]; // Copy
  }

  public addUnit(unit: UnitData): boolean {
    if (this.allUnits.length < this.maxClanSize) {
      this.allUnits.push(this.cloneNormalizedUnit(unit));
      this.syncUnitVisualProfiles();
      return true;
    }
    return false;
  }

  public removeUnit(unitId: string): void {
    this.allUnits = this.allUnits.filter(u => u.id !== unitId);
  }

  public removeRandomUnit(): UnitData | null {
    if (this.allUnits.length === 0) return null;
    const idx = Math.floor(Math.random() * this.allUnits.length);
    const unit = this.allUnits[idx];
    this.allUnits.splice(idx, 1);
    return unit;
  }

  public calculateMaintenanceCost(): number {
    const base = 50;
    const perUnit = 50; // Increased for impact
    // Advisors? Assumed 0 for now or tracked elsewhere
    return base + (this.allUnits.length * perUnit);
  }

  /** Initialize with a set of starting units */
  public setupStarterClan(units: UnitData[]): void {
    this.allUnits = units
      .slice(0, this.maxClanSize)
      .map((unit) => this.cloneNormalizedUnit(unit));
    this.syncUnitVisualProfiles();
  }

  public initializeStarterPack(allUnits: UnitData[], getItemHandler: (id: string) => ItemData | null): void {
    // 1. Starter Units (Alistair, Elara, Kestrel)
    const starterUnitIds = ["unit_alistair", "unit_elara", "unit_kestrel"];
    const starters = allUnits.filter(u => starterUnitIds.includes(u.id));
    this.setupStarterClan(starters);

    // 2. Starter Consumables
    const p1 = getItemHandler("potion_light");
    if (p1) this.addItem(p1, 10);
    const p2 = getItemHandler("antidote");
    if (p2) this.addItem(p2, 3);
    const p3 = getItemHandler("high_potion");
    if (p3) this.addItem(p3, 5);
    const bomb = getItemHandler("bomb");
    if (bomb) this.addItem(bomb, 5);
    
    const knife = getItemHandler("throwing_knife");
    if (knife) this.addItem(knife, 10);
    
    const elixir = getItemHandler("elixir");
    if (elixir) this.addItem(elixir, 2);
    
    const smoke = getItemHandler("smoke_bomb");
    if (smoke) this.addItem(smoke, 5);

    // 3. Starter Accessories
    const ring = getItemHandler("strength_ring");
    if (ring) this.addItem(ring, 1);
    const boots = getItemHandler("agility_boots");
    if (boots) this.addItem(boots, 1);
    const crown = getItemHandler("wisdom_crown");
    if (crown) this.addItem(crown, 1);

    // 4. Starter Materials for crafting test
    const iron = getItemHandler("iron_ore");
    if (iron) this.addItem(iron, 15);
    const wood = getItemHandler("oak_wood");
    if (wood) this.addItem(wood, 10);
    const gem = getItemHandler("red_gem");
    if (gem) this.addItem(gem, 5);
    const mithril = getItemHandler("mithril_ore");
    if (mithril) this.addItem(mithril, 5);
    const mwood = getItemHandler("magic_wood");
    if (mwood) this.addItem(mwood, 5);
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  public getGold(): number { return this.gold; }
  public addGold(amount: number): void { this.gold += amount; }
  
  public getReputation(): number { return this.reputation; }
  public modifyReputation(amount: number): void { this.reputation = Math.max(0, Math.min(100, this.reputation + amount)); }

  public spendGold(amount: number): boolean {
    if (this.gold >= amount) {
      this.gold -= amount;
      return true;
    }
    return false;
  }

  public getVictories(): number { return this.totalVictories; }
  public incrementVictories(): void { this.totalVictories++; }

  // ─── Experience ───────────────────────────────────────────────────────────

  /**
   * Distribute XP to all clan units.
   * Units in battle get 100%, others get 50%
   */
  public distributeCombatXP(amount: number, participatorsIds: string[]): { name: string, level: number, xpPercent: number, gainedXP: number }[] {
    const results: { name: string, level: number, xpPercent: number, gainedXP: number }[] = [];
    
    for (const unit of this.allUnits) {
      const isParticipator = participatorsIds.includes(unit.id);
      const gainedXP = isParticipator ? amount : Math.floor(amount / 2);
      this.normalizeUnitProgress(unit);
      
      // Update XP in UnitData
      unit.level.currentXP += gainedXP;
      
      // Level up logic
      while (unit.level.currentXP >= unit.level.xpToNextLevel) {
        unit.level.currentXP -= unit.level.xpToNextLevel;
        unit.level.currentLevel++;
        unit.level.xpToNextLevel = Math.floor(unit.level.xpToNextLevel * 1.5);
        
        // Boost stats on level up
        unit.baseStats.maxHealth += 20;
        unit.baseStats.strength += 2;
        unit.baseStats.magic += 2;
        unit.baseStats.endurance += 2;
      }

      results.push({
        name: unit.unitName,
        level: unit.level.currentLevel,
        xpPercent: Math.floor((unit.level.currentXP / unit.level.xpToNextLevel) * 100),
        gainedXP: gainedXP
      });
    }

    return results;
  }

  public addExperienceToAll(amount: number): void {
    console.log(`Clan gained ${amount} XP`);
    this.distributeCombatXP(amount, []); // distributed as reserve
  }

  // ─── Inventory Management ─────────────────────────────────────────────────

  public getInventoryByType(category: ItemCategory): InventoryItem[] {
    switch (category) {
      case ItemCategory.Consumable: return [...this.items_consumables];
      case ItemCategory.Accessory:  return [...this.items_accessories];
      case ItemCategory.Material:   return [...this.items_materials];
      default: return [];
    }
  }

  public addItem(item: ItemData, quantity: number = 1): void {
    let list: InventoryItem[];
    switch (item.category) {
      case ItemCategory.Consumable: list = this.items_consumables; break;
      case ItemCategory.Accessory:  list = this.items_accessories; break;
      case ItemCategory.Material:   list = this.items_materials;   break;
      default: return;
    }

    const existing = list.find(si => si.itemData.id === item.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      list.push({ itemData: item, quantity });
    }
  }

    public removeItem(itemId: string, category: ItemCategory, quantity: number = 1): boolean {
      let list: InventoryItem[];
      switch (category) {
        case ItemCategory.Consumable: list = this.items_consumables; break;
        case ItemCategory.Accessory:  list = this.items_accessories; break;
        case ItemCategory.Material:   list = this.items_materials;   break;
        default: return false;
      }
  
      const idx = list.findIndex(si => si.itemData.id === itemId);
      if (idx >= 0) {
        if (list[idx].quantity >= quantity) {
          list[idx].quantity -= quantity;
          if (list[idx].quantity <= 0) {
            list.splice(idx, 1);
          }
          return true;
        }
      }
      return false;
    }

    // ─── Equipment Management ─────────────────────────────────────────────────

    public equipAccessory(unitId: string, itemId: string, slotIndex: number): boolean {
        const unit = this.allUnits.find(u => u.id === unitId);
        if (!unit) return false;

        // 1. Find item in inventory
        const invIdx = this.items_accessories.findIndex(inv => inv.itemData.id === itemId);
        if (invIdx === -1) return false;
        
        // 2. Handle old item if any
        const oldItemId = unit.accessorySlots[slotIndex];
        if (oldItemId) {
            const dm = DataManager.getInstance();
            const oldItemData = dm.getItemData(oldItemId);
            if (oldItemData) this.addItem(oldItemData, 1);
        }

        // 3. Consume 1 from inventory
        this.removeItem(itemId, ItemCategory.Accessory, 1);

        // 4. Update unit
        unit.accessorySlots[slotIndex] = itemId;
        return true;
    }

    public unequipAccessory(unitId: string, slotIndex: number): boolean {
        const unit = this.allUnits.find(u => u.id === unitId);
        if (!unit || !unit.accessorySlots[slotIndex]) return false;

        const itemId = unit.accessorySlots[slotIndex]!;
        
        // Put back in inventory
        const dm = DataManager.getInstance();
        const itemData = dm.getItemData(itemId);
        if (itemData) {
            this.addItem(itemData, 1);
        }

    unit.accessorySlots[slotIndex] = null;
    return true;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  public getSnapshot(): any {
    return {
      gold: this.gold,
      reputation: this.reputation,
      victories: this.totalVictories,
      units: this.allUnits, // JSON stringify handles deep object (stats, level)
      inventory: {
        consumables: this.items_consumables.map(i => ({ id: i.itemData.id, qty: i.quantity })),
        accessories: this.items_accessories.map(i => ({ id: i.itemData.id, qty: i.quantity })),
        materials:   this.items_materials.map(i => ({ id: i.itemData.id, qty: i.quantity }))
      }
    };
  }

  /** Restore state from a save file */
  public loadSnapshot(data: any): void {
    if (!data) return;

    this.gold = data.gold ?? 1000;
    this.reputation = data.reputation ?? 50;
    this.totalVictories = data.victories ?? 0;
    
    // Restore Units
    // Note: We might want to re-validate against DataManager templates, but keeping save data is safer for progression
    this.allUnits = Array.isArray(data.units)
      ? data.units.map((unit: any) => this.cloneNormalizedUnit(unit))
      : [];
    this.syncUnitVisualProfiles();

    // Re-link Weapons based on IDs (UnitData properties must imply weapons)
    // In UnitData.ts, 'weapons' might be undefined in JSON, so we rebuild it at runtime (Unit constructor does it? No)
    // The combat system (CombatManager) does a check: "if (s.unit.weaponIds && (!s.unit.weapons...))"
    // So storing weaponIds is sufficient.

    // Restore Inventory
    const dm = DataManager.getInstance();

    const restoreList = (savedList: any[], targetList: InventoryItem[]) => {
        targetList.length = 0; // Clear
        if (Array.isArray(savedList)) {
            savedList.forEach((saved: any) => {
                const itemData = dm.getItemData(saved.id);
                if (itemData) {
                    targetList.push({ itemData, quantity: saved.qty });
                }
            });
        }
    };

    if (data.inventory) {
        restoreList(data.inventory.consumables, this.items_consumables);
        restoreList(data.inventory.accessories, this.items_accessories);
        restoreList(data.inventory.materials,   this.items_materials);
    }
  }

  private syncUnitVisualProfiles(): void {
    const dataManager = DataManager.getInstance();

    this.allUnits.forEach((unit) => {
      const template = dataManager.getUnitTemplate(unit.id);
      const visualProfile = template?.visualProfile;
      if (!visualProfile) return;

      unit.visualProfile = JSON.parse(JSON.stringify(visualProfile));
    });
  }

  private cloneNormalizedUnit(unit: UnitData): UnitData {
    return DataManager.getInstance().normalizeUnitData(unit) as UnitData;
  }

  private normalizeUnitProgress(unit: UnitData): void {
    const rawLevel = unit.level as any;
    unit.level = {
      currentLevel: Number(rawLevel?.currentLevel ?? 1),
      currentXP: Number(rawLevel?.currentXP ?? rawLevel?.currentExp ?? 0),
      xpToNextLevel: Number(rawLevel?.xpToNextLevel ?? rawLevel?.expToNext ?? 100),
    };
  }
}
