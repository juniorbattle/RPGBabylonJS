# Plan - Refondation Layers 2.5D Combat BabylonJS

## Objectif

Refonder l'integration des decors 2.5D dans la scene de combat BabylonJS autour d'un contrat 16:9 compose.

Le rendu attendu n'est pas une pile de plans rectangulaires. Il faut donner l'impression que la grid 3D est posee dans la partie basse d'une scene peinte complete, avec des couches qui renforcent la profondeur et une brume qui masque les raccords.

## Architecture

Fichiers principaux :
- `src/rendering/SceneLayerTypes.ts`
- `src/rendering/SceneLayerManager.ts`
- `src/biomes/magicalForestLayers.ts`
- `src/combat/CombatScene.ts`
- `src/editor/MapEditor.ts`
- `src/editor/MapEditorLayersTab.ts`

`src/combat/BiomeLayerSystem.ts` reste une facade de compatibilite temporaire.

## Contrat de Layers

Layers obligatoires :
- `background`
- `midground`
- `platform_blend_fog`
- `foreground_frame`
- `fx_overlay`

Ordre visuel :
1. background
2. midground
3. platform blend fog behind
4. grid 3D
5. characters
6. foreground frame
7. fx overlay
8. UI

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
- ne plus dependre du vieux ciel/sol procedural quand un set de layers est actif ;
- conserver les particules legeres ;
- ne pas casser selection, deploiement, attaque, AOE, details.

## MapEditor

Objectifs :
- preview 3D directe avec le meme `SceneLayerManager` que le runtime ;
- configuration des 5 layers ;
- export stable des overrides ;
- remplacer les vieux reglages de sol par l'elevation de grid combat ;
- laisser les props disponibles, mais secondaires.

Le controle "Contrat Forest V3" est volontairement non prioritaire pour l'instant, car les definitions d'assets vont etre revues.

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
