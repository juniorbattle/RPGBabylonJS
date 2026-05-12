/**
 * PATCH — Intégration de ProceduralComposer dans MapEditor.ts
 *
 * 1. Ajouter l'import en haut du fichier
 * 2. Ajouter la propriété privée
 * 3. Remplacer runProceduralGroundProps() et spawnZone()
 */

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 1 — Import (ajouter avec les autres imports en haut de MapEditor.ts)
// ─────────────────────────────────────────────────────────────────────────────

import { ProceduralComposer, ComposerSpawnCallbacks } from './ProceduralComposer';

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — Propriété privée (dans la classe MapEditor, après animatedSprites)
// ─────────────────────────────────────────────────────────────────────────────

private composer: ProceduralComposer = new ProceduralComposer();

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 3 — Remplacer runProceduralGroundProps() par la version ci-dessous.
//           Supprimer aussi spawnZone() qui n'est plus utilisée.
// ─────────────────────────────────────────────────────────────────────────────

public runProceduralGroundProps(): void {
    // Effacer les props procéduraux précédents
    this.propsRoot.getChildren()
        .filter(c => (c as any).isProcedural)
        .forEach(c => this.disposeChild(c));

    const def = this.getBiomeDef(this.currentBiome);
    if (!def) return;

    // Callbacks vers les méthodes de spawn existantes
    const callbacks: ComposerSpawnCallbacks = {
        spawnStatic: (file, x, y, z, mirror, scale, isProcedural, layer) => {
            this.spawnProp(file, x, y, z, mirror, scale, isProcedural, layer);
        },
        spawnAnimated: (animDef, x, y, z, mirror, scale, isProcedural, layer) => {
            this.spawnAnimatedProp(animDef, x, y, z, mirror, scale, isProcedural, layer);
        },
        getBasePropSize: (type) => this.getBasePropSize(type),
    };

    this.composer.generate(
        this.getGridBounds(),
        this.tileSize,
        def,
        this.allProps,
        this.allAnimatedProps,
        this.currentFloorY,
        this.procDensity,
        this.procSeed,
        callbacks
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE : La méthode spawnZone() peut être supprimée — elle est entièrement
//        remplacée par ProceduralComposer.fillZone() (interne au composer).
// ─────────────────────────────────────────────────────────────────────────────
