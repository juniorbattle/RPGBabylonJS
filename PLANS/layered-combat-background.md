# Plan - Refondation Layers 2.5D Combat BabylonJS

## Objectif

Refonder l'integration des decors 2.5D dans la scene de combat BabylonJS autour d'un contrat 16:9 compose.

Le rendu attendu n'est pas une pile de plans rectangulaires. Il faut donner l'impression que la grid 3D est posee dans la partie basse d'une scene peinte complete, avec des couches qui renforcent la profondeur et une brume qui masque les raccords.

## Architecture

Fichiers principaux :
- `src/rendering/SceneLayerTypes.ts` (incl. `SceneGroundLayerConfig`)
- `src/rendering/SceneLayerManager.ts`
- `src/biomes/magicalForestLayers.ts`
- `src/combat/CombatScene.ts`
- `src/editor/MapEditor.ts`
- `src/editor/MapEditorLayersTab.ts`

La facade de compatibilite `src/combat/BiomeLayerSystem.ts` a ete supprimee. Le composer procedural extrait `src/editor/ProceduralComposer.ts` et son patch `src/editor/MapEditor.patch.ts` ont egalement ete retires (jamais branches en runtime).

## Contrat de Layers

Layers standard (alias legacy entre parentheses) :
- `backAtmosphere` (`background`)
- `mainMidground` (`midground`)
- `groundBlend` (`platform_blend_fog`)
- `foregroundCorners` (`foreground_frame`)
- `upperCanopy`
- `fxOverlay`

Ordre visuel :
1. backAtmosphere
2. mainMidground
3. groundBlend (masque le raccord plateau/decor)
4. grid 3D
5. characters
6. foregroundCorners
7. upperCanopy
8. fxOverlay
9. UI

## Sol (Ground Layer)

Le sol horizontal est pilote independamment des layers PNG via `SceneGroundLayerConfig` :
- `mode: 'procedural' | 'texture' | 'color'` ;
- `widthScale` / `depthScale` (multipliateurs du grid) ;
- `xOffset` / `zOffset` / `elevationOffset` ;
- `repeatX` / `repeatY` pour le mode texture (wrap) ;
- `opacity`, `color`, `textureFile`.

Stocke dans la map sous la cle `groundLayer`. Le `MapEditor` expose un panneau "Sol horizontal" qui edite ces champs.

## SceneLayerManager

Le manager doit :
- creer les planes BabylonJS ;
- charger les textures ;
- appliquer alpha, blend mode et emissive ;
- garder tous les layers non pickables ;
- gerer les presets camera front/overview ;
- exposer `buildLayers`, `applyCameraMode`, `setCinematicMode`, `dispose`.

Les PNG peints doivent utiliser :
- `disableLighting = true`
- `backFaceCulling = false`
- `useAlphaFromDiffuseTexture = true`
- `isPickable = false`

## CombatScene

Objectifs :
- utiliser `SceneLayerManager` ;
- garder `gridElevation` comme controle dedie du plateau ;
- piloter le sol via `groundLayer` (`SceneGroundLayerConfig`) ;
- ne plus dependre du vieux ciel/sol procedural quand un set de layers est actif ;
- conserver les particules legeres ;
- ne pas casser selection, deploiement, attaque, AOE, details.

Les helpers `buildStageLightShafts`, `buildDepthLayers` et leurs textures procedurales associees ont ete supprimes : le `SceneLayerManager` couvre desormais entierement le foreground/canopy/haze.

## MapEditor

Objectifs :
- preview 3D directe avec le meme `SceneLayerManager` que le runtime ;
- pile libre de layers (ajouter, dupliquer, ordonner, vider) ;
- presets rapides `Back / Mid / Ground / Frame / Canopy / FX` qui patchent un layer existant ;
- panneau "Sol horizontal" pour `groundLayer` (procedural / texture / couleur) ;
- export stable des overrides (cles `sceneLayers` et `groundLayer`) ;
- laisser les props disponibles, mais secondaires.

L'ancien onglet biome procedural (sky/ground seeds, repaint sky/sol, density slider) a ete retire. Les `proceduralMeta.seed/density/cloudSeed/groundSeed` restent sauvegardes dans le JSON pour compat ascendante.

## Tests

Type-check :
- `npx.cmd tsc --noEmit`

Validation manuelle :
- front camera : decor profond, grid lisible, unites visibles ;
- overview camera : foreground reduit, pas de plans bizarres ;
- deploiement : selectionner une unite, cliquer une case, repositionner ;
- actions : AOE, attaque, soin/buff, details ;
- MapEditor : preview, export, import, rendu CombatScene.

## Critere de Reussite

Le travail est reussi si la scene se rapproche du mockup objectif :
- foret englobante ;
- plateau integre dans le bas de l'image ;
- pas de bords rectangulaires visibles ;
- brume basse coherente ;
- personnages prioritaires ;
- gameplay intact.

---

## Architecture deterministe (refonte mai 2026)

L'iteration originale laissait chaque JSON definir `widthScale / height / yOffset / zOffset` par layer. Resultat : le tuning visuel etait dicte par les particularites de chaque PNG (centrage, transparence, contenu), ce qui forcait a redeviner les chiffres a chaque nouvelle texture. La refonte inverse le flux : la scene impose ses proportions, l'image s'adapte.

### Modules cles

- `src/rendering/StageGeometry.ts` : calcule pour chaque `compositionRole` une `RoleStageBox` (`width`, `height`, `yCenter`, `zOffset`, `aspectRatio`) a partir de `mapW` / `mapD` / `baseSurfaceY`. Une seule table `ROLE_PROPORTIONS` regle la geometrie de toute la pile.
- `src/rendering/SceneLayerTypes.ts` : type `ImageFit = 'stretch' | 'cover' | 'tile-x' | 'tile-xy'` + champs `imageFit` et `imageAspectRatio` sur `SceneLayerAsset`.
- `src/rendering/SceneLayerManager.ts` :
  - `applyStageGeometry()` ecrase `widthScale/height/yOffset/zOffset` pour tout layer avec un role connu, juste apres la resolution du preset.
  - `applyAutoFit()` (deja existant) repositionne `groundBlend` a partir du `mainMidground` ajuste.
  - `applyImageFit()` (helper module) regle wrap/uScale/vScale/uOffset/vOffset selon `(planeAspect, imgAspect)`.
  - `setCinematicIntent(intent)` applique un scaling alpha typage selon `INTENT_PRESETS` (`idle | attack | skill | aoe | death | dialogue`).
- `src/camera/TacticalCamera.ts` : 3 modes `Normal / Overview / Focus`. Le type `SceneLayerCameraMode` couvre les trois ; `cameraOpacity.focus` est consomme par `applyCameraMode('focus')`.

### Contrat JSON par layer (apres refonte)

Pour les roles connus, le JSON ne decrit plus que l'**art** et le **comportement**, jamais la geometrie :

```jsonc
{
  "id": "main_midground",
  "compositionRole": "mainMidground",   // <- choisit la box de StageGeometry
  "file": "mid_forest_v3_alpha.png",
  "imageFit": "cover",                   // <- contrat de mapping image -> plane
  "imageAspectRatio": 1.0,               // <- aspect natif de la PNG
  "opacity": 1,
  "blendMode": "alpha",
  "emissive": [1, 1, 1],
  "cameraOpacity": { "front": 1, "overview": 0.85, "focus": 0.95 },
  "parallaxStrength": 0.07,
  "scrollSpeedX": 0
}
```

Les champs `widthScale / height / yOffset / zOffset` y sont laisses inertes : `applyStageGeometry()` les ecrase. Pour un layer custom sans role, ils reprennent leur sens classique.

### Table des ratios cibles (mai 2026)

`ROLE_PROPORTIONS` (cf. `StageGeometry.ts`) sur une map 8x8 (`stageWidth = 8u`) donne :

| Role                | Width   | Height  | yCenter | zOffset | Aspect cible | Format PNG recommande |
| ------------------- | ------- | ------- | ------- | ------- | ------------ | --------------------- |
| `skyVoidFill`       | 20 u    | 14.4 u  | +15     | +50     | ~1.4         | Couleur unie ou degrade vertical 1024x720 |
| `backAtmosphere`    | 12.8 u  | 4.0 u   | +8      | +32     | **3.2**      | Bande horizon 3072x960 |
| `mainMidground`     | 10.4 u  | 3.6 u   | +5      | +22     | **2.9**      | Foret dense 2900x1000 |
| `foregroundCorners` | 12.8 u  | 5.6 u   | +4      | -3      | **2.3**      | Cadre / coins 2300x1000, alpha au centre |
| `upperCanopy`       | 10.4 u  | 2.8 u   | +12     | -3      | **3.7**      | Feuillage haut 2960x800 |
| `fxOverlay`         | 11.2 u  | 4.4 u   | +6      | -1      | **2.5**      | Particules / brume 2500x1000 (seamless ideal) |

Les images actuelles utilisent souvent un ratio ~1:1 ; le systeme les traite via `imageFit: cover` (le centre de la PNG est conserve, les bords sont croppes). Pour eliminer le crop, generer ou commander des images aux ratios ci-dessus puis mettre `imageAspectRatio` au ratio natif (ex: 3.2 pour back_atmosphere).

### Workflow nouveau biome

1. Dupliquer `public/data/maps/map_forest.json`.
2. Remplacer les `file` de chaque layer par les PNG du nouveau biome.
3. Ajuster `imageAspectRatio` si les nouvelles PNG ne sont pas a 1:1.
4. Ajuster `cameraOpacity` et `parallaxStrength` selon l'intention artistique.
5. Optionnellement ajuster `emissive` (tint) et `scrollSpeed*`.
6. Aucune valeur de geometrie a regler : `StageGeometry` s'en charge.

Pour modifier la mise en scene de tous les biomes a la fois : editer `ROLE_PROPORTIONS` dans `src/rendering/StageGeometry.ts`. Une seule source de verite.

### Intentions cinematiques

`SceneLayerManager.setCinematicIntent(intent)` applique un scaling alpha par role :

| Intent     | foregroundCorners | upperCanopy | fxOverlay | groundBlend | Notes |
| ---------- | ----------------- | ----------- | --------- | ----------- | ----- |
| `idle`     | x1                | x1          | x1        | x1          | Etat de base, alpha de `cameraOpacity[mode]` |
| `attack`   | x0.35             | x0.45       | x0.5      | x0.72       | Cadre s'efface |
| `skill`    | x0.20             | x0.30       | **x1.20** | x0.85       | FX boostes |
| `aoe`      | x0.15             | x0.25       | x0.80     | x0.60       | Foreground tres efface |
| `death`    | x0.50             | x0.55       | **x1.30** | **x1.40**   | Atmosphere lourde |
| `dialogue` | x0.55             | x0.60       | hidden    | x1          | Lisibilite des visages |

L'intent persiste a travers les changements de mode camera (re-applique dans `applyCameraMode`). Les valeurs sont editables dans `INTENT_PRESETS` (cf. `SceneLayerManager.ts`).

### Verifications visuelles

A chaque modification de `ROLE_PROPORTIONS` ou ajout d'image, capturer :
1. Vue **Normal** (deploiement / tour standard).
2. Vue **Overview** (touche dediee, camera plonge).
3. Vue **Focus** (attaque / skill, camera proche du sprite).

Criteres :
- Aucun bord visible du plane (sky_void_fill doit toujours couvrir).
- Aucune fracture entre `back_atmosphere` et le ciel (le skyVoidFill comble derriere).
- Le `groundBlend` masque la jonction plateau 3D / decor 2D.
- En focus, le `foregroundCorners` ne masque pas le sprite (alpha 0.15 par defaut).
- Les sprites des personnages restent lisibles dans les 3 modes.

Si une PNG sort mal cadree en `cover`, ajuster en priorite `imageAspectRatio` (et pas la geometrie). En dernier recours, repasser le layer en `imageFit: stretch` ou fournir une PNG au ratio cible.
