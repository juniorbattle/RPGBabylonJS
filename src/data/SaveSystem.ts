/**
 * SaveSystem.ts
 * Orchestrates persistence of Game and Clan state to LocalStorage.
 */

import { GameManager } from './GameManager';
import { ClanManager } from './ClanManager';
import { QuestManager } from './QuestManager';
import { MenuManager } from '../ui/MenuManager';

const SAVE_KEY_PREFIX = "tactics_rpg_save_";
const CURRENT_VERSION = 1;

interface SaveFile {
  version: number;
  timestamp: number;
  game: any;
  clan: any;
  quests: any;
}

export class SaveSystem {

  public static saveGame(slot: number = 1): void {
    const gameState = GameManager.getInstance().getSnapshot();
    const clanState = ClanManager.getInstance().getSnapshot();
    const questState = QuestManager.getInstance().getSnapshot();

    const saveFile: SaveFile = {
      version: CURRENT_VERSION,
      timestamp: Date.now(),
      game: gameState,
      clan: clanState,
      quests: questState
    };

    try {
      const json = JSON.stringify(saveFile);
      localStorage.setItem(`${SAVE_KEY_PREFIX}${slot}`, json);
      console.log(`💾 Game saved to slot ${slot}`);
      // Notification visual could be added here
    } catch (e) {
      console.error("Failed to save game:", e);
    }
  }

  public static loadGame(slot: number = 1): boolean {
    const key = `${SAVE_KEY_PREFIX}${slot}`;
    const json = localStorage.getItem(key);
    
    if (!json) {
      console.warn(`No save found in slot ${slot}`);
      return false;
    }

    try {
      const saveFile: SaveFile = JSON.parse(json);
      
      // Version check / migration logic could go here
      
      console.log(`📂 Loading save from ${new Date(saveFile.timestamp).toLocaleString()}...`);

      // Restore States
      GameManager.getInstance().loadSnapshot(saveFile.game);
      ClanManager.getInstance().loadSnapshot(saveFile.clan);
      QuestManager.getInstance().loadSnapshot(saveFile.quests);
      
      // Trigger scene refresh if in World Map
      if ((window as any).reloadWorldState) {
          (window as any).reloadWorldState();
      }

      // Close menu to show result
      MenuManager.getInstance().hide();

      return true;
    } catch (e) {
      console.error("Failed to load save:", e);
      return false;
    }
  }

  public static hasSave(slot: number = 1): boolean {
    return !!localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`);
  }
}
