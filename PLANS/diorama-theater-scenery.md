# HD-2D Diorama Theater Scenery — Architecture & Authoring

Status : **active** — May 2026
Replaces : `PLANS/layered-combat-background.md` (deprecated panel-stack approach)

---

## 1. Vision

Octopath Traveler / Triangle Strategy look. Combat plateau 3D posé sur une
scène de théâtre composée de :

```
┌─────────────────────────────────────────────────────┐
│  SKY DOME (gradient procédural, 0 asset)            │
│  ┌─────────────────────────────────────────────┐   │
│  │  BACKDROP PAINTING (gradient ou 1 PNG 4K)   │   │
│  │  oversized 30%, parallax horizontal léger   │   │
│  │  ┌──────────────────────────────────────┐   │   │
│  │  │  MID PROPS 3D (.glb low-poly)        │   │   │
│  │  │  arbres, rochers — instanciés        │   │   │
│  │  │  ┌────────────────────────────────┐  │   │   │
│  │  │  │  COMBAT PLATEAU 3D (gameplay)  │  │   │   │
│  │  │  └────────────────────────────────┘  │   │   │
│  │  │  FOREGROUND PROPS 3D (.glb)          │   │   │
│  │  └──────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────┘   │
│  POST-FX : vignette + bloom + ACES tone mapping     │
└─────────────────────────────────────────────────────┘
```

**Principes** :

- **UN seul plan** pour le backdrop (pas de stack de panneaux).
- **3D pour tout ce qui doit donner de la profondeur** (arbres, rochers,
  buissons). Pas de PNG verticaux billboardés en mid/foreground.
- **Procédural quand possible** : gradient backdrop + primitives low-poly
  comme placeholders avant les vrais `.glb`.
- **Géométrie déterministe** : la taille du backdrop est calculée depuis
  le FOV de la caméra et la distance, indépendamment du contenu.

---

## 2. Modules

| Fichier | Rôle |
| --- | --- |
| `src/rendering/SceneryTypes.ts` | Schéma d'autorisation : `BackdropConfig`, `Prop3DPlacement`, `ScenePostFXConfig`, `SceneryConfig`. |
| `src/rendering/SceneBackdropManager.ts` | Un plan billboardé positionné à `distance` derrière la caméra. Gradient procédural ou texture. Parallax horizontal. |
| `src/rendering/SceneProps3DManager.ts` | Place les `Prop3DPlacement[]` dans la scène. Primitives Babylon (cone / blob / rock / bush / pillar / crystal) ou `.glb` via `PROP_ASSET_REGISTRY`. |
| `src/rendering/ScenePostFX.ts` | Wrapper `DefaultRenderingPipeline` : ACES tone mapping + vignette + bloom + grain. `setCinematicMode()` boost pendant les Focus. |
| `src/rendering/SceneGroundTypes.ts` | `SceneGroundLayerConfig` (sol horizontal du plateau, indépendant du décor). |
| `src/biomes/forestBiome.ts` | Preset `forestSceneryPreset` (21 props procéduraux) + presets minimalistes plains/mountain/swamp/ruins/city + registry `BIOME_SCENERY_PRESETS`. |
| `src/combat/CombatScene.ts` | Consomme `mapData.scenery` (override) merged sur `getDefaultScenery(biome)`. Câble `_backdrop` + `_props3D` + `_postFX` après création de la caméra. |

---

## 3. Authoring — `public/data/maps/map_<biome>.json`

Contrat v5 :

```jsonc
{
  "version": "5.0",
  "gridW": 8, "gridD": 6, "biome": "forest", "floorY": 0,
  "groundLayer": { /* sol du plateau, inchangé */ },
  "scenery": {
    "biome": "forest",
    "backdrop": {
      "gradient": { "top": [0.025, 0.055, 0.060], "bottom": [0.080, 0.190, 0.140] },
      "distance": 80,
      "parallaxFactor": 0.12,
      "oversize": 1.35,
      "image": "backdrop_forest.jpg"   // optionnel ; gradient seul si absent
    },
    "props": [
      { "primitive": "tree-cone", "position": [-6, 0, 22], "scale": 1.4, "tint": [0.10, 0.22, 0.14] },
      { "asset": "tree_oak_01",   "position": [ 2, 0, 24], "scale": 1.0 },
      { "primitive": "bush",      "position": [-3, 0, -2], "scale": 1.6, "depth": "foreground" }
    ],
    "postFX": {
      "vignetteIntensity": 0.45, "bloomThreshold": 0.85, "bloomWeight": 0.45,
      "grain": 4, "toneMapping": true, "exposure": 1.0, "contrast": 1.08
    },
    "ambient": { "color": [0.40, 1.00, 0.30], "count": 24, "alpha": [0.10, 0.30] }
  }
}
```

**Override partiel** : si une section est absente, le default du preset
biome la fournit. Si `props` est absent, on garde les props du preset
forest (idéal pour valider rapidement un nouveau backdrop / postFX sans
toucher au layout).

### Convention de coordonnées (forest)

Avec `gridW=8 gridD=6 tileSize=2` → `mapW=16 mapD=12`, le plateau s'étend
sur `x ∈ [0..16]` et `z ∈ [0..12]`.

| Slot | x | z | depth |
| --- | --- | --- | --- |
| Back row (lointain) | -6 → 20 | 22 → 24 | `mid` |
| Mid (autour du plateau arrière) | -7, 18, 22 | 15 → 18 | `mid` |
| Side flanks | -7, 23 | 4 → 10 | `mid` ou `foreground` |
| Foreground frame | -5, 11, 18 | -2 → -5 | `foreground` |
| Ground details | éparpillé | 2 → 11 | `mid` |

`depth: 'foreground'` :
- assigne `renderingGroupId = 1` (rendu après le plateau)
- assombrit légèrement le tint pour silhouette

---

## 4. Comportement par mode caméra

`TacticalCamera.onModeChanged` est branché à `ScenePostFX.setCinematicMode()` :

| Mode | Comportement scenery |
| --- | --- |
| **Normal** | Backdrop visible, parallax actif, post-FX nominal. |
| **Overview** | Backdrop oversize 1.35 absorbe le FOV élargi (×1.45). Pas d'ajustement explicite. |
| **Focus** | `ScenePostFX.setCinematicMode(true)` → vignette +0.3, grain ×1.5, chromatic aberration. Backdrop reste mais devient secondaire visuellement. |

---

## 5. Workflow ajout d'un nouveau biome

1. Ajouter le biome au `BiomeId` union dans `SceneryTypes.ts`.
2. Définir le preset dans `src/biomes/<biome>Biome.ts` (ou ajouter au
   `forestBiome.ts` qui contient déjà 6 biomes).
3. Référencer dans `BIOME_SCENERY_PRESETS`.
4. Tester sans JSON dédié (le preset suffit comme défaut).
5. Pour customiser une map : créer `public/data/maps/map_<biome>.json`
   avec un bloc `scenery` partiel.

---

## 6. Ajout d'assets .glb réels (Kenney / Quaternius)

1. Télécharger un kit Kenney Nature ou Quaternius Ultimate Nature.
2. Extraire les `.glb` dans `public/assets/props/<biome>/`.
3. Enregistrer dans `PROP_ASSET_REGISTRY` :
   ```ts
   PROP_ASSET_REGISTRY['tree_oak_01'] = 'assets/props/forest/tree_oak_01.glb';
   ```
4. (À implémenter) Compléter le chargement `.glb` dans
   `SceneProps3DManager.placeOne` via `SceneLoader.ImportMeshAsync`.
5. Mettre à jour les placements pour utiliser `asset: 'tree_oak_01'`
   au lieu de `primitive: 'tree-blob'`.

Le système retombe automatiquement sur la primitive si le `.glb` n'est
pas trouvé, donc on peut migrer prop par prop sans casser l'écran.

---

## 7. Authoring backdrop image (étape future)

Quand on commande/peint le backdrop forest :

| Champ | Valeur |
| --- | --- |
| Résolution | 3840 × 2160 (16:9 4K UHD) |
| Format | JPG (PNG si silhouette transparente du ciel) |
| Path | `public/assets/backdrops/backdrop_forest.jpg` |
| Contenu | Forêt profonde brumeuse, gradient bleu-vert sombre haut → vert moyen bas, silhouettes de troncs lointains, particules de lumière |
| Marge | Aucune — le `oversize: 1.35` du moteur s'occupe d'absorber FOV Overview et parallax. |

Une fois le JPG en place, mettre dans `map_forest.json > scenery.backdrop.image`.

---

## 8. Checklist QA visuelle

Pour chaque mode caméra (Normal / Overview / Focus) :

- [ ] Pas de bandes noires sur les bords (oversize correct).
- [ ] Le backdrop ne se sépare pas du sol en bas (gradient cohérent avec `groundLayer.color`).
- [ ] Les sprites de personnages restent lisibles (foreground props pas trop opaques).
- [ ] Le parallax horizontal est perceptible mais subtil (pas de glissement violent).
- [ ] Aucune ombre dure 2D/3D au pied des props.
- [ ] Focus mode : la vignette ne mange pas la grille tactique.

---

## 9. Suppression du legacy

Système retiré (~2 230 lignes) :

- `src/rendering/SceneLayerManager.ts`
- `src/rendering/SceneLayerTypes.ts`
- `src/rendering/StageGeometry.ts`
- `src/biomes/magicalForestLayers.ts`
- `src/editor/MapEditorLayersTab.ts`

L'onglet "Layers" du `MapEditor` affiche désormais un placeholder
"Scenery editor — coming soon" pointant vers le JSON.
