import { DialogueStep } from '../world/DialogueSystem';
import { UnitData, StatType, UnitVisualProfile } from './types/UnitData';

interface SpriteProfileRef {
    profileRef: string;
}

type SpritePresetEntry = UnitVisualProfile | SpriteProfileRef;

interface SpritePresetData {
    sharedProfiles?: Record<string, UnitVisualProfile>;
    unitProfiles?: Record<string, SpritePresetEntry>;
    unitClassProfiles?: Record<string, SpritePresetEntry>;
    enemyProfiles?: Record<string, SpritePresetEntry>;
    enemyClassProfiles?: Record<string, SpritePresetEntry>;
}

type RuntimeUnitData = UnitData & Record<string, any>;

export class DataManager {
    private static instance: DataManager;
    private _plateaus: any[] = [];
    private _dialogues: any = {};
    private _bestiary: Record<string, RuntimeUnitData> = {};
    private _isLoaded: boolean = false;

    private constructor() {}

    public static getInstance(): DataManager {
        if (!DataManager.instance) DataManager.instance = new DataManager();
        return DataManager.instance;
    }

    private _items: any = {};
    private _skills: any = {};
    private _weapons: any = {};
    private _units: Record<string, RuntimeUnitData> = {};

    public async loadAllData(): Promise<void> {
        if (this._isLoaded) return;
        
        try {
            const pRes = await fetch('./data/plateaus.json');
            this._plateaus = (await pRes.json()).plateaus;

            const dRes = await fetch('./data/dialogues.json');
            this._dialogues = (await dRes.json()).dialogues;

            const bRes = await fetch('./data/bestiary.json');
            const bData = await bRes.json() as { enemies?: Record<string, any> };
            this._bestiary = Object.entries(bData.enemies || {}).reduce((acc, [id, enemy]) => {
                acc[id] = this.normalizeUnitData(enemy);
                return acc;
            }, {} as Record<string, RuntimeUnitData>);

            const wRes = await fetch('./data/weapons.json');
            const wData = await wRes.json();
            this._weapons = wData.weapons.reduce((acc: any, weapon: any) => {
                acc[weapon.id] = weapon;
                return acc;
            }, {});

            const uRes = await fetch('./data/units.json');
            const uData = await uRes.json();
            this._units = uData.units.reduce((acc: Record<string, RuntimeUnitData>, unit: any) => {
                const normalized = this.normalizeUnitData(unit);
                acc[normalized.id] = normalized;
                return acc;
            }, {});

            const iRes = await fetch('./data/items.json');
            const iData = await iRes.json();
            
            // Flatten all categories into a single item map
            const allItems = [
                ...(iData.accessories || []),
                ...(iData.consumables || []),
                ...(iData.materials || [])
            ];
            
            this._items = allItems.reduce((acc: any, item: any) => {
                acc[item.id] = item;
                return acc;
            }, {});

            // Load Skills
            const sRes = await fetch('./data/skills.json');
            const sData = await sRes.json();
            this._skills = sData.skills.reduce((acc: any, skill: any) => {
                acc[skill.id] = skill;
                return acc;
            }, {});

            // Optional visual presets for animated sprite sheets
            try {
                const spRes = await fetch('./data/sprite_presets.json');
                if (spRes.ok) {
                    const presets = await spRes.json() as SpritePresetData;
                    this.applyVisualProfiles(presets);
                }
            } catch {
                // Silent fallback: game keeps token rendering if presets are missing
            }

            console.log(`📦 DataManager: Loaded ${Object.keys(this._items).length} items and ${Object.keys(this._skills).length} skills.`);

            this._isLoaded = true;
            console.log("📁 DataManager: All game data loaded successfully.");
        } catch (e) {
            console.error("❌ DataManager Error:", e);
        }
    }

    public getPlateau(id: string): any {
        return this._plateaus.find(p => p.id === id);
    }

    public getDialogue(id: string): DialogueStep[] | null {
        const conv = this._dialogues[id];
        return conv && conv.steps && conv.steps.length > 0 ? conv.steps : null;
    }

    public getEnemy(id: string): any {
        const enemy = this._bestiary[id];
        if (!enemy) {
            console.error(`❌ DataManager: Enemy not found in bestiary: ${id}`);
        }
        return enemy;
    }

    public getItemData(id: string): any {
        return this._items[id];
    }

    public getSkillData(id: string): any {
        return this._skills[id];
    }

    public getWeaponData(id: string): any {
        return this._weapons[id];
    }

    public getUnitTemplate(id: string): any {
        return this._units[id];
    }

    public normalizeUnitData<T extends Record<string, any>>(rawUnit: T): RuntimeUnitData {
        const unit = JSON.parse(JSON.stringify(rawUnit ?? {})) as RuntimeUnitData;
        const baseStats = unit.baseStats ?? {};
        const legacyLevel = (unit.level ?? {}) as any;

        unit.level = {
            currentLevel: Number(legacyLevel.currentLevel ?? 1),
            currentXP: Number(legacyLevel.currentXP ?? legacyLevel.currentExp ?? 0),
            xpToNextLevel: Number(legacyLevel.xpToNextLevel ?? legacyLevel.expToNext ?? 100),
        };

        unit.baseStats = {
            ...baseStats,
            moveRange: Number(baseStats.moveRange ?? unit.moveRange ?? 3),
            jumpHeight: Number(baseStats.jumpHeight ?? unit.jumpHeight ?? 1),
        };

        unit.moveRange = Number(unit.moveRange ?? unit.baseStats.moveRange);
        unit.jumpHeight = Number(unit.jumpHeight ?? unit.baseStats.jumpHeight);
        unit.weaponIds = Array.isArray(unit.weaponIds) ? unit.weaponIds : [];
        unit.weapons = Array.isArray(unit.weapons) ? unit.weapons : [];
        unit.skillIds = Array.isArray(unit.skillIds) ? unit.skillIds : [];
        unit.accessorySlots = Array.isArray(unit.accessorySlots) ? unit.accessorySlots : [null, null];
        unit.portraitColor = unit.portraitColor ?? (unit.team === 'TeamB' ? '#ef4444' : '#3b82f6');

        return unit;
    }

    public getAllSkills(): any[] {
        return Object.values(this._skills);
    }

    public getGearBonus(unit: UnitData, stat: StatType): number {
        let bonus = 0;
        if (!unit.accessorySlots) return 0;

        for (const itemId of unit.accessorySlots) {
            if (!itemId) continue;
            const item = this._items[itemId];
            if (item && item.statModifiers) {
                for (const mod of item.statModifiers) {
                    if (mod.stat === stat) {
                        bonus += mod.value;
                    }
                }
            }
        }
        return bonus;
    }

    private applyVisualProfiles(presets: SpritePresetData): void {
        const cloneProfile = (profile: UnitVisualProfile): UnitVisualProfile =>
            JSON.parse(JSON.stringify(profile));

        const resolveProfile = (entry?: SpritePresetEntry): UnitVisualProfile | null => {
            if (!entry) return null;

            if ('profileRef' in entry) {
                const sharedProfile = presets.sharedProfiles?.[entry.profileRef];
                return sharedProfile ? cloneProfile(sharedProfile) : null;
            }

            return cloneProfile(entry);
        };

        const applyProfileToMap = (
            mapObj: Record<string, any>,
            idProfiles?: Record<string, SpritePresetEntry>,
            classProfiles?: Record<string, SpritePresetEntry>
        ): void => {
            Object.values(mapObj).forEach((entry: any) => {
                if (!entry) return;
                const byId = resolveProfile(idProfiles?.[entry.id]);
                const byClass = resolveProfile(classProfiles?.[entry.characterClass]);
                const profile = byId || byClass;
                if (profile) {
                    entry.visualProfile = profile;
                }
            });
        };

        applyProfileToMap(this._units, presets.unitProfiles, presets.unitClassProfiles);
        applyProfileToMap(this._bestiary, presets.enemyProfiles, presets.enemyClassProfiles);
    }
}
