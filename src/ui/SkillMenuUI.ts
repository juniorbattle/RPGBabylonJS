/**
 * SkillMenuUI.ts
 * Facade — delegates to ActionBarUI's embedded skill popup.
 * The visual lives in ActionBarUI; this class keeps the CombatManager API stable.
 */
import { ActData }    from '../data/types/ActData';
import { ActionBarUI } from './ActionBarUI';

export class SkillMenuUI {
  private bar?: ActionBarUI;

  /** Connect this facade to the ActionBarUI instance. Call before startBattle(). */
  bindActionBar(bar: ActionBarUI): void {
    this.bar = bar;
  }

  showSkills(
    skills:     ActData[],
    currentAP:  number,
    onSelected: (skill: ActData) => void,
    onClose:    () => void,
  ): void {
    this.bar?.openSkillPopup(skills, currentAP, onSelected, onClose);
  }

  hide(): void {
    this.bar?.closeSkillPopup();
  }

  dispose(): void {
    // ActionBarUI owns the DOM — nothing to do here
  }
}
