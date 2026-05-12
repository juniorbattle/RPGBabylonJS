/**
 * main.ts
 * Entry point of the GPA Tactics Babylon.js application.
 * Bootstraps the SceneManager for Map/Combat lifecycle.
 */

import { SceneManager } from './SceneManager';
import { MapEditor }    from './editor/MapEditor';

function bootstrap(): void {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;

  if (!canvas) {
    console.error('❌ #renderCanvas not found in DOM');
    return;
  }

  // VERY SIMPLE ROUTER !
  // If the user visits localhost:3000/?editor=true, load the Visual Level Editor instead of the game!
  const urlParams = new URLSearchParams(window.location.search);
  const isEditorMode = urlParams.get('editor') === 'true';

  if (isEditorMode) {
      console.log('🛠️ La Voie des Sceaux — Starting LEVEL EDITOR MODE');
      const editor = new MapEditor(canvas);
      editor.start().then(() => {
          const loadingScreen = document.getElementById('loadingScreen');
          if (loadingScreen) {
              loadingScreen.classList.add('hidden');
              setTimeout(() => {
                  loadingScreen.style.display = 'none'; // Assure la suppression du layout
              }, 500);
          }
      });
  } else {
      console.log('🎮 La Voie des Sceaux — Starting Application...');
      const sceneManager = new SceneManager(canvas);
      sceneManager.start();
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// ─── Hot Module Replacement ───────────────────────────────────────────────────

if ((module as any).hot) {
  (module as any).hot.accept();
}
