# AGENTS.md — HD-2D Diorama Theater Combat BabylonJS

## Contexte

Le projet est un RPG tactics 2.5D sous BabylonJS. La scene de combat combine :
- une grid 3D tactique posee sur un plateau ;
- des unites en sprites/billboards ;
- une UI HTML superposee ;
- un **diorama 3D** en arriere-plan (backdrop peint + props 3D + post-FX).

La priorite visuelle est claire : le decor doit englober la scene, mais la grid et les unites restent toujours lisibles et prioritaires.

## Direction Artistique

Le rendu vise une scene HD-2D fantasy type Octopath Traveler / Triangle Strategy :
- backdrop peint a grande distance (gradient procedural ou image AI 4K) ;
- volumes 3D entre le plateau et le backdrop pour la profondeur reelle ;
- post-FX cinematique : bloom doux, vignette, ACES tone mapping, grain leger ;
- brouillard exponentiel teal-jade pour l'aerial perspective ;
- god rays opt-in pour les rayons obliques de soleil ;
- lucioles ambiantes pour la magie.

## Architecture Diorama

Le pipeline scenery est defini dans `src/rendering/SceneryTypes.ts` (`SceneryConfig`) et orchestre par `CombatScene.setupSceneryWithCamera()`. Quatre managers se partagent les responsabilites :

| Manager | Fichier | Role |
| --- | --- | --- |
| `SceneBackdropManager` | `src/rendering/SceneBackdropManager.ts` | Plane unique billboarded a distance fixe de la camera. Gradient procedural ou image (`BackdropConfig.image`). Parallax horizontal. |
| `SceneProps3DManager` | `src/rendering/SceneProps3DManager.ts` | Place les primitives (`tree-cone`, `tree-blob`, `rock`, `bush`, `pillar`, `crystal`) ou assets `.glb` definis dans `SceneryConfig.props`. |
| `SceneDioramaManager` | `src/rendering/SceneDioramaManager.ts` | Charge un `.glb` mega-prop (workflow Tripo3D / Blender) defini dans `SceneryConfig.diorama`. Voir `public/assets/dioramas/README.md`. |
| `ScenePostFX` | `src/rendering/ScenePostFX.ts` | Reconfigure le `DefaultRenderingPipeline` (vignette, bloom, grain, tone mapping, exposure, contrast). |

Ordre logique de l'arriere vers l'avant :
1. Sky dome / `clearColor` (procedural).
2. **Backdrop painting** (gradient ou image 4K, single plane parallax).
3. **Mid props 3D** (volumes proceduraux ou diorama `.glb`).
4. Grid 3D + plateau combat.
5. Unites (sprites/billboards).
6. **God rays** (5 quads inclines additifs, opt-in).
7. **Fireflies** (particules ambiantes).
8. **Post-FX** (vignette + bloom + grain + ACES via pipeline).
9. UI HTML.

Le sol horizontal n'est pas un layer : c'est un objet `SceneGroundLayerConfig` (cle `groundLayer` dans le JSON de map) avec 3 modes : `procedural` (DynamicTexture par biome), `texture` (PNG repeat-tile), ou `color` (uni). Type defini dans `src/rendering/SceneGroundTypes.ts`.

## Regles Techniques

Toute modification scenery doit passer par les managers ci-dessus. Ne JAMAIS reintroduire :
- `SceneLayerManager`, `SceneLayerTypes`, `StageGeometry`, `magicalForestLayers` (deprecated panel-stack architecture, supprimes).
- Helpers procedural locaux (`buildStageLightShafts`, `buildDepthLayers`, `createForegroundFoliageTexture`) dans `CombatScene.ts` : la responsabilite appartient aux managers.
- Roles legacy (`skyVoidFill`, `backAtmosphere`, `mainMidground`, `groundBlend`, `foregroundCorners`, `upperCanopy`, `fxOverlay`).

Pour chaque mesh decor :
- `isPickable = false` (jamais bloquer les clics de deploiement / selection / AOE) ;
- `renderingGroupId = 0` (sauf cas explicite) ;
- materials non picklables tracked pour disposal dans `dispose()` des managers.

Le backdrop plane garde `disableLighting = true` (peinture, pas geometrie) ; les props 3D recoivent l'eclairage scene (sun + rim + spotlight). Un diorama peut opter-out via `DioramaConfig.receivesLighting = false` si l'embedded lighting est suffisant.

## Eclairage Combat

Quatre lumieres permanentes dans `CombatScene.setupLighting()` :

| Light | Type | Role |
| --- | --- | --- |
| `ambCombat` | HemisphericLight | Ambient general teinte biome |
| `sunCombat` | DirectionalLight | Soleil warm (key light) |
| `rimCombat` | DirectionalLight | Rim cool bleu (contre-jour) |
| `heroSpotCombat` | SpotLight | Spot warm focus sur le plateau |

Toutes les quatre sont disposees dans `endCombat()`. Le scene fog (`Scene.FOGMODE_EXP2`, teal-jade, density 0.012) est aussi reset.

## Camera

Trois modes geres par `TacticalCamera` :

### Normal (defaut combat)
- vue tactique 3/4, lecture grid optimale.

### Overview
- recul + tilt accentue pour vision globale (AOE planning).

### Focus (cinematic)
- gros plan sur cible avec post-FX boostes via `ScenePostFX.setCinematicMode(true)`.

`TacticalCamera.onModeChanged` (callback) est branche dans `CombatScene.setupSceneryWithCamera()` pour piloter le mode cinematique post-FX automatiquement.

## MapEditor

L'onglet "Layers" est un placeholder en attendant le `SceneryEditorTab`. La scenery est aujourd'hui authored directement dans `public/data/maps/map_<biome>.json > scenery` ou dans `src/biomes/<biome>Biome.ts`.

Les onglets actifs : `tab-grid`, `tab-props`, `tab-io`, `tab-floor`.

Le panneau "Sol horizontal" edite `SceneGroundLayerConfig` (mode procedural / texture / couleur, repeat, offsets, echelle).

Tout code procedural extrait (`ProceduralComposer.ts`, `MapEditor.patch.ts`, `COMPOSITE_LIBRARY`, `runProceduralGroundProps`) a ete supprime.

## Workflow nouveau biome

1. Creer `src/biomes/<biome>Biome.ts` exportant un `SceneryConfig` typed.
2. Definir `backdrop.gradient` (top/bottom RGB normalises [0..1]) ou `backdrop.image` (chemin relatif a `public/assets/backdrops/`).
3. Lister `props` (positions absolues en coords plateau, `x: 0..16`, `z: 0..12`, plateau centre [8, 0, 6]) en respectant la safe zone combat (`x ∈ [-3..19], z ∈ [-3..15]` exclu).
4. Configurer `postFX` (vignette, bloom, grain, ACES) et `ambient` (count, color, alpha).
5. Optionnellement attacher un `diorama: DioramaConfig` referençant un `.glb` dans `public/assets/dioramas/`. Voir le README de ce dossier pour le workflow Tripo3D / Blender.
6. Referencer le preset dans `public/data/maps/map_<biome>.json > scenery` pour override par map.

## Validation

Avant de livrer une modification sur cette zone, verifier :
- la grid reste lisible et les sprites nets ;
- aucun mesh decor n'est `isPickable = true` (les clics de gameplay doivent passer) ;
- le backdrop n'a pas de bandes noires aux bords (oversize >= 1.2) ;
- le fog ne mange pas le plateau (density <= 0.02) ;
- god rays opt-in si diorama present (eviter double rayons) ;
- props proceduraux opt-out si diorama present (eviter chevauchement) ;
- `endCombat()` dispose tous les managers + les 4 lumieres + reset le fog.
