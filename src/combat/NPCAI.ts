/**
 * NPCAI.ts
 * NPC/Enemy AI decision-making system.
 * Updated to respect TurnStatus (AP, Move, Act).
 */

import { Unit }                 from '../units/Unit';
import { ActData, TypeAction }  from '../data/types/ActData';
import { WeaponData }           from '../data/types/UnitData';
import { TileData, CombatGrid } from './CombatGrid';
import { AOESystem, AOEResult } from './AOESystem';

function weaponToActData(w: WeaponData, id: string): ActData {
  return {
    id,
    nameAct:     w.weaponName,
    description: "",
    typeAction:  TypeAction.DAMAGE,
    point:       0,
    range:       w.range,
    minRange:    w.minRange ?? 0,
    power:       w.damage,
    successRate: 95, // Default weapon accuracy
    damageType:  'physical',
    aoe:         { isAOE: true, radius: 0.4, shape: 'circle' },
    effects:     [],
  };
}

export interface AIDecision {
  type:        'action' | 'skip';
  action?:     ActData;
  aoeResult?:  AOEResult;
}

export class NPCAI {
  private actionsMap: Map<string, ActData> = new Map();

  constructor(public characterClass: string) {}

  getBestMoveTile(npc: Unit, reachable: TileData[], players: Unit[], allies: Unit[]): TileData | null {
    const behavior = npc.status.unit.aiBehavior || 'aggressive';
    const enemies = players.filter(u => !u.isDead);
    
    if (enemies.length === 0 || reachable.length === 0) return null;

    // Dispatch based on behavior
    switch (behavior) {
        case 'cautious': return this.getCautiousMove(npc, reachable, enemies);
        case 'camper':   return null; // Stationary
        case 'healer':   return this.getHealerMove(npc, reachable, allies, enemies) || this.getCautiousMove(npc, reachable, enemies);
        case 'aggressive': 
        default:         return this.getAggressiveMove(npc, reachable, enemies);
    }
  }

  // ─── Strategies ────────────────────────────────────────────────────────────

  private getAggressiveMove(npc: Unit, reachable: TileData[], enemies: Unit[]): TileData | null {
    // 1. Find nearest enemy
    let nearest: Unit | null = null;
    let minDist = Infinity;
    for (const en of enemies) {
      const d = this.manhattan(npc, en.status.gridX, en.status.gridZ);
      if (d < minDist) { minDist = d; nearest = en; }
    }

    if (!nearest) return null;

    // 2. Move towards him (Minimize distance)
    let bestTile: TileData | null = null;
    let bestDist = Infinity;

    for (const tile of reachable) {
      const d = Math.abs(tile.x - nearest.status.gridX) + Math.abs(tile.z - nearest.status.gridZ);
      if (d < bestDist) { bestDist = d; bestTile = tile; }
    }
    return bestTile;
  }

  private getCautiousMove(npc: Unit, reachable: TileData[], enemies: Unit[]): TileData | null {
    // Goal: Maintain Max Attack Range distance from nearest enemy while still threatening
    // If low HP, just run away.
    
    const isLowHP = (npc.status.currentHealth / npc.status.unit.baseStats.maxHealth) < 0.3;
    
    // Find nearest enemy to fear
    let dangerousEnemy: Unit | null = null;
    let dangerDist = Infinity;
    
    for (const en of enemies) {
        const d = this.manhattan(npc, en.status.gridX, en.status.gridZ);
        if (d < dangerDist) { dangerDist = d; dangerousEnemy = en; }
    }
    
    if (!dangerousEnemy) return null;

    // Determine ideal range
    // If has ranged weapon/skill, ideal is maxRange.
    // Assuming simple range 1 for now if no weapon info handy, but we should scan actions.
    const maxRange = 4; // Arbitrary 'safe' distance or unit's attack range

    let bestTile: TileData | null = null;
    let bestScore = -Infinity;

    for (const tile of reachable) {
        const distToEnemy = Math.abs(tile.x - dangerousEnemy.status.gridX) + Math.abs(tile.z - dangerousEnemy.status.gridZ);
        
        let score = 0;

        if (isLowHP) {
            // Pure Fleeing
            score = distToEnemy; 
        } else {
            // Kiting: Optimal distance is maxRange
            // Penalty for being too close, Penalty for being too far (cant attack)
            // Ideally distToEnemy == maxRange
            score = -Math.abs(distToEnemy - maxRange); 
            
            // Bias towards actually having Line of Sight check? Overkill for now.
        }

        if (score > bestScore) {
            bestScore = score;
            bestTile = tile;
        }
    }

    return bestTile;
  }

  private getHealerMove(npc: Unit, reachable: TileData[], allies: Unit[], enemies: Unit[]): TileData | null {
      // Find injured ally
      const injured = allies.filter(a => !a.isDead && a.id !== npc.id && (a.status.currentHealth < a.status.unit.baseStats.maxHealth * 0.6));
      
      if (injured.length === 0) return null; // No one to heal, fallback to something else

      let target = injured[0]; // Simplification
      
      // Move within range 2-3 of target
      let bestTile: TileData | null = null;
      let minDiff = Infinity;
      const idealRange = 2; 

      for (const tile of reachable) {
          const dist = Math.abs(tile.x - target.status.gridX) + Math.abs(tile.z - target.status.gridZ);
          const diff = Math.abs(dist - idealRange);
          if (diff < minDiff) {
              minDiff = diff;
              bestTile = tile;
          }
      }
      return bestTile;
  }

  private manhattan(u1: Unit, x2: number, z2: number): number {
      return Math.abs(u1.status.gridX - x2) + Math.abs(u1.status.gridZ - z2);
  }

  /** 
   * Evaluate if there's any viable action from the CURRENT position 
   * and decide between attacking or skipping.
   */
  decideAction(npc: Unit, players: Unit[], allies: Unit[], grid: CombatGrid, aoeSystem: AOESystem, actionsMap: Map<string, ActData>, allLivingUnits: Unit[]): AIDecision {
    this.actionsMap = actionsMap;
    const allUnits = allLivingUnits;
    const enemies = players.filter(u => !u.isDead);

    // 1. Try Skills if enough AP
    const skills = npc.status.unit.skillIds
      .map(id => this.actionsMap.get(id))
      .filter(s => s && s.point <= npc.status.currentActPoint) as ActData[];

    for (const skill of skills) {
      const best = this.evaluateAction(npc, skill, enemies, grid, aoeSystem, allUnits);
      if (best) return { type: 'action', action: skill, aoeResult: best };
    }

    // 2. Fallback to Weapons (0 AP)
    for (let i = 0; i < npc.status.unit.weapons.length; i++) {
      const w = npc.status.unit.weapons[i];
      const act = weaponToActData(w, `weapon_${i}`);
      const best = this.evaluateAction(npc, act, enemies, grid, aoeSystem, allUnits);
      if (best) return { type: 'action', action: act, aoeResult: best };
    }

    return { type: 'skip' };
  }

  /**
   * Helps determine if an AI has a strong reason to act FIRST before moving.
   * i.e. It's already in range of an enemy and using an attack right now is valid.
   */
  hasImmediateAction(npc: Unit, players: Unit[], allies: Unit[], grid: CombatGrid, aoeSystem: AOESystem, actionsMap: Map<string, ActData>, allLivingUnits: Unit[]): boolean {
    const decision = this.decideAction(npc, players, allies, grid, aoeSystem, actionsMap, allLivingUnits);
    return decision.type === 'action';
  }

  private evaluateAction(npc: Unit, act: ActData, enemies: Unit[], grid: CombatGrid, aoeSystem: AOESystem, allUnits: Unit[]): AOEResult | null {
    const allTiles = grid.getAttackableTiles(npc.status.gridX, npc.status.gridZ, act.range);
    
    // Filter by minRange
    const minRange = act.minRange ?? 0;
    const tiles = allTiles.filter(t => {
        const dist = Math.abs(t.x - npc.status.gridX) + Math.abs(t.z - npc.status.gridZ);
        return dist >= minRange;
    });

    let best: AOEResult | null = null;
    let maxHits = 0;

    for (const t of tiles) {
      const res = aoeSystem.simulate(act, npc, t, allUnits);
      if (res.targets.length > maxHits) {
        maxHits = res.targets.length;
        best = res;
      }
    }
    return best;
  }
}
