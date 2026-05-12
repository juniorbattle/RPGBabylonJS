/**
 * TurnManager.ts
 * Controls the turn order system for tactical combat.
 *
 * Port of Unity's TurnManager.cs.
 *
 * Turn order: Sorted by Dexterity (DEX) descending at battle start.
 * Each unit gets one full turn (move + act), then passes to next.
 * Events: onTurnStart, onTurnEnd, onBattleEnd.
 */

import { Unit }     from '../units/Unit';
import { StatType } from '../data/types/UnitData';
import { TickResult } from '../units/TurnStatus';

// ─── Events ───────────────────────────────────────────────────────────────────

export type TurnEvent     = (unit: Unit, turnNumber: number, tickResults?: TickResult[]) => void;
export type BattleEndEvent = (winner: 'TeamA' | 'TeamB' | 'draw') => void;

// ─── TurnManager ─────────────────────────────────────────────────────────────

export class TurnManager {

  private units:       Unit[]  = [];  // Sorted turn order
  private currentIdx:  number  = -1;
  private turnNumber:  number  = 0;
  private active:      boolean = false;

  // ─── Callbacks (set by CombatManager / CombatScene) ─────────────────────
  onTurnStart?:  TurnEvent;
  onTurnEnd?:    TurnEvent;
  onBattleEnd?:  BattleEndEvent;

  // ─── Init ────────────────────────────────────────────────────────────────

  /**
   * Initialize with all units for this battle.
   * Sort by DEX descending (higher DEX acts first).
   * Port of TurnManager.SetupTurnOrder().
   */
  setup(units: Unit[]): void {
    // Filter dead units (shouldn't happen at start, but defensive)
    this.units      = [...units].filter(u => !u.isDead);
    this.currentIdx = -1;
    this.turnNumber = 0;
    this.active     = true;

    // Sort by dexterity descending
    this.units.sort((a, b) =>
      b.status.getModifiedStat(StatType.Dexterity) -
      a.status.getModifiedStat(StatType.Dexterity)
    );

    console.log('⚔️ Turn order:', this.units.map(u => `${u.name} (DEX:${u.status.getModifiedStat(StatType.Dexterity)})`).join(' → '));
  }

  // ─── Turn control ────────────────────────────────────────────────────────

  /**
   * Advance to the next unit's turn.
   * Skips dead units automatically.
   * Returns the new active unit, or null if battle is over.
   */
  nextTurn(): Unit | null {
    if (!this.active) return null;

    // 1. Check battle-end condition early
    const battleResult = this.checkBattleEnd();
    if (battleResult) {
      this.active = false;
      this.onBattleEnd?.(battleResult);
      return null;
    }

    // 2. Deactivate previous unit
    const prev = this.currentUnit;
    if (prev && !prev.isDead) { // Don't try to deactivate if it's already dead/disposed
      prev.setActive(false);
      this.onTurnEnd?.(prev, this.turnNumber);
    }

    // 3. Find the NEXT valid unit robustly
    // Instead of relying on a fragile array index that shifts when elements are removed,
    // we scan forward from the currentIdx to find the next living unit.
    let nextIdx = this.currentIdx;
    let foundNext = false;
    let attempts = 0;

    while (attempts < this.units.length && !foundNext) {
        nextIdx = (nextIdx + 1) % this.units.length;
        const potentialUnit = this.units[nextIdx];
        if (potentialUnit && !potentialUnit.isDead) {
            foundNext = true;
        }
        attempts++;
    }

    if (!foundNext) return null; // No living units found

    // Now it's safe to update our main index
    this.currentIdx = nextIdx;

    // 4. Update the Queue internally by filtering dead units AFTER finding the next one.
    // This prevents the shift bug where array splice messes up the +1 step.
    const activeUnitInstance = this.units[this.currentIdx];
    this.units = this.units.filter(u => !u.isDead);
    
    // Resync currentIdx to point to that specific active unit in the new cleaned array
    this.currentIdx = this.units.indexOf(activeUnitInstance);

    this.turnNumber++;

    const current = this.currentUnit;
    if (!current) return null;

    // 5. Begin the new unit's turn 
    current.setActive(true);
    const ticks = current.status.onTurnStart();
    this.onTurnStart?.(current, this.turnNumber, ticks);

    console.log(`⚔️ Turn ${this.turnNumber}: ${current.name} (${current.team})`);
    return current;
  }

  /** Start the very first turn */
  startBattle(): Unit | null {
    if (this.units.length === 0) {
      console.error('⚔️ TurnManager: No units registered. Call setup() first.');
      return null;
    }
    return this.nextTurn();
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /** Currently active unit */
  get currentUnit(): Unit | null {
    return this.units[this.currentIdx] ?? null;
  }

  /** All living units */
  get livingUnits(): Unit[] {
    return this.units.filter(u => !u.isDead);
  }

  /** All units on a specific team */
  getTeam(team: 'TeamA' | 'TeamB'): Unit[] {
    return this.livingUnits.filter(u => u.team === team);
  }

  /** Current turn number (1-based) */
  get currentTurn(): number { return this.turnNumber; }

  /** Sorted turn order for UI display */
  get turnOrder(): Unit[] { return [...this.units]; }

  /** Is the battle still ongoing? */
  get isActive(): boolean { return this.active; }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  /** Ordered unit list for TurnOrderUI */
  getQueue(): Unit[] { 
    return this.units.filter(u => !u.isDead); 
  }

  /** Index of the currently active unit in the queue */
  getActiveIndex(): number { return this.currentIdx; }

  /** Index of a specific unit in the queue (-1 if not found) */
  getUnitIndex(unit: Unit): number { return this.units.indexOf(unit); }

  // ─── Battle-end logic ─────────────────────────────────────────────────────

  public checkBattleEnd(): 'TeamA' | 'TeamB' | 'draw' | null {
    const teamA = this.units.filter(u => u.team === 'TeamA' && !u.isDead);
    const teamB = this.units.filter(u => u.team === 'TeamB' && !u.isDead);

    if (teamA.length === 0 && teamB.length === 0) return 'draw';
    if (teamA.length === 0) return 'TeamB';
    if (teamB.length === 0) return 'TeamA';
    return null;
  }
}
