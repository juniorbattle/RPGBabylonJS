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
