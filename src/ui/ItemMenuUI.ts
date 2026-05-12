/**
 * ItemMenuUI.ts
 * Facade for the ActionBar's item popup.
 */
import { InventoryItem } from '../data/types/ItemData';
import { ActionBarUI }   from './ActionBarUI';

export class ItemMenuUI {
  private bar?: ActionBarUI;

  bindActionBar(bar: ActionBarUI): void {
    this.bar = bar;
  }

  showItems(
    items:      InventoryItem[],
    onSelected: (item: InventoryItem) => void,
    onClose:    () => void,
  ): void {
    this.bar?.openItemPopup(items, onSelected, onClose);
  }

  hide(): void {
    this.bar?.closeItemPopup();
  }

  dispose(): void {}
}
